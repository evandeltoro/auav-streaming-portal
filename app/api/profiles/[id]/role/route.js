import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

const ALLOWED_ROLES = ['client', 'inspector', 'admin'];

async function requireAdmin(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: 'Only admins can change roles', status: 403 };
  }
  return { ok: true, userId: user.id };
}

// General-purpose role changer -- unlike /api/staff/[id] (which only ever
// moves someone between admin and inspector, and only accepts targets that
// are already staff), this accepts ANY current role as the starting point.
// It exists because the invite flow has no way to "convert" an existing
// account: someone who signed up as a client (e.g. under Shell) and needs
// admin access can't be re-invited -- inviteUserByEmail fails on an email
// that's already registered. This is how that gets fixed without a direct
// DB edit.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const check = await requireAdmin(supabase);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await request.json();
  const role = body.role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'role must be client, inspector, or admin' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role, company_id').eq('id', id).single();
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Same guards as /api/staff/[id] PATCH -- demoting an admin (to
  // inspector OR to client) can't be done to yourself or to the last
  // remaining admin, since either would lock the team out of this page
  // entirely with no way back short of a direct DB edit.
  if (target.role === 'admin' && role !== 'admin') {
    if (id === check.userId) {
      return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
    }
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't demote the last remaining admin." }, { status: 400 });
    }
  }

  const patch = { role };

  if (role === 'client') {
    const companyId = body.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'company_id is required when changing someone to client' }, { status: 400 });
    }
    const { data: company } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle();
    if (!company) {
      return NextResponse.json({ error: 'That company was not found' }, { status: 400 });
    }
    patch.company_id = companyId;
    // Becoming a client fresh -- don't carry over a stale surveyor flag
    // from some earlier stint at a different company.
    patch.is_registered_surveyor = false;
  } else {
    // Staff has no company and the surveyor flag is a client-only concept
    // -- both become meaningless (and, left set, confusing to see) once
    // someone is promoted.
    patch.company_id = null;
    patch.is_registered_surveyor = false;
  }

  const { error } = await admin.from('profiles').update(patch).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role });
}
