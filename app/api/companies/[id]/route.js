import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Matches the companies_write_admin_only RLS policy -- only admins can
// delete companies, same as creating them.
export async function DELETE(request, { params }) {
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
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete companies' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Refuse rather than orphan: profiles.company_id is ON DELETE SET NULL,
  // which would silently strip access from any client still assigned here.
  // Make them use Remove Access first so it's an explicit choice.
  const { count: clientCount } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('role', 'client');

  if (clientCount && clientCount > 0) {
    return NextResponse.json(
      { error: 'This company still has client users. Remove their access first, then delete the company.' },
      { status: 400 }
    );
  }

  // inspections.company_id is ON DELETE RESTRICT, so this would fail at the
  // DB level anyway -- checked here first for a clear message instead of a
  // raw foreign-key error.
  const { count: inspectionCount } = await admin
    .from('inspections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id);

  if (inspectionCount && inspectionCount > 0) {
    return NextResponse.json(
      { error: 'This company still has inspections on file. Delete those first, then delete the company.' },
      { status: 400 }
    );
  }

  const { error } = await admin.from('companies').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
