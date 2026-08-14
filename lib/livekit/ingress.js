import { IngressClient, IngressInput } from 'livekit-server-sdk';
import { LIVEKIT_URL } from '../supabase/config';

function httpHost() {
  return LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
}

function getIngressClient() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server');
  }
  return new IngressClient(httpHost(), apiKey, apiSecret);
}

// Creates a dedicated WHIP ingress for one inspection's room. Every
// inspection gets its own unique OBS Server URL + Stream Key -- no more
// hand-matching a shared "test-room" ingress to the right job.
export async function createInspectionIngress(roomName, inspectionId) {
  const client = getIngressClient();
  const info = await client.createIngress(IngressInput.WHIP_INPUT, {
    name: `inspection-${inspectionId}`,
    roomName,
    participantIdentity: `obs-${inspectionId}`,
    participantName: 'Field Camera',
  });
  return {
    ingressId: info.ingressId,
    whipUrl: info.url,
    streamKey: info.streamKey,
  };
}
