import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Self-service surveyor assignment on the practice inspection only.
// Real inspections keep surveyor_id staff-only (RLS: inspections_update_
// staff_only), which is why this goes through the admin client rather
// than the RLS-scoped one -- but the is_demo check below is what actually
// keeps this from becoming a backdoor for real jobs: every write here is
// gated on the target row already having is_demo = true, checked with the
// admin client itself so it can't be bypassed by anything upstream.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { inspectionId } = await request.json();
  if (!inspectionId) {
    return NextResponse.json({ error: 'inspectionId is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inspection } = await admin.from('inspections').select('id, is_demo').eq('id', inspectionId).maybeSingle();

  if (!inspection || !inspection.is_demo) {
    return NextResponse.json({ error: 'Not a practice inspection' }, { status: 403 });
  }

  const { error } = await admin.from('inspections').update({ surveyor_id: user.id }).eq('id', inspectionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Only releases the claim if the caller is the one who holds it -- someone
// else's practice run mid-tour shouldn't get yanked out from under them.
export async function DELETE(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { inspectionId } = await request.json();
  if (!inspectionId) {
    return NextResponse.json({ error: 'inspectionId is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inspection } = await admin
    .from('inspections')
    .select('id, is_demo, surveyor_id')
    .eq('id', inspectionId)
    .maybeSingle();

  if (!inspection || !inspection.is_demo) {
    return NextResponse.json({ error: 'Not a practice inspection' }, { status: 403 });
  }

  if (inspection.surveyor_id !== user.id) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.from('inspections').update({ surveyor_id: null }).eq('id', inspectionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
