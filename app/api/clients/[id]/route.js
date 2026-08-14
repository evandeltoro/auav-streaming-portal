import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

async function requireStaff(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return { error: 'Only staff can manage clients', status: 403 };
  }
  return { ok: true };
}

// Revoke a client's access entirely. Deletes the auth.users row, which
// cascades (ON DELETE CASCADE on profiles.id) to remove their profile too.
// Company data (inspections, recordings) is scoped by company_id, not by
// this user's id, so nothing else is affected.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const check = await requireStaff(supabase);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!target || target.role !== 'client') {
    return NextResponse.json({ error: 'Can only revoke client accounts' }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Defensive cleanup in case the cascade doesn't fire for some reason --
  // harmless no-op if the row is already gone.
  await admin.from('profiles').delete().eq('id', id);

  return NextResponse.json({ ok: true });
}
