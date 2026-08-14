import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Anyone in a company's town hall -- staff or a client at that company -- can
// pull up a stream for everyone to watch together. Persisted on the company
// row (not just broadcast) so someone who joins the room after the pick was
// made still sees it, via the same postgres_changes realtime pattern
// ChatBox.js already uses for messages.
export async function PATCH(request, { params }) {
  const { id: companyId } = await params;
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

  if (!isStaff && profile?.company_id !== companyId) {
    return NextResponse.json({ error: 'Not authorized for this company’s town hall' }, { status: 403 });
  }

  const { inspection_id } = await request.json();
  const admin = createAdminClient();

  if (inspection_id) {
    const { data: inspection } = await admin
      .from('inspections')
      .select('id, company_id')
      .eq('id', inspection_id)
      .maybeSingle();

    if (!inspection || inspection.company_id !== companyId) {
      return NextResponse.json({ error: 'That stream does not belong to this company' }, { status: 400 });
    }
  }

  const { error } = await admin
    .from('companies')
    .update({ townhall_now_playing_id: inspection_id || null })
    .eq('id', companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
