import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { withPageError, assertNoError } from '../../../lib/withPageError';
import TownHall from '../../../components/TownHall';

export default async function TownHallRoom({ params }) {
  return withPageError(() => TownHallRoomInner({ params }));
}

async function TownHallRoomInner({ params }) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role, company_id, full_name').eq('id', user.id).single();
  assertNoError('profile lookup', profileError);
  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  if (!isStaff && profile?.company_id !== companyId) {
    redirect('/townhall');
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, townhall_now_playing_id, townhall_now_playing_by, townhall_now_playing_by_name')
    .eq('id', companyId)
    .maybeSingle();
  assertNoError('company lookup', companyError);

  if (!company) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div className="archive-empty">This company doesn't exist.</div>
        </div>
      </div>
    );
  }

  const { data: inspections, error: inspectionsError } = await supabase
    .from('inspections')
    .select('id, site, asset, status, inspection_date, livekit_room_name, went_live_at')
    .eq('company_id', companyId)
    .order('inspection_date', { ascending: false })
    .limit(50);
  assertNoError('inspections query', inspectionsError);

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>{company.name} Town Hall</h1>
        <p className="subtitle">Everyone registered under {company.name} can join this room, any time</p>
        <TownHall
          companyId={company.id}
          companyName={company.name}
          inspections={inspections || []}
          initialNowPlayingId={company.townhall_now_playing_id}
          initialNowPlayingBy={company.townhall_now_playing_by}
          initialNowPlayingByName={company.townhall_now_playing_by_name}
          currentUserId={user.id}
          currentUserName={profile?.full_name || user.email}
        />
      </div>
    </div>
  );
}
