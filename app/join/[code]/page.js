import { createAdminClient } from '../../../lib/supabase/admin';
import { inviteCodeStatus } from '../../../lib/inviteCode';
import JoinForm from '../../../components/JoinForm';

const INVALID_MESSAGE = {
  not_found: "This invite link isn't valid. Ask whoever sent it for a new one.",
  revoked: 'This invite link has been revoked. Ask whoever sent it for a new one.',
  expired: 'This invite link has expired. Ask whoever sent it for a new one.',
  used_up: 'This invite link has already been used. Ask whoever sent it for a new one.',
  no_service_key: "This portal isn't fully configured yet -- ask an admin to check the server setup.",
};

// Public, no login required -- this is the entire point of a code-based
// invite. Looked up with the service role since there's no session yet to
// scope an RLS-friendly query to; the code itself (re-validated again,
// server-side, when actually redeemed in the API route) is what stands in
// for authorization here, same as any other invite link.
export default async function JoinPage({ params }) {
  const { code } = await params;
  const normalized = (code || '').toUpperCase();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return <InvalidCard message={INVALID_MESSAGE.no_service_key} />;
  }

  const { data: inviteRow } = await admin
    .from('invite_codes')
    .select('id, role, company_id, expires_at, max_uses, use_count, revoked_at, companies(name)')
    .eq('code', normalized)
    .maybeSingle();

  const status = inviteCodeStatus(inviteRow);
  if (status !== 'valid') {
    return <InvalidCard message={INVALID_MESSAGE[status] || INVALID_MESSAGE.not_found} />;
  }

  return (
    <JoinForm
      code={normalized}
      role={inviteRow.role}
      companyName={inviteRow.companies?.name || null}
    />
  );
}

function InvalidCard({ message }) {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>Invite link not valid</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>{message}</p>
      </div>
    </div>
  );
}
