import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '../../../lib/supabase/server';

// The Phase 0 test ingress room stays open to any authenticated user for
// ongoing dev/testing purposes, since it isn't tied to a real inspection row.
const DEV_TEST_ROOM = 'test-room';

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get('room');

  if (!room) {
    return NextResponse.json({ error: 'Missing room' }, { status: 400 });
  }

  if (room !== DEV_TEST_ROOM) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single();

    const isStaff = profile?.role === 'inspector' || profile?.role === 'admin';

    if (!isStaff) {
      const { data: inspection } = await supabase
        .from('inspections')
        .select('id')
        .eq('livekit_room_name', room)
        .eq('company_id', profile?.company_id ?? '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (!inspection) {
        return NextResponse.json(
          { error: 'You are not authorized to view this stream' },
          { status: 403 }
        );
      }
    }
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server' },
      { status: 500 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: user.email,
    ttl: '15m',
  });
  at.addGrant({ roomJoin: true, room, canPublish: false, canSubscribe: true });

  const token = await at.toJwt();

  return NextResponse.json({ token });
}
