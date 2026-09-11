import { Building2, CalendarClock, Radio } from 'lucide-react';
import { createClient } from '../lib/supabase/server';
import { createAdminClient } from '../lib/supabase/admin';
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
    // The practice inspection lives under its own /demo entry point, not
    // mixed into everyone's real job list -- especially important for
    // clients, who'd otherwise see an unexplained "Practice Inspection"
    // from a company they've never heard of.
    .eq('is_demo', false)
    .order('inspection_date', { ascending: false });
  assertNoError('inspections query', inspectionsError);

  // Live inspections always float to the top, regardless of date.
  const inspections = (rawInspections || []).slice().sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === 'live' ? -1 : 1;
  });

  let companies = [];
  let clients = [];
  let assets = [];
  if (isStaff) {
    const { data, error: companiesError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('is_demo', false)
      .order('name');
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

    const { data: assetRows, error: assetsError } = await supabase.from('assets').select('id, name, company_id').order('name');
    assertNoError('assets query', assetsError);
    assets = assetRows || [];
  }

  const liveCount = inspections.filter((i) => i.status === 'live').length;
  const scheduledCount = inspections.filter((i) => i.status === 'scheduled').length;

  // "N watching" + a live camera-quality dot on each live row, so staff and
  // clients alike can tell which stream needs attention without opening
  // it. viewer_sessions/stream_health_samples are staff-only via RLS (same
  // as every other viewer-analytics table in this app), so this reads them
  // through the admin client -- but only ever for the specific live
  // inspection ids already returned by the RLS-scoped query above, meaning
  // a client only ever sees a count/quality for an inspection they were
  // already allowed to see in the first place, never raw session rows.
  let viewerCountByInspection = {};
  let qualityByInspection = {};
  const liveIds = inspections.filter((i) => i.status === 'live').map((i) => i.id);
  if (liveIds.length > 0) {
    try {
      const admin = createAdminClient();

      const { data: openSessions, error: sessionsError } = await admin
        .from('viewer_sessions')
        .select('inspection_id')
        .in('inspection_id', liveIds)
        .is('left_at', null);
      if (sessionsError) console.error('open viewer_sessions query failed:', sessionsError.message);
      (openSessions || []).forEach((s) => {
        viewerCountByInspection[s.inspection_id] = (viewerCountByInspection[s.inspection_id] || 0) + 1;
      });

      const { data: recentSamples, error: samplesError } = await admin
        .from('stream_health_samples')
        .select('inspection_id, quality, sampled_at')
        .in('inspection_id', liveIds)
        .order('sampled_at', { ascending: false })
        .limit(500);
      if (samplesError) console.error('recent stream_health_samples query failed:', samplesError.message);
      (recentSamples || []).forEach((s) => {
        // Rows arrive newest-first -- the first one seen per inspection is
        // its most recent sample, so later duplicates are ignored.
        if (!qualityByInspection[s.inspection_id]) {
          qualityByInspection[s.inspection_id] = s.quality;
        }
      });
    } catch {
      // No service role key configured -- degrade gracefully, rows just
      // won't show a viewer count or quality dot.
    }
  }

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

        {isStaff && <NewInspectionForm companies={companies} clients={clients} assets={assets} />}

        <InspectionList
          inspections={inspections}
          isStaff={isStaff}
          viewerCountByInspection={viewerCountByInspection}
          qualityByInspection={qualityByInspection}
        />
      </div>
    </div>
  );
}
