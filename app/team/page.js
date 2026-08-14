import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { withPageError, assertNoError } from '../../lib/withPageError';
import TeamManager from '../../components/TeamManager';

export default async function TeamPage() {
  return withPageError(TeamPageInner);
}

async function TeamPageInner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  assertNoError('profile lookup', profileError);
  if (profile?.role !== 'admin') {
    redirect('/');
  }

  const { data: staffProfiles, error: staffError } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['admin', 'inspector']);
  assertNoError('staff profiles query', staffError);

  // Emails and confirmation status live in auth.users, not profiles -- pull
  // them in via the admin client so the list can show who's who and whether
  // their invite is still pending. Same pattern as the Clients page.
  let emailById = {};
  let pendingById = {};
  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      (staffProfiles || []).map((p) => admin.auth.admin.getUserById(p.id).catch(() => null))
    );
    results.forEach((r, i) => {
      if (r?.data?.user?.email) emailById[staffProfiles[i].id] = r.data.user.email;
      pendingById[staffProfiles[i].id] = !r?.data?.user?.email_confirmed_at;
    });
  } catch {
    // no service role key configured -- degrade gracefully
  }

  const teamMembers = (staffProfiles || [])
    .map((p) => ({
      ...p,
      email: emailById[p.id] || null,
      pending: pendingById[p.id] ?? false,
    }))
    .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Team</h1>
        <p className="subtitle">Manage who has admin or inspector access to the portal</p>
        <TeamManager teamMembers={teamMembers} currentUserId={user.id} />
      </div>
    </div>
  );
}
