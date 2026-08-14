import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Supabase's inviteUserByEmail() refuses to run again for an email that
// already has an auth.users row -- there's no built-in "resend" for invites.
// The clean workaround: for a client who never confirmed (never finished
// setting a password), delete the stale unconfirmed user and re-invite the
// same email/company/name from scratch. This mints a fresh token and fires
// a brand new invite email. Confirmed clients are left alone -- resending
// isn't the right tool once they already have a working login.
export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: staffProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (staffProfile?.role !== 'admin' && staffProfile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can manage clients' }, { status: 403 });
  }

  const requestBody = await request.json().catch(() => ({}));
  const linkOnly = !!requestBody.linkOnly;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role, company_id, full_name')
    .eq('id', id)
    .single();

  if (!profile || profile.role !== 'client') {
    return NextResponse.json({ error: 'Can only resend invites to client accounts' }, { status: 400 });
  }

  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !userRes?.user) {
    return NextResponse.json({ error: 'Could not find that account' }, { status: 404 });
  }

  if (userRes.user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'This client already set their password. They should use "Forgot password" to sign in.' },
      { status: 400 }
    );
  }

  const email = userRes.user.email;

  const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
  if (deleteErr) {
    return NextResponse.json({ error: `Could not clear the old invite: ${deleteErr.message}` }, { status: 500 });
  }

  const origin = new URL(request.url).origin;

  // linkOnly skips Supabase's rate-limited built-in mailer -- generateLink
  // still mints a fresh invite token for the freshly re-created user, it
  // just hands back the action_link so staff can send it themselves.
  if (linkOnly) {
    const { data: linked, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: profile.full_name ? { full_name: profile.full_name } : undefined,
        redirectTo: `${origin}/auth/callback`,
      },
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ company_id: profile.company_id, ...(profile.full_name ? { full_name: profile.full_name } : {}) })
      .eq('id', linked.user.id);

    if (profileError) {
      return NextResponse.json(
        { error: `Link generated, but company assignment failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId: linked.user.id, link: linked.properties.action_link });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: profile.full_name ? { full_name: profile.full_name } : undefined,
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ company_id: profile.company_id, ...(profile.full_name ? { full_name: profile.full_name } : {}) })
    .eq('id', invited.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Invite resent, but company assignment failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
