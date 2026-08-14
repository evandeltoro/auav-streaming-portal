import { NextResponse } from 'next/server';
import { WebhookReceiver, EgressStatus } from 'livekit-server-sdk';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { startRecording, stopRecording } from '../../../../lib/livekit/egress';

// LiveKit Cloud calls this endpoint directly (configured in the LiveKit
// dashboard under Settings -> Webhooks). It signs every request with our
// API key/secret, which WebhookReceiver verifies -- this is not a
// user-authenticated route, the signature IS the auth.
export async function POST(request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 });
  }

  const body = await request.text();
  const authHeader = request.headers.get('Authorization') || undefined;

  const receiver = new WebhookReceiver(apiKey, apiSecret);
  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch (err) {
    return NextResponse.json({ error: `Invalid webhook signature: ${err.message}` }, { status: 401 });
  }

  const admin = createAdminClient();

  if (event.event === 'room_started') {
    return handleRoomStarted(admin, event);
  }

  if (event.event === 'room_finished') {
    return handleRoomFinished(admin, event);
  }

  if (event.event === 'egress_ended') {
    return handleEgressEnded(admin, event);
  }

  if (event.event === 'participant_joined') {
    return handleParticipantJoined(admin, event);
  }

  if (event.event === 'participant_left') {
    return handleParticipantLeft(admin, event);
  }

  return NextResponse.json({ ok: true, ignored: event.event });
}

// The field camera (OBS via WHIP ingress) is a real participant too --
// see participantIdentity: `obs-${inspectionId}` in lib/livekit/ingress.js.
// It's a broadcaster, not a viewer, so it's excluded from the viewer log.
function isViewerIdentity(identity) {
  return !!identity && !identity.startsWith('obs-');
}

async function handleParticipantJoined(admin, event) {
  const roomName = event.room?.name;
  const identity = event.participant?.identity;

  if (!roomName || !isViewerIdentity(identity)) {
    return NextResponse.json({ ok: true, skipped: 'not a trackable viewer join' });
  }

  const { data: inspection } = await admin
    .from('inspections')
    .select('id')
    .eq('livekit_room_name', roomName)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ ok: true, skipped: 'no inspection for this room' });
  }

  const { error } = await admin.from('viewer_sessions').insert({
    inspection_id: inspection.id,
    room_name: roomName,
    participant_identity: identity,
    display_name: event.participant?.name || null,
  });

  if (error) {
    console.error(`[webhook] failed to log viewer join for inspection ${inspection.id}:`, error);
  }

  return NextResponse.json({ ok: true });
}

async function handleParticipantLeft(admin, event) {
  const roomName = event.room?.name;
  const identity = event.participant?.identity;

  if (!roomName || !isViewerIdentity(identity)) {
    return NextResponse.json({ ok: true, skipped: 'not a trackable viewer leave' });
  }

  const { data: inspection } = await admin
    .from('inspections')
    .select('id')
    .eq('livekit_room_name', roomName)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ ok: true, skipped: 'no inspection for this room' });
  }

  // Close the most recent still-open session for this viewer in this
  // inspection. Reconnects (flaky wifi, refreshed tab) create a new open
  // session on the next join rather than reopening this one -- fine for a
  // v1 audit log, just means a brief disconnect shows as two rows.
  const { data: openSession } = await admin
    .from('viewer_sessions')
    .select('id')
    .eq('inspection_id', inspection.id)
    .eq('participant_identity', identity)
    .is('left_at', null)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSession) {
    await admin
      .from('viewer_sessions')
      .update({ left_at: new Date().toISOString() })
      .eq('id', openSession.id);
  }

  return NextResponse.json({ ok: true });
}

// A room only ever becomes active in this app when OBS's WHIP ingress
// actually connects -- nothing in our UI joins a room while its inspection
// is still 'scheduled'. So this reliably means "the field camera just went
// live." Auto-flip status and kick off the recording, no button needed.
//
// Also handles the case where staff manually hit "Go Live" *before* OBS
// connected: the PATCH /api/inspections/[id] handler deliberately skips
// starting egress then (nothing to record yet), leaving status='live' but
// egress_id=null. This matches on either 'scheduled' or an already-'live'
// inspection with no egress_id yet, so the recording starts here the moment
// the camera actually shows up either way.
async function handleRoomStarted(admin, event) {
  const roomName = event.room?.name;
  if (!roomName) {
    return NextResponse.json({ ok: true, skipped: 'no room name on room_started event' });
  }

  const { data: inspection } = await admin
    .from('inspections')
    .select('id, status, livekit_room_name, egress_id, went_live_at')
    .eq('livekit_room_name', roomName)
    .in('status', ['scheduled', 'live'])
    .is('egress_id', null)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ ok: true, skipped: 'no inspection needing egress for this room' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (inspection.status === 'scheduled') {
    updates.status = 'live';
  }
  // First time the field camera has actually connected -- this is what the
  // "Live for X:XX" badge counts from. Don't touch it on later reconnects
  // (egress_id is non-null by then, so this whole handler no-ops anyway).
  if (!inspection.went_live_at) {
    updates.went_live_at = new Date().toISOString();
  }

  try {
    updates.egress_id = await startRecording(roomName, inspection.id);
    console.log(`[webhook] room_started -> recording started for inspection ${inspection.id}`);
  } catch (err) {
    console.error(`[webhook] room_started -> recording failed to start for inspection ${inspection.id}:`, err);
  }

  await admin.from('inspections').update(updates).eq('id', inspection.id);

  return NextResponse.json({ ok: true });
}

// Room fully ended (OBS stopped / disconnected). Auto-close the inspection.
// RoomComposite egress stops automatically when the room ends, but we
// call stopEgress defensively anyway -- harmless if it's already stopping.
async function handleRoomFinished(admin, event) {
  const roomName = event.room?.name;
  if (!roomName) {
    return NextResponse.json({ ok: true, skipped: 'no room name on room_finished event' });
  }

  const { data: inspection } = await admin
    .from('inspections')
    .select('id, status, egress_id')
    .eq('livekit_room_name', roomName)
    .eq('status', 'live')
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ ok: true, skipped: 'no live inspection for this room' });
  }

  if (inspection.egress_id) {
    try {
      await stopRecording(inspection.egress_id);
    } catch {
      // likely already stopped by LiveKit automatically when the room ended
    }
  }

  await admin
    .from('inspections')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', inspection.id);

  console.log(`[webhook] room_finished -> auto-completed inspection ${inspection.id}`);

  return NextResponse.json({ ok: true });
}

async function handleEgressEnded(admin, event) {
  const info = event.egressInfo;
  if (!info || info.status !== EgressStatus.EGRESS_COMPLETE) {
    return NextResponse.json({ ok: true, skipped: 'egress did not complete successfully' });
  }

  const fileResult = info.fileResults?.[0];
  if (!fileResult?.filename) {
    return NextResponse.json({ ok: true, skipped: 'no file result on completed egress' });
  }

  const { data: inspection } = await admin
    .from('inspections')
    .select('id')
    .eq('egress_id', info.egressId)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ ok: true, skipped: 'no matching inspection for this egress_id' });
  }

  const { error } = await admin.from('recordings').insert({
    inspection_id: inspection.id,
    s3_key: fileResult.filename,
    duration_seconds: fileResult.duration ? Number(fileResult.duration / 1000000000n) : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
