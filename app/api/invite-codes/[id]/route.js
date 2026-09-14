import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

const STAFF_ROLES = ['admin', 'inspector'];

// Revoke (DELETE, though nothing is actually removed -- revoked_at is set
// so the code stops working but the audit trail of who generated what for
// whom stays intact, same "soft" pattern as everything else access-related
// in this app).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const callerIsStaff = profile?.role === 'admin' || profile?.role === 'inspector';
  if (!callerIsStaff) {
    return NextResponse.json({ error: 'Only staff can revoke invite codes' }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { data: row } = await admin.from('invite_codes').select('id, role').eq('id', id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
  }

  if (STAFF_ROLES.includes(row.role) && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can revoke staff invite codes' }, { status: 403 });
  }

  const { error } = await admin
    .from('invite_codes')
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
