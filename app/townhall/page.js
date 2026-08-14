import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { withPageError, assertNoError } from '../../lib/withPageError';

// Clients only ever belong to one company, so they get bounced straight into
// their room. Staff have to pick which company's town hall to join.
export default async function TownHallIndex() {
  return withPageError(TownHallIndexInner);
}

async function TownHallIndexInner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single();
  assertNoError('profile lookup', profileError);
  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  if (!isStaff) {
    if (!profile?.company_id) {
      return (
        <div className="page-wrap">
          <div className="card">
            <h1>Town Hall</h1>
            <p className="subtitle">You're not assigned to a company yet -- contact your AUAV rep.</p>
          </div>
        </div>
      );
    }
    redirect(`/townhall/${profile.company_id}`);
  }

  const { data: companies, error: companiesError } = await supabase.from('companies').select('id, name').order('name');
  assertNoError('companies query', companiesError);

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Town Hall</h1>
        <p className="subtitle">Pick a client company to join their town hall room</p>
        {!companies || companies.length === 0 ? (
          <div className="archive-empty">No client companies yet.</div>
        ) : (
          <div className="archive-list">
            {companies.map((c) => (
              <div key={c.id} className="archive-item">
                <strong>{c.name}</strong>
                <a href={`/townhall/${c.id}`} className="small-btn go-live" style={{ textDecoration: 'none' }}>
                  Join
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
