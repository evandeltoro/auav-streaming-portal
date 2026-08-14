import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Toggles whether a client user is in the pool of "registered surveyors"
// for their company -- the pool that populates the surveyor dropdown on
// inspection creation and reassignment. Keeps that dropdown limited to
// people staff have actually vetted, instead of every client user.
export async function PATCH(request, { params }) {
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

  const body = await request.json();
  const isRegisteredSurveyor = !!body.is_registered_surveyor;

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!target || target.role !== 'client') {
    return NextResponse.json({ error: 'Can only set this on client accounts' }, { status: 400 });
  }

  const { error } = await admin
    .from('profiles')
    .update({ is_registered_surveyor: isRegisteredSurveyor })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, is_registered_surveyor: isRegisteredSurveyor });
}
