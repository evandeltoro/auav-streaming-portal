import { createClient } from '../../lib/supabase/server';
import InspectionList from '../../components/InspectionList';

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, site, asset, pilot, inspection_date, status, companies(name)')
    .in('status', ['completed', 'archived'])
    .order('inspection_date', { ascending: false });

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Archived Streams</h1>
        <p className="subtitle">Recordings scoped to your account automatically</p>
        <InspectionList inspections={inspections} isStaff={isStaff} />
      </div>
    </div>
  );
}
