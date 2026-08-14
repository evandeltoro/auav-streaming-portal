import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { startRecording, stopRecording } from '../../../../lib/livekit/egress';
import { isFieldCameraConnected } from '../../../../lib/livekit/rooms';

const ALLOWED_STATUSES = ['scheduled', 'live', 'completed', 'archived'];

export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can update inspections' }, { status: 403 });
  }

  const body = await request.json();
  const { status, surveyor_id, open_comms } = body;

  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  if (status === undefined && surveyor_id === undefined && open_comms === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: current } = await supabase
    .from('inspections')
    .select('status, livekit_room_name, egress_id, went_live_at, company_id, surveyor_id')
    .eq('id', id)
    .single();

  if (!current) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Surveyor reassignment (no-show, redo, wrong pick at creation, etc.) --
  // re-verify server-side that whoever's picked is a client user on this
  // inspection's company, same check as at creation time.
  if (surveyor_id !== undefined) {
    if (surveyor_id !== null) {
      const { data: surveyorProfile } = await supabase
        .from('profiles')
        .select('id, role, company_id, is_registered_surveyor')
        .eq('id', surveyor_id)
        .single();

      const registeredOrUnchanged = surveyorProfile?.is_registered_surveyor || surveyor_id === current.surveyor_id;

      if (
        !surveyorProfile ||
        surveyorProfile.role !== 'client' ||
        surveyorProfile.company_id !== current.company_id ||
        !registeredOrUnchanged
      ) {
        return NextResponse.json(
          { error: 'Surveyor must be a registered surveyor belonging to this inspection\'s company' },
          { status: 400 }
        );
      }
    }
  }

  let egressWarning = null;
  const updates = { updated_at: new Date().toISOString() };
  if (status !== undefined) updates.status = status;
  if (surveyor_id !== undefined) updates.surveyor_id = surveyor_id;
  if (open_comms !== undefined) updates.open_comms = !!open_comms;

  // Going live: start a recording -- but only once the field camera has
  // actually connected. Staff can click "Go Live" before OBS has started
  // streaming; calling startRoomCompositeEgress against a room nobody has
  // joined yet either errors or records a blank composite until someone
  // shows up, neither of which is useful. If the camera isn't there yet,
  // skip egress here and leave egress_id null -- the LiveKit webhook's
  // room_started handler picks it up and starts the recording itself the
  // moment OBS actually connects (see app/api/webhooks/livekit/route.js).
  if (status === undefined) {
    // Surveyor-only reassignment or open_comms toggle -- status isn't
    // changing, so none of the egress start/stop logic below applies.
  } else if (status === 'live' && current?.status !== 'live') {
    const cameraConnected = await isFieldCameraConnected(current.livekit_room_name);
    if (!cameraConnected) {
      egressWarning =
        "Marked live, but OBS hasn't connected yet -- recording will start automatically as soon as it does.";
    } else {
      if (!current.went_live_at) {
        updates.went_live_at = new Date().toISOString();
      }
      try {
        updates.egress_id = await startRecording(current.livekit_room_name, id);
        console.log(`[egress] started ${updates.egress_id} for inspection ${id} (room ${current.livekit_room_name})`);
      } catch (err) {
        egressWarning = `Recording did not start: ${err.message}`;
        console.error(`[egress] start failed for inspection ${id}:`, err);
      }
    }
  } else if (current?.status === 'live' && status !== 'live' && current?.egress_id) {
    try {
      await stopRecording(current.egress_id);
      console.log(`[egress] stopped ${current.egress_id} for inspection ${id}`);
    } catch (err) {
      egressWarning = `Recording did not stop cleanly: ${err.message}`;
      console.error(`[egress] stop failed for inspection ${id}:`, err);
    }
  } else {
    console.log(`[egress] no-op for inspection ${id}: prevStatus=${current?.status} newStatus=${status} egressId=${current?.egress_id}`);
  }

  const { data, error } = await supabase
    .from('inspections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inspection: data, egressWarning });
}

// Permanently deletes a stream -- not just hides it from clients. Cascades
// (ON DELETE CASCADE) to messages, viewer_sessions, stream_credentials, the
// recordings row, and stream_health_samples. Recording files in storage
// aren't covered by that cascade, so they're removed here explicitly first
// to avoid leaving orphaned video sitting in the bucket.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can delete inspections' }, { status: 403 });
  }

  const { data: inspection } = await supabase
    .from('inspections')
    .select('status, egress_id')
    .eq('id', id)
    .single();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Stop any in-progress recording first -- otherwise LiveKit keeps writing
  // to an S3 key whose parent inspection row is about to disappear.
  if (inspection.status === 'live' && inspection.egress_id) {
    try {
      await stopRecording(inspection.egress_id);
    } catch {
      // best-effort -- proceed with deletion regardless
    }
  }

  const admin = createAdminClient();

  const { data: recordings } = await admin.from('recordings').select('s3_key').eq('inspection_id', id);
  const keys = (recordings || []).map((r) => r.s3_key).filter(Boolean);
  if (keys.length > 0) {
    try {
      await admin.storage.from('recordings').remove(keys);
    } catch {
      // best-effort -- don't block the delete on storage cleanup failing
    }
  }

  const { error } = await admin.from('inspections').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
