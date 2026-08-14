import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

const ALLOWED_ROLES = ['admin', 'inspector'];

// Admin-only: invite a coworker as staff (admin or inspector). Mirrors the
// client invite flow (app/api/clients/invite/route.js) -- Supabase's
// inviteUserByEmail creates the auth.users row and our on_auth_user_created
// trigger inserts a bare profiles row (role defaults to 'client'). We then
// bump that row to the chosen staff role via the service role, same pattern
// used to attach a company_id after a client invite. The invited person
// lands on /set-password after accepting and enters their own name there,
// same as every other invite in the app -- only the role differs here.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can invite team members' }, { status: 403 });
  }

  const body = await request.json();
  const email = body.email?.trim();
  const role = body.role;
  const linkOnly = !!body.linkOnly;

  if (!email || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'A valid email and role (admin or inspector) are required' }, { status: 400 });
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
  // back the action_link so it can be shared directly (Slack, text, etc.)
  // instead of relying on an email that may be rate-limited or blocked.
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
            ? 'That email is already registered. Use Resend or Remove Access on the existing team member below instead.'
            : linkError.message,
        },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.from('profiles').update({ role }).eq('id', linked.user.id);

    if (profileError) {
      return NextResponse.json(
        { error: `Link generated, but role assignment failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, userId: linked.user.id, link: linked.properties.action_link });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });

  if (inviteError) {
    const alreadyRegistered = /already registered|already exists/i.test(inviteError.message);
    return NextResponse.json(
      {
        error: alreadyRegistered
          ? 'That email is already registered. Use Resend Invite or Remove Access on the existing team member below instead.'
          : inviteError.message,
      },
      { status: 400 }
    );
  }

  const { error: profileError } = await admin.from('profiles').update({ role }).eq('id', invited.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Invite sent, but role assignment failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
