import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Live Dashboard-card thumbnails, piggybacked on whoever's already watching
// -- LiveVideo.js runs a quiet ~60s timer that grabs a canvas frame (same
// technique as the manual snapshot-to-chat button) and posts it here. No
// new video infrastructure: this only ever works because a real browser is
// already decoding the stream, which is also why it goes stale once nobody
// is watching -- an acceptable tradeoff against the alternative (a headless
// browser bot joining every live room on a cron, which is real ongoing
// infra and cost for a "nice to have").
//
// One fixed object per inspection (`{id}.jpg`, upsert) in a private bucket
// -- there's no messages-style row to lean on for access control here, so
// this checks access itself via the RLS-scoped client before writing.
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // inspections_select RLS already scopes this to staff or the caller's
  // own company (or is_demo) -- getting a row back here IS the access
  // check, same pattern as the inspection detail page itself.
  const { data: inspection } = await supabase.from('inspections').select('id, status').eq('id', id).maybeSingle();
  if (!inspection) {
    return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 });
  }
  if (inspection.status !== 'live') {
    // Harmless no-op -- the timer that calls this stops shortly after the
    // client notices the stream ended, so an occasional late-arriving
    // request landing just after isn't worth treating as an error.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const body = await request.json();
  const dataUrl = body.image;
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'Expected a base64 JPEG data URL' }, { status: 400 });
  }

  const buffer = Buffer.from(match[1], 'base64');
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from('thumbnails')
    .upload(`${id}.jpg`, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
