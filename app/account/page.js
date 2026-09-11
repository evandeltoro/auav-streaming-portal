import { createClient } from '../../lib/supabase/server';
import { withPageError, assertNoError } from '../../lib/withPageError';
import AccountNameForm from '../../components/AccountNameForm';
import RestartTourButton from '../../components/RestartTourButton';

export default async function AccountPage() {
  return withPageError(AccountPageInner);
}

async function AccountPageInner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  assertNoError('profile lookup', profileError);

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>My Account</h1>
        <p className="subtitle">
          This name is what shows up in inspection chat and viewer logs, instead of your email
          address.
        </p>
        <AccountNameForm currentName={profile?.full_name || ''} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h1>Portal Walkthrough</h1>
        <p className="subtitle">Replay the guided tour of the sidebar and what each section does.</p>
        <RestartTourButton />
      </div>
    </div>
  );
}
