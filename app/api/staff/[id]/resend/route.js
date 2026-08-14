import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Same delete-and-reinvite workaround as app/api/clients/[id]/resend/route.js
// -- Supabase's inviteUserByEmail() won't fire again for an email that
// already has an auth.users row, so a still-pending team member is deleted
// and re-invited from scratch with the same role, minting a fresh token and
// a brand new invite email. Confirmed team members are left alone.
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
  if (staffProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can manage team members' }, { status: 403 });
  }

  const requestBody = await request.json().catch(() => ({}));
  const linkOnly = !!requestBody.linkOnly;

  const admin = createAdminClient();

  const { data: profile } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'inspector')) {
    return NextResponse.json({ error: 'Can only resend invites to staff accounts' }, { status: 400 });
  }

  const { data: userRes, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !userRes?.user) {
    return NextResponse.json({ error: 'Could not find that account' }, { status: 404 });
  }

  if (userRes.user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'This team member already set their password. They should use "Forgot password" to sign in.' },
      { status: 400 }
    );
  }

  const email = userRes.user.email;

  const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
  if (deleteErr) {
    return NextResponse.json({ error: `Could not clear the old invite: ${deleteErr.message}` }, { status: 500 });
  }

  const origin = new URL(request.url).origin;

  // linkOnly skips Supabase's built-in mailer -- generateLink still mints a
  // fresh invite token for the freshly re-created user, it just hands back
  // the action_link so it can be shared directly instead of emailed.
  if (linkOnly) {
    const { data: linked, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${origin}/auth/callback` },
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const { error: profileError } = await admin.from('profiles').update({ role: profile.role }).eq('id', linked.user.id);

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
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const { error: profileError } = await admin.from('profiles').update({ role: profile.role }).eq('id', invited.user.id);

  if (profileError) {
    return NextResponse.json(
      { error: `Invite resent, but role assignment failed: ${profileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
