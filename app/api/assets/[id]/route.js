import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

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
  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can delete assets' }, { status: 403 });
  }

  const admin = createAdminClient();

  // inspections.asset_id is ON DELETE SET NULL, so deleting an asset with
  // inspections on file wouldn't fail at the DB level -- it would silently
  // orphan them back to "no asset" instead. Refuse and make it explicit,
  // same reasoning as the company-delete guard.
  const { count: inspectionCount } = await admin
    .from('inspections')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id);

  if (inspectionCount && inspectionCount > 0) {
    return NextResponse.json(
      { error: 'This asset still has inspections on file. Reassign or delete those first.' },
      { status: 400 }
    );
  }

  const { error } = await admin.from('assets').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
