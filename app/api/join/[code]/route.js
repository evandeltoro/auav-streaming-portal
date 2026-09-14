import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { inviteCodeStatus } from '../../../../lib/inviteCode';
import { composeFullName } from '../../../../lib/name';

// No authenticated caller here by design -- this is how someone with no
// account yet turns a code into one. The code itself, re-validated
// server-side against the same rules the join page used to decide what to
// render, is the entire authorization check.
export async function POST(request, { params }) {
  const { code } = await params;
  const body = await request.json();
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const email = (body.email || '').trim();
  const password = body.password || '';

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { data: inviteRow } = await admin.from('invite_codes').select('*').eq('code', code.toUpperCase()).maybeSingle();
  const status = inviteCodeStatus(inviteRow);
  if (status !== 'valid') {
    const messages = {
      not_found: 'This invite link is not valid. Ask whoever sent it for a new one.',
      revoked: 'This invite link has been revoked. Ask whoever sent it for a new one.',
      expired: 'This invite link has expired. Ask whoever sent it for a new one.',
      used_up: 'This invite link has already been used. Ask whoever sent it for a new one.',
    };
    return NextResponse.json({ error: messages[status] || 'This invite link is not valid.' }, { status: 400 });
  }

  const full_name = composeFullName(firstName, '', lastName);

  // email_confirm: true -- the invite code is the verification, so this
  // skips Supabase's confirmation email entirely. The whole point of a
  // code-based invite is not depending on an email landing anywhere, and
  // that includes the account-creation step itself, not just the invite.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createError) {
    const alreadyRegistered = /already registered|already exists/i.test(createError.message);
    return NextResponse.json(
      { error: alreadyRegistered ? 'That email already has an account. Try signing in instead.' : createError.message },
      { status: 400 }
    );
  }

  // on_auth_user_created inserts a bare profiles row (role 'client', no
  // company) -- overwrite it with what this specific code grants.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name,
      role: inviteRow.role,
      company_id: inviteRow.role === 'client' ? inviteRow.company_id : null,
    })
    .eq('id', created.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Account created, but role assignment failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  await admin.from('invite_codes').update({ use_count: inviteRow.use_count + 1 }).eq('id', inviteRow.id);

  return NextResponse.json({ ok: true, email });
}
