import { Building2, CalendarClock, Radio } from 'lucide-react';
import { createClient } from '../lib/supabase/server';
import { withPageError, assertNoError } from '../lib/withPageError';
import InspectionList from '../components/InspectionList';
import NewInspectionForm from '../components/NewInspectionForm';

export default async function HomePage() {
  return withPageError(HomePageInner);
}

async function HomePageInner() {
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

  const { data: rawInspections, error: inspectionsError } = await supabase
    .from('inspections')
    .select('id, site, asset, pilot, inspection_date, status, companies!inspections_company_id_fkey(name)')
    .in('status', ['scheduled', 'live'])
    .order('inspection_date', { ascending: false });
  assertNoError('inspections query', inspectionsError);

  // Live inspections always float to the top, regardless of date.
  const inspections = (rawInspections || []).slice().sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === 'live' ? -1 : 1;
  });

  let companies = [];
  let clients = [];
  if (isStaff) {
    const { data, error: companiesError } = await supabase.from('companies').select('id, name').order('name');
    assertNoError('companies query', companiesError);
    companies = data || [];

    const { data: clientProfiles, error: clientsError } = await supabase
      .from('profiles')
      .select('id, full_name, company_id')
      .eq('role', 'client')
      .eq('is_registered_surveyor', true)
      .order('full_name');
    assertNoError('registered surveyors query', clientsError);
    clients = clientProfiles || [];
  }

  const liveCount = inspections.filter((i) => i.status === 'live').length;
  const scheduledCount = inspections.filter((i) => i.status === 'scheduled').length;

  return (
    <div className="page-wrap">
      <div className="stats-row">
        <div className="stat-card">
          <Radio size={26} />
          <div>
            <div className="stat-value">{liveCount}</div>
            <div className="stat-label">Live now</div>
          </div>
        </div>
        <div className="stat-card">
          <CalendarClock size={26} />
          <div>
            <div className="stat-value">{scheduledCount}</div>
            <div className="stat-label">Scheduled</div>
          </div>
        </div>
        {isStaff && (
          <div className="stat-card">
            <Building2 size={26} />
            <div>
              <div className="stat-value">{companies.length}</div>
              <div className="stat-label">Client companies</div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h1>Inspections</h1>
        <p className="subtitle">
          {isStaff
            ? 'All scheduled and live inspections across every client'
            : 'Your company’s scheduled and live inspections'}
        </p>

        {isStaff && <NewInspectionForm companies={companies} clients={clients} />}

        <InspectionList inspections={inspections} isStaff={isStaff} />
      </div>
    </div>
  );
}
