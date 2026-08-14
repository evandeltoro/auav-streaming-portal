import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { composeFullName } from '../../../../lib/name';

// Self-service name update -- any authenticated user (staff or client) can
// set their own display name. This is what makes chat and the viewer log
// show a real name instead of an email: sender_name is captured from
// profiles.full_name at message-send time, so this is the one place that
// needs to be correct.
export async function PATCH(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const firstName = body.firstName?.trim() || '';
  const lastName = body.lastName?.trim() || '';
  const middleInitial = body.middleInitial?.trim() || '';

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
  }

  const fullName = composeFullName(firstName, middleInitial, lastName);

  const admin = createAdminClient();
  // id comes from the verified session, never from the request body -- a
  // user can only ever update their own row through this endpoint.
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fullName });
}
