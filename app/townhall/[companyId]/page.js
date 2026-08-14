import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import TownHall from '../../../components/TownHall';

export default async function TownHallRoom({ params }) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single();
  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  if (!isStaff && profile?.company_id !== companyId) {
    redirect('/townhall');
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, townhall_now_playing_id')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div className="archive-empty">This company doesn't exist.</div>
        </div>
      </div>
    );
  }

  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, site, asset, status, inspection_date, livekit_room_name, went_live_at')
    .eq('company_id', companyId)
    .order('inspection_date', { ascending: false })
    .limit(50);

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
        />
      </div>
    </div>
  );
}
