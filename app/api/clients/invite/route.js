import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request) {
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

  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can invite clients' }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.trim();
  const company_id = body.company_id;
  const linkOnly = !!body.linkOnly;

  if (!email || !company_id) {
    return NextResponse.json({ error: 'email and company_id are required' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const origin = new URL(request.url).origin;

  // linkOnly skips Supabase's built-in mailer entirely -- generateLink still
  // creates the auth.users row and mints a real invite token, it just hands
  // back the action_link so staff can share it directly instead of relying
  // on an email that may be rate-limited or blocked.
  if (linkOnly) {
    const { data: linked, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${origin}/auth/callback` },
    });

    if (linkError) {
      const alreadyRegistered = /already registered|already exists/i.test(linkError.message);
      return NextResponse.json(
        {
          error: alreadyRegistered
            ? 'That email is already registered. Use Resend Invite or Remove Access on the existing client below instead.'
            : linkError.message,
        },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.from('profiles').update({ company_id }).eq('id', linked.user.id);

    if (profileError) {
      return NextResponse.json(
        { error: `Link generated, but company assignment failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId: linked.user.id, link: linked.properties.action_link });
  }

  // Sends Supabase's built-in "invite" email. This creates the auth.users
  // row immediately (unconfirmed) -- our on_auth_user_created trigger fires
  // right away and inserts a bare profiles row (role defaults to 'client',
  // company_id null). The client clicks the emailed link, which Supabase
  // redirects (with session tokens in the URL hash) to /auth/callback,
  // which establishes the session and sends them to /set-password, where
  // they enter their own name and password -- staff no longer types the
  // client's name in on their behalf here.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteError) {
    const alreadyRegistered = /already registered|already exists/i.test(inviteError.message);
    return NextResponse.json(
      {
        error: alreadyRegistered
          ? 'That email is already registered. Use Resend Invite or Remove Access on the existing client below instead.'
          : inviteError.message,
      },
      { status: 400 }
    );
  }

  // Attach the new profile to the right company. Uses the service role so
  // the company-reassignment guard (admin-or-service-role only) doesn't
  // block it -- a client can't grant themselves this via the same column.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ company_id })
    .eq('id', invited.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Invite sent, but company assignment failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
