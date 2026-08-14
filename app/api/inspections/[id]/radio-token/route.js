import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '../../../../../lib/supabase/server';

// Voice comms live in a separate LiveKit room from the video stream --
// `{livekit_room_name}-radio` -- so this token is never handed out for the
// main viewing room and the recorded egress (which only ever touches the
// main room) can't pick up any of this audio even by accident.
//
// Access is the actual security boundary here, not the UI: a client user
// only gets a token if they're the specific surveyor assigned to this
// inspection. Every other viewer -- including other client users at the
// same company just watching the stream -- gets a 403 and never sees a
// join control that would work anyway.
export async function GET(request, { params }) {
  const { id } = await params;
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

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, status, livekit_room_name, surveyor_id, open_comms')
    .eq('id', id)
    .maybeSingle();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Comms don't depend on the video being live -- available as soon as the
  // inspection exists, off once it's wrapped up.
  if (inspection.status === 'completed' || inspection.status === 'archived') {
    return NextResponse.json({ error: 'This inspection has ended -- voice comms are closed' }, { status: 403 });
  }

  const isAssignedSurveyor = !!inspection.surveyor_id && inspection.surveyor_id === user.id;

  // open_comms is the demo-mode escape hatch (set from the inspection page,
  // staff-only toggle) -- with it on, anyone who can already load this
  // inspection (RLS still scopes that to staff or same-company clients) can
  // join voice comms, not just the single assigned surveyor. Defaults to
  // false so field jobs stay on the normal one-seat model.
  if (!isStaff && !isAssignedSurveyor && !inspection.open_comms) {
    return NextResponse.json(
      { error: 'Voice comms on this inspection are reserved for the assigned surveyor' },
      { status: 403 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'LIVEKIT_API_KEY / LIVEKIT_API_SECRET not configured on the server' },
      { status: 500 }
    );
  }

  const radioRoom = `${inspection.livekit_room_name}-radio`;
  const identity = isStaff ? `radio-${user.id}` : isAssignedSurveyor ? `surveyor-${user.id}` : `guest-${user.id}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: user.email,
    ttl: '15m',
  });
  at.addGrant({ roomJoin: true, room: radioRoom, canPublish: true, canSubscribe: true });

  const token = await at.toJwt();

  return NextResponse.json({ token, room: radioRoom });
}
