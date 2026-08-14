import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';

// Assigns or reassigns which company a client user belongs to -- separate
// from the invite flow so it also covers clients who ended up with no
// company_id (e.g. an invite whose company assignment failed, or any other
// gap) and need to be fixed up after the fact, from a single registry view.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: staffProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (staffProfile?.role !== 'admin' && staffProfile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can manage clients' }, { status: 403 });
  }

  const body = await request.json();
  const company_id = body.company_id || null;

  const admin = createAdminClient();

  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
  if (!target || target.role !== 'client') {
    return NextResponse.json({ error: 'Can only assign a company to client accounts' }, { status: 400 });
  }

  if (company_id) {
    const { data: company } = await admin.from('companies').select('id').eq('id', company_id).maybeSingle();
    if (!company) {
      return NextResponse.json({ error: 'That company does not exist' }, { status: 400 });
    }
  }

  const { error } = await admin.from('profiles').update({ company_id }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, company_id });
}
