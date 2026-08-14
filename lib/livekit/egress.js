import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import { LIVEKIT_URL } from '../supabase/config';

function httpHost() {
  // EgressClient needs an https(s) host, not the wss:// url used by browser clients
  return LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://');
}

function getEgressClient() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server');
  }
  return new EgressClient(httpHost(), apiKey, apiSecret);
}

function s3Output(filepath) {
  const accessKey = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secret = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const region = process.env.SUPABASE_S3_REGION || 'us-east-1';
  const bucket = process.env.SUPABASE_S3_BUCKET || 'recordings';

  if (!accessKey || !secret || !endpoint) {
    throw new Error('Supabase S3 storage credentials not configured on the server');
  }

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey,
        secret,
        bucket,
        region,
        endpoint,
        forcePathStyle: true,
      }),
    },
  });
}

// Kicks off a RoomComposite recording of the given room, uploading directly
// to Supabase Storage's S3-compatible endpoint. Returns the egressId, which
// we store on the inspection so we can stop it later and match the webhook
// callback back to the right inspection.
export async function startRecording(roomName, inspectionId) {
  const client = getEgressClient();
  const filepath = `${inspectionId}/${Date.now()}.mp4`;
  const info = await client.startRoomCompositeEgress(roomName, s3Output(filepath));
  return info.egressId;
}

export async function stopRecording(egressId) {
  const client = getEgressClient();
  return client.stopEgress(egressId);
}
