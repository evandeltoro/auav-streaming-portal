import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const text = body.body?.trim();

  if (!text) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  const senderName = profile?.full_name || user.email;

  // The RLS insert policy on messages re-checks that this user can actually
  // see this inspection (staff, or client of the same company) -- so this
  // naturally fails for anyone who shouldn't be here, same access rule as
  // viewing the stream itself.
  const { data, error } = await supabase
    .from('messages')
    .insert({ inspection_id: id, sender_id: user.id, sender_name: senderName, body: text })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ message: data });
}
