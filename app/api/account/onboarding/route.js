import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Self-service onboarding-tour state -- same pattern as the name-update
// route: id comes from the verified session, never the request body, so a
// user can only ever mark their own row.
//
// POST marks the tour complete (called when the walkthrough finishes or is
// skipped). DELETE clears it, which is what lets someone replay the tour
// later from My Account.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ onboarded_at: null }).eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
