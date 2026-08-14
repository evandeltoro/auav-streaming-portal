import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import ClientsManager from '../../components/ClientsManager';

export default async function ClientsPage() {
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
  if (!isStaff) {
    redirect('/');
  }

  const { data: companies } = await supabase.from('companies').select('id, name').order('name');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, company_id, is_registered_surveyor')
    .eq('role', 'client');

  // Emails (and confirmation status) live in auth.users, not the public
  // profiles table -- pull them in via the admin client so the client list
  // can show who's who and whether their invite is still pending. Best
  // effort: if the service role key isn't configured, the page still works,
  // just without emails/status next to each name.
  let emailById = {};
  let pendingById = {};
  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      (profiles || []).map((p) => admin.auth.admin.getUserById(p.id).catch(() => null))
    );
    results.forEach((r, i) => {
      if (r?.data?.user?.email) emailById[profiles[i].id] = r.data.user.email;
      pendingById[profiles[i].id] = !r?.data?.user?.email_confirmed_at;
    });
  } catch {
    // no service role key configured -- degrade gracefully
  }

  const clientsByCompany = {};
  (profiles || []).forEach((p) => {
    if (!p.company_id) return;
    if (!clientsByCompany[p.company_id]) clientsByCompany[p.company_id] = [];
    clientsByCompany[p.company_id].push({
      ...p,
      email: emailById[p.id] || null,
      pending: pendingById[p.id] ?? false,
    });
  });

  // Full registry, independent of company assignment -- this is what makes
  // an unassigned or misassigned client (e.g. a company-update call that
  // failed after the invite went out) visible and fixable at all. The
  // per-company view above only ever shows people who already have a
  // company_id set.
  const allClients = (profiles || [])
    .map((p) => ({
      ...p,
      email: emailById[p.id] || null,
      pending: pendingById[p.id] ?? false,
    }))
    .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Clients</h1>
        <p className="subtitle">Manage client companies and invite people to their portal</p>
        <ClientsManager
          companies={companies || []}
          clientsByCompany={clientsByCompany}
          allClients={allClients}
          isAdmin={profile?.role === 'admin'}
        />
      </div>
    </div>
  );
}
