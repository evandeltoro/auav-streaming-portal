import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

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

  // Matches the companies_write_admin_only RLS policy -- inspectors can
  // invite clients into an existing company, but only admins create
  // new company records.
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can create companies' }, { status: 403 });
  }

  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data, error } = await supabase.from('companies').insert({ name }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}
