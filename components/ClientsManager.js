'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';

function CopyLinkBox({ link, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="cred-field" style={{ marginTop: 10 }}>
      <label>{label}</label>
      <div className="cred-row">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
        <button type="button" className="small-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

// Static, always-on sign-up link -- no backend call, nothing to generate or
// expire, so nothing about it can break the way the old per-person invite
// links did. Anyone who opens it enters their own name/email/password;
// their account lands as "Unassigned" in the registry below until staff
// picks a company for them.
function SignupLinkBox() {
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  if (!origin) return null;
  return (
    <div className="viewer-history" style={{ marginBottom: 18 }}>
      <div className="viewer-history-title">Sign-Up Link</div>
      <div className="meta-line" style={{ marginBottom: 10 }}>
        Share this with anyone who needs an account -- they enter their own name, email, and
        password. New sign-ups show up as Unassigned in the registry below until you pick their
        company.
      </div>
      <CopyLinkBox link={`${origin}/signup`} label="Link" />
    </div>
  );
}

function InviteForm({ companyId, onDone }) {
  const [email, setEmail] = useState('');
  const [linkOnly, setLinkOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [link, setLink] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    setLink('');

    const res = await fetch('/api/clients/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, company_id: companyId, linkOnly }),
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setError(data.error || 'Failed to invite');
      return;
    }

    setEmail('');
    if (data.link) {
      setLink(data.link);
    } else {
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    }
    onDone();
  }

  return (
    <form className="new-inspection-form" onSubmit={submit} style={{ marginTop: 10, marginBottom: 0 }}>
      <label>
        Invite a client by email -- they&apos;ll enter their own name when they accept (or send
        them the Sign-Up Link above instead)
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@company.com"
        required
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          style={{ width: 'auto', marginBottom: 0 }}
          checked={linkOnly}
          onChange={(e) => setLinkOnly(e.target.checked)}
        />
        Skip email -- give me a link to share myself
      </label>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={sending}>
          {sending && <span className="spinner" />}
          {sending ? 'Sending...' : sent ? 'Invite sent' : linkOnly ? 'Get link' : 'Send invite'}
        </button>
      </div>
      {link && <CopyLinkBox link={link} label="Invite link -- send this to them yourself" />}
      <div className="error-text">{error}</div>
    </form>
  );
}

function ClientRow({ client, onDone }) {
  const [busy, setBusy] = useState(false);
  const [surveyorBusy, setSurveyorBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  async function resend(linkOnly) {
    setError('');
    setBusy(true);
    const res = await fetch(`/api/clients/${client.id}/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkOnly: !!linkOnly }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to resend invite');
      return;
    }
    if (data.link) {
      setLink(data.link);
    }
    onDone();
  }

  async function revoke() {
    if (!window.confirm(`Remove access for ${client.full_name || client.email || 'this client'}? This can't be undone.`)) {
      return;
    }
    setError('');
    setBusy(true);
    const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to remove access');
      return;
    }
    onDone();
  }

  async function toggleSurveyor() {
    setError('');
    setSurveyorBusy(true);
    const res = await fetch(`/api/clients/${client.id}/surveyor`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_registered_surveyor: !client.is_registered_surveyor }),
    });
    const data = await res.json();
    setSurveyorBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to update surveyor status');
      return;
    }
    onDone();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          {client.full_name || 'Unnamed'} {client.email ? `· ${client.email}` : ''}
          {client.pending && (
            <span className="status-pill waiting" style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}>
              <span className="status-dot" />
              Pending
            </span>
          )}
          {client.is_registered_surveyor && (
            <span className="status-pill live" style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}>
              <span className="status-dot" />
              Registered Surveyor
            </span>
          )}
          {error && <div className="error-text" style={{ minHeight: 0, marginTop: 2 }}>{error}</div>}
          {link && (
            <div style={{ maxWidth: 340, marginTop: 4 }}>
              <div className="cred-row">
                <input readOnly value={link} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => navigator.clipboard.writeText(link).catch(() => {})}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="row-actions">
          <button type="button" className="small-btn" disabled={surveyorBusy} onClick={toggleSurveyor}>
            {surveyorBusy && <span className="spinner dark" />}
            {client.is_registered_surveyor ? 'Unregister Surveyor' : 'Register as Surveyor'}
          </button>
          {client.pending && (
            <button type="button" className="small-btn" disabled={busy} onClick={() => resend(false)}>
              {busy && <span className="spinner dark" />}
              Resend Invite
            </button>
          )}
          {client.pending && (
            <button type="button" className="small-btn" disabled={busy} onClick={() => resend(true)}>
              {busy && <span className="spinner dark" />}
              Copy Link
            </button>
          )}
          <button type="button" className="small-btn end-live" disabled={busy} onClick={revoke}>
            {busy && <span className="spinner dark" />}
            Remove Access
          </button>
        </div>
      </div>
    </div>
  );
}

function AllClientsRow({ client, companies, onDone }) {
  const [companyId, setCompanyId] = useState(client.company_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function applyCompany(nextId) {
    setCompanyId(nextId);
    setError('');
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/clients/${client.id}/company`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: nextId || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Failed to assign company');
      setCompanyId(client.company_id || '');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onDone();
  }

  return (
    <div className="viewer-history-row" style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'center' }}>
      <div>
        <span className="viewer-history-name">{client.full_name || 'Unnamed'}</span>
        {client.email && <span className="viewer-history-when"> · {client.email}</span>}
        {client.pending && (
          <span className="status-pill waiting" style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}>
            <span className="status-dot" />
            Pending
          </span>
        )}
        {!client.pending && (
          <span className="status-pill live" style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}>
            <span className="status-dot" />
            Registered
          </span>
        )}
        {client.is_registered_surveyor && (
          <span className="status-pill live" style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}>
            <span className="status-dot" />
            Surveyor
          </span>
        )}
        {error && <div className="error-text" style={{ minHeight: 0, marginTop: 2 }}>{error}</div>}
      </div>
      <select
        value={companyId}
        onChange={(e) => applyCompany(e.target.value)}
        disabled={saving}
        style={{ marginBottom: 0, minWidth: 200 }}
      >
        <option value="">-- Unassigned --</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
        {saving && <span className="spinner dark" />}
        {!saving && saved && 'Saved'}
      </span>
    </div>
  );
}

function AllClientsRegistry({ allClients, companies, onDone }) {
  if (!allClients || allClients.length === 0) {
    return (
      <div className="viewer-history">
        <div className="viewer-history-title">All Registered Clients</div>
        <div className="viewer-empty">No client accounts yet -- invite someone below.</div>
      </div>
    );
  }
  const unassignedCount = allClients.filter((c) => !c.company_id).length;
  return (
    <div className="viewer-history">
      <div className="viewer-history-title">
        All Registered Clients ({allClients.length}){unassignedCount > 0 ? ` -- ${unassignedCount} unassigned` : ''}
      </div>
      <div className="viewer-history-list">
        {allClients.map((c) => (
          <AllClientsRow key={c.id} client={c} companies={companies} onDone={onDone} />
        ))}
      </div>
    </div>
  );
}

function NewCompanyForm({ onDone }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to create company');
      return;
    }

    setName('');
    onDone();
  }

  return (
    <form className="new-inspection-form" onSubmit={handleSubmit}>
      <label>New client company</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Company name"
        required
      />
      <div className="form-actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving && <span className="spinner" />}
          {saving ? 'Creating...' : 'Create company'}
        </button>
      </div>
      <div className="error-text">{error}</div>
    </form>
  );
}

export default function ClientsManager({ companies, clientsByCompany, allClients, isAdmin }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState({});

  function refresh() {
    router.refresh();
  }

  async function deleteCompany(id, name) {
    if (!window.confirm(`Delete "${name}"? This can't be undone. You'll need to remove its client users first.`)) {
      return;
    }
    setDeletingId(id);
    setDeleteError((prev) => ({ ...prev, [id]: '' }));
    const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeletingId(null);
    if (!res.ok) {
      setDeleteError((prev) => ({ ...prev, [id]: data.error || 'Failed to delete company' }));
      return;
    }
    refresh();
  }

  return (
    <div>
      <SignupLinkBox />

      <AllClientsRegistry allClients={allClients || []} companies={companies} onDone={refresh} />

      {isAdmin && <NewCompanyForm onDone={refresh} />}

      {companies.length === 0 && (
        <div className="archive-empty">
          <Building2 size={28} strokeWidth={1.5} />
          <span>No client companies yet{isAdmin ? ' -- create one above.' : '.'}</span>
        </div>
      )}

      <div className="archive-list">
        {companies.map((company) => {
          const clients = clientsByCompany[company.id] || [];
          return (
            <div className="archive-item" key={company.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <strong>{company.name}</strong>
                {isAdmin && (
                  <button
                    type="button"
                    className="small-btn end-live"
                    disabled={deletingId === company.id}
                    onClick={() => deleteCompany(company.id, company.name)}
                  >
                    {deletingId === company.id && <span className="spinner dark" />}
                    Delete Company
                  </button>
                )}
              </div>
              {deleteError[company.id] && (
                <div className="error-text" style={{ minHeight: 0, marginTop: 2 }}>{deleteError[company.id]}</div>
              )}

              {clients.length === 0 ? (
                <div className="meta-line">No client users yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {clients.map((c) => (
                    <ClientRow key={c.id} client={c} onDone={refresh} />
                  ))}
                </div>
              )}

              <InviteForm companyId={company.id} onDone={refresh} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
