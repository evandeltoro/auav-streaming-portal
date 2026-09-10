import Link from 'next/link';
import { Boxes, Inbox } from 'lucide-react';
import { createClient } from '../../lib/supabase/server';
import { withPageError, assertNoError } from '../../lib/withPageError';

export default async function AssetsPage() {
  return withPageError(AssetsPageInner);
}

async function AssetsPageInner() {
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

  // RLS (assets_select) already scopes this to the caller's own company for
  // clients and to everything for staff -- no manual company_id filter
  // needed here, same pattern as every other query in this app.
  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select('id, name, company_id, companies!assets_company_id_fkey(name)')
    .order('name');
  assertNoError('assets query', assetsError);

  if (!assets || assets.length === 0) {
    return (
      <div className="page-wrap">
        <div className="card">
          <h1>Assets</h1>
          <p className="subtitle">
            {isStaff ? 'Platforms and rigs across every client' : 'Your company’s platforms and rigs'}
          </p>
          <div className="archive-empty">
            <Inbox size={28} strokeWidth={1.5} />
            <span>
              {isStaff ? 'No assets yet -- add one from the Clients page.' : 'No assets have been set up for your company yet.'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="page-wrap">
        <div className="card">
          <h1>Assets</h1>
          <p className="subtitle">Your company’s platforms and rigs -- dive into one to see its inspections</p>
          <div className="archive-list">
            {assets.map((a) => (
              <Link href={`/assets/${a.id}`} className="archive-item" key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                </div>
                <Boxes size={18} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Staff view: grouped by company, same visual pattern as the Clients page.
  const assetsByCompany = {};
  assets.forEach((a) => {
    const key = a.company_id;
    if (!assetsByCompany[key]) assetsByCompany[key] = { name: a.companies?.name || 'Unassigned', items: [] };
    assetsByCompany[key].items.push(a);
  });

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Assets</h1>
        <p className="subtitle">Platforms and rigs across every client</p>
        <div className="archive-list">
          {Object.entries(assetsByCompany).map(([companyId, group]) => (
            <div className="archive-item archive-item-stacked" key={companyId}>
              <strong>{group.name}</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {group.items.map((a) => (
                  <Link href={`/assets/${a.id}`} key={a.id} className="meta-line" style={{ color: 'var(--text-primary)' }}>
                    {a.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
