import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '../../../../../lib/supabase/server';

// One standing LiveKit room per client company -- `townhall-{company_id}`.
// Nothing is persisted for this: the room only exists while someone is in
// it, and access is enforced here, not by anything client-side. Staff can
// join any company's room; a client can only join their own company's room.
export async function GET(request, { params }) {
  const { id: companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id, full_name')
    .eq('id', user.id)
    .single();

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  if (!isStaff && profile?.company_id !== companyId) {
    return NextResponse.json({ error: 'Not authorized for this company’s town hall' }, { status: 403 });
  }

  const { data: company } = await supabase.from('companies').select('id, name').eq('id', companyId).maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server' },
      { status: 500 }
    );
  }

  const room = `townhall-${companyId}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.full_name || user.email,
    ttl: '4h',
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();

  return NextResponse.json({ token, room, companyName: company.name });
}
