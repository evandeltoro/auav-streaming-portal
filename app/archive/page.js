import { createClient } from '../../lib/supabase/server';
import { withPageError, assertNoError } from '../../lib/withPageError';
import InspectionList from '../../components/InspectionList';

export default async function ArchivePage() {
  return withPageError(ArchivePageInner);
}

async function ArchivePageInner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  assertNoError('profile lookup', profileError);

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  const { data: inspections, error: inspectionsError } = await supabase
    .from('inspections')
    .select('id, site, asset, pilot, inspection_date, status, companies!inspections_company_id_fkey(name)')
    .in('status', ['completed', 'archived'])
    .order('inspection_date', { ascending: false });
  assertNoError('inspections query', inspectionsError);

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
