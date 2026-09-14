import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { generateInviteCode } from '../../../lib/inviteCode';

const STAFF_ROLES = ['admin', 'inspector'];
// Staff codes are meaningfully higher-risk than client ones (full access to
// every client's data, and the ability to promote/demote other staff), so
// unlike client links these are never standing/reusable -- single use and
// gone in two days whether or not anyone redeems it.
const STAFF_CODE_TTL_MS = 48 * 60 * 60 * 1000;

export async function POST(request) {
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
    return NextResponse.json({ error: 'Only staff can generate invite codes' }, { status: 403 });
  }

  const body = await request.json();
  const role = body.role;
  const company_id = body.company_id || null;

  if (!['client', 'inspector', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'A valid role is required' }, { status: 400 });
  }

  // Same split as the email-invite routes: admin+inspector can invite
  // clients, only admin can invite staff -- a code is just a different
  // delivery mechanism for the same action, not a way around that gate.
  if (STAFF_ROLES.includes(role) && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can generate staff invite codes' }, { status: 403 });
  }

  if (role === 'client' && !company_id) {
    return NextResponse.json({ error: 'company_id is required for a client invite code' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (role === 'client') {
    const { data: companyRow } = await admin.from('companies').select('id').eq('id', company_id).maybeSingle();
    if (!companyRow) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 });
    }
  }

  const isStaffCode = STAFF_ROLES.includes(role);
  const insertRow = {
    role,
    company_id: role === 'client' ? company_id : null,
    created_by: user.id,
    expires_at: isStaffCode ? new Date(Date.now() + STAFF_CODE_TTL_MS).toISOString() : null,
    max_uses: isStaffCode ? 1 : null,
  };

  // Collisions are astronomically unlikely at this code space, but a few
  // retries on the unique constraint costs nothing and makes this airtight.
  let data, error;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    ({ data, error } = await admin.from('invite_codes').insert({ ...insertRow, code }).select().single());
    if (!error || error.code !== '23505') break;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({ ok: true, inviteCode: data, link: `${origin}/join/${data.code}` });
}
