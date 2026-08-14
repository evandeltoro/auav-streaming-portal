import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Lets a Town Hall participant fetch a signed playback URL for an archived
// inspection someone picked to share. Same access rule as the inspection
// detail page: staff see everything, a client only their own company's
// recordings.
export async function GET(request, { params }) {
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
    .select('role, company_id')
    .eq('id', user.id)
    .single();

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';
  const admin = createAdminClient();

  const { data: inspection } = await admin
    .from('inspections')
    .select('id, status, company_id')
    .eq('id', id)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  if (!isStaff && profile?.company_id !== inspection.company_id) {
    return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 });
  }

  if (inspection.status !== 'completed' && inspection.status !== 'archived') {
    return NextResponse.json({ error: 'This stream is not archived yet' }, { status: 400 });
  }

  const { data: recording } = await admin
    .from('recordings')
    .select('s3_key')
    .eq('inspection_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!recording?.s3_key) {
    return NextResponse.json({ error: 'Recording is still processing -- check back in a few minutes' }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage.from('recordings').createSignedUrl(recording.s3_key, 3600);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create a viewable link' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
