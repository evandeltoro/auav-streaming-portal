import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

// Lets a viewer grab the current video frame and drop it straight into
// chat -- e.g. an inspector spots a defect live and wants that exact frame
// flagged for the client, instead of scrubbing the recording afterward.
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const dataUrl = body.image;
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);

  if (!match) {
    return NextResponse.json({ error: 'Expected a base64 image data URL' }, { status: 400 });
  }

  const ext = match[1] === 'png' ? 'png' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  const senderName = profile?.full_name || user.email;

  const admin = createAdminClient();
  const path = `${id}/${Date.now()}-${user.id.slice(0, 8)}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('chat-images')
    .upload(path, buffer, { contentType: `image/${match[1]}`, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Bucket is private -- sign a long-lived URL (7 days) at capture time and
  // store that directly on the message row. Simpler than re-signing on every
  // read, and inspections are short-lived enough that this comfortably
  // outlasts the review window.
  const { data: signed, error: signError } = await admin.storage
    .from('chat-images')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Uploaded, but failed to create a viewable link' }, { status: 500 });
  }

  // The RLS insert policy on messages re-checks that this user can actually
  // see this inspection (staff, or client of the same company) -- same
  // access rule as sending a normal chat message.
  const { data, error } = await supabase
    .from('messages')
    .insert({
      inspection_id: id,
      sender_id: user.id,
      sender_name: senderName,
      body: 'Sent a snapshot from the live feed',
      image_url: signed.signedUrl,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ message: data });
}
