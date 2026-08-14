import { createClient } from '../../lib/supabase/server';
import AccountNameForm from '../../components/AccountNameForm';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

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
    </div>
  );
}
