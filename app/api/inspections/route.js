import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createInspectionIngress } from '../../../lib/livekit/ingress';

function genRoomName() {
  return `insp-${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(request) {
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
    return NextResponse.json({ error: 'Only staff can create inspections' }, { status: 403 });
  }

  const body = await request.json();
  const { company_id, site, asset, pilot, inspection_type, inspection_date, surveyor_id, open_comms } = body;

  if (!company_id || !site) {
    return NextResponse.json({ error: 'company_id and site are required' }, { status: 400 });
  }

  // Defense in depth: the surveyor is the sole person who'll get access to
  // voice comms with the field inspector, so re-verify server-side that
  // whoever was picked is actually a client user on this company -- don't
  // trust the dropdown alone.
  if (surveyor_id) {
    const { data: surveyorProfile } = await supabase
      .from('profiles')
      .select('id, role, company_id, is_registered_surveyor')
      .eq('id', surveyor_id)
      .single();

    if (
      !surveyorProfile ||
      surveyorProfile.role !== 'client' ||
      surveyorProfile.company_id !== company_id ||
      !surveyorProfile.is_registered_surveyor
    ) {
      return NextResponse.json(
        { error: 'Surveyor must be a registered surveyor belonging to the selected company' },
        { status: 400 }
      );
    }
  }

  const roomName = genRoomName();

  const { data, error } = await supabase
    .from('inspections')
    .insert({
      company_id,
      site,
      asset: asset || null,
      pilot: pilot || null,
      inspection_type: inspection_type || null,
      inspection_date: inspection_date || new Date().toISOString().slice(0, 10),
      status: 'scheduled',
      livekit_room_name: roomName,
      created_by: user.id,
      surveyor_id: surveyor_id || null,
      open_comms: !!open_comms,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Give this inspection its own OBS credentials -- a dedicated WHIP
  // ingress means no more matching a shared test room to the right job.
  // If this fails (e.g. LiveKit hiccup), the inspection still exists and
  // can be retried/created manually -- we don't want a LiveKit blip to
  // block scheduling a job.
  let credentialsWarning = null;
  try {
    const admin = createAdminClient();
    const creds = await createInspectionIngress(roomName, data.id);
    await admin.from('stream_credentials').insert({
      inspection_id: data.id,
      ingress_id: creds.ingressId,
      whip_url: creds.whipUrl,
      stream_key: creds.streamKey,
    });
  } catch (err) {
    credentialsWarning = `Inspection created, but OBS credentials failed to provision: ${err.message}`;
    console.error(`[ingress] failed to provision credentials for inspection ${data.id}:`, err);
  }

  return NextResponse.json({ inspection: data, credentialsWarning });
}
