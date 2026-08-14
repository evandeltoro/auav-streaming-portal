import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatWhen(ts) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function EngagementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';
  if (!isStaff) {
    redirect('/');
  }

  // viewer_sessions is staff-read-only via RLS -- pull everything and
  // aggregate here rather than via a view, since the dataset is small
  // enough for a v1 report.
  const { data: sessions } = await supabase
    .from('viewer_sessions')
    .select('participant_identity, joined_at, left_at, inspections(company_id, companies!inspections_company_id_fkey(name))')
    .order('joined_at', { ascending: false })
    .limit(2000);

  const identities = [...new Set((sessions || []).map((s) => s.participant_identity))];
  let roleById = {};
  if (identities.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, role').in('id', identities);
    roleById = Object.fromEntries((profiles || []).map((p) => [p.id, p.role]));
  }

  const byCompany = {};
  (sessions || []).forEach((s) => {
    // Only count actual clients -- a staff member watching a client's
    // inspection shouldn't inflate that client's engagement numbers.
    if (roleById[s.participant_identity] !== 'client') return;

    const companyId = s.inspections?.company_id;
    const companyName = s.inspections?.companies?.name;
    if (!companyId) return;

    if (!byCompany[companyId]) {
      byCompany[companyId] = { name: companyName || 'Unknown company', totalSeconds: 0, viewers: new Set(), sessionCount: 0, lastWatched: null };
    }
    const entry = byCompany[companyId];
    const start = new Date(s.joined_at).getTime();
    const end = s.left_at ? new Date(s.left_at).getTime() : Date.now();
    entry.totalSeconds += Math.max(0, Math.round((end - start) / 1000));
    entry.viewers.add(s.participant_identity);
    entry.sessionCount += 1;
    if (!entry.lastWatched || new Date(s.joined_at) > new Date(entry.lastWatched)) {
      entry.lastWatched = s.joined_at;
    }
  });

  const rows = Object.values(byCompany)
    .map((e) => ({ ...e, viewerCount: e.viewers.size }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Client Engagement</h1>
        <p className="subtitle">Watch time and activity per client company, from actual viewer sessions</p>

        {rows.length === 0 ? (
          <div className="archive-empty">No client viewing activity recorded yet.</div>
        ) : (
          <div className="archive-list">
            {rows.map((r) => (
              <div className="archive-item" key={r.name} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <strong>{r.name}</strong>
                <div className="meta-line">
                  <span>{formatDuration(r.totalSeconds)} total watch time</span>
                  <span>· {r.viewerCount} distinct viewer{r.viewerCount === 1 ? '' : 's'}</span>
                  <span>· {r.sessionCount} session{r.sessionCount === 1 ? '' : 's'}</span>
                  <span>· Last watched {formatWhen(r.lastWatched)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
