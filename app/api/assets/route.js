import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// Assets (the physical rig/platform/FPSO -- e.g. "Turritella FPSO",
// "Auger Rig") sit one level above inspections, scoped to a company. Staff
// create them here; clients only ever read them (RLS: assets_select).
// Matches the inspections write policy (admin or inspector), not the
// stricter admin-only companies policy, since day-to-day ops staff need to
// be able to stand up a new asset without an admin in the loop.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && profile?.role !== 'inspector') {
    return NextResponse.json({ error: 'Only staff can create assets' }, { status: 403 });
  }

  const body = await request.json();
  const name = body.name?.trim();
  const company_id = body.company_id;

  if (!name || !company_id) {
    return NextResponse.json({ error: 'name and company_id are required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('assets').insert({ name, company_id }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ asset: data });
}
