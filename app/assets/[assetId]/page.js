import { notFound } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { withPageError, assertNoError } from '../../../lib/withPageError';
import InspectionList from '../../../components/InspectionList';

export default async function AssetDetailPage({ params }) {
  const { assetId } = await params;
  return withPageError(() => AssetDetailPageInner(assetId));
}

async function AssetDetailPageInner(assetId) {
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

  // RLS (assets_select) scopes this to the caller's own company for
  // clients -- a client hitting another company's asset id gets no row
  // back here, same as .single() returning null, so notFound() below is
  // also the access-control boundary, not just a 404 for typos.
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, name, company_id, companies!assets_company_id_fkey(name)')
    .eq('id', assetId)
    .maybeSingle();
  assertNoError('asset lookup', assetError);

  if (!asset) {
    notFound();
  }

  const { data: inspections, error: inspectionsError } = await supabase
    .from('inspections')
    .select('id, site, asset, pilot, inspection_date, status, companies!inspections_company_id_fkey(name)')
    .eq('asset_id', assetId)
    .order('inspection_date', { ascending: false });
  assertNoError('inspections query', inspectionsError);

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>{asset.name}</h1>
        <p className="subtitle">
          {isStaff && asset.companies?.name ? `${asset.companies.name} · ` : ''}
          Inspections on this asset only
        </p>
        <InspectionList inspections={inspections} isStaff={isStaff} />
      </div>
    </div>
  );
}
