import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

const ALLOWED_QUALITIES = ['excellent', 'good', 'poor', 'unknown'];

// Any viewer's browser can report a connection-quality sample for the field
// camera -- LiveKit computes that quality server-side from the publisher's
// actual uplink, so it's the same value for everyone watching, regardless of
// whose network is doing the reporting. This turns "client says it froze"
// into a stored history instead of a one-off manual investigation.
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Reuses the same access rule as viewing the stream/chat -- inspections_select
  // RLS only returns a row if this user is staff or a client of the same company.
  const { data: inspection } = await supabase.from('inspections').select('id').eq('id', id).maybeSingle();
  if (!inspection) {
    return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 });
  }

  const body = await request.json();
  const quality = ALLOWED_QUALITIES.includes(body.quality) ? body.quality : 'unknown';
  const participantIdentity = (body.participantIdentity || '').trim();

  if (!participantIdentity) {
    return NextResponse.json({ error: 'participantIdentity is required' }, { status: 400 });
  }

  // viewer_sessions and stream_health_samples are both staff-read-only, no
  // insert policy at all -- writes always go through the admin client, same
  // pattern as the LiveKit webhook.
  const admin = createAdminClient();
  const { error } = await admin.from('stream_health_samples').insert({
    inspection_id: id,
    participant_identity: participantIdentity,
    quality,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
