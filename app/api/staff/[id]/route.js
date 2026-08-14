import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

const ALLOWED_ROLES = ['admin', 'inspector'];

async function requireAdmin(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: 'Only admins can manage team members', status: 403 };
  }
  return { ok: true, userId: user.id };
}

// Change a team member's role between admin and inspector. Blocks an admin
// from demoting themselves or demoting the last remaining admin -- either
// one would lock the team out of this page (and out of inviting/removing
// staff at all) with no way back in short of a direct DB edit.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const check = await requireAdmin(supabase);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await request.json();
  const role = body.role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'role must be admin or inspector' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!target || (target.role !== 'admin' && target.role !== 'inspector')) {
    return NextResponse.json({ error: 'Can only change the role of staff accounts' }, { status: 400 });
  }

  if (target.role === 'admin' && role !== 'admin') {
    if (id === check.userId) {
      return NextResponse.json({ error: "You can't demote your own account." }, { status: 400 });
    }
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't demote the last remaining admin." }, { status: 400 });
    }
  }

  const { error } = await admin.from('profiles').update({ role }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role });
}

// Revoke a team member's access entirely. Deletes the auth.users row, which
// cascades (ON DELETE CASCADE on profiles.id) to remove their profile too.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const check = await requireAdmin(supabase);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  if (id === check.userId) {
    return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!target || (target.role !== 'admin' && target.role !== 'inspector')) {
    return NextResponse.json({ error: 'Can only remove staff accounts' }, { status: 400 });
  }

  if (target.role === 'admin') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't remove the last remaining admin." }, { status: 400 });
    }
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
