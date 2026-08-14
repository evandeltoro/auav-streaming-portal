import { RoomServiceClient } from 'livekit-server-sdk';
import { LIVEKIT_URL } from '../supabase/config';

function httpHost() {
  return LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
}

function getRoomServiceClient() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server');
  }
  return new RoomServiceClient(httpHost(), apiKey, apiSecret);
}

// True once the field camera (OBS via WHIP ingress, identity `obs-{inspectionId}`
// -- see lib/livekit/ingress.js) has actually connected. LiveKit rooms don't
// exist until someone joins them, so listParticipants() on a room nobody has
// joined yet throws a not-found error rather than returning an empty list --
// both cases mean "not ready," so they're treated the same way here.
export async function isFieldCameraConnected(roomName) {
  try {
    const client = getRoomServiceClient();
    const participants = await client.listParticipants(roomName);
    return participants.some((p) => p.identity?.startsWith('obs-'));
  } catch {
    return false;
  }
}
