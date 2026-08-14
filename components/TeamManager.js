'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABEL = { admin: 'Admin', inspector: 'Inspector' };

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="cred-row" style={{ marginTop: 8 }}>
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="small-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

function InviteForm({ onDone }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('inspector');
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

    const res = await fetch('/api/staff/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, linkOnly }),
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
    <form className="new-inspection-form" onSubmit={submit} style={{ marginBottom: 18 }}>
      <label>Invite a coworker</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="coworker@auav-us.com"
        required
      />
      <label>Role</label>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="inspector">Inspector -- runs inspections, no team management</option>
        <option value="admin">Admin -- full access, including this Team page</option>
      </select>
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
      {link && (
        <div className="cred-field" style={{ marginTop: 4 }}>
          <label>Invite link -- send this to them yourself</label>
          <CopyField value={link} />
        </div>
      )}
      <div className="error-text">{error}</div>
    </form>
  );
}

function TeamRow({ member, isSelf, onDone }) {
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  async function resend(linkOnly) {
    setError('');
    setBusy(true);
    const res = await fetch(`/api/staff/${member.id}/resend`, {
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
    if (
      !window.confirm(
        `Remove access for ${member.full_name || member.email || 'this team member'}? This can't be undone.`
      )
    ) {
      return;
    }
    setError('');
    setBusy(true);
    const res = await fetch(`/api/staff/${member.id}`, { method: 'DELETE' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to remove access');
      return;
    }
    onDone();
  }

  async function changeRole(nextRole) {
    if (nextRole === member.role) return;
    setError('');
    setRoleBusy(true);
    const res = await fetch(`/api/staff/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = await res.json();
    setRoleBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to change role');
      return;
    }
    onDone();
  }

  return (
    <div className="viewer-history-row" style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'center' }}>
      <div>
        <span className="viewer-history-name">
          {member.full_name || 'Unnamed'} {isSelf ? '(you)' : ''}
        </span>
        {member.email && <span className="viewer-history-when"> · {member.email}</span>}
        {member.pending && (
          <span
            className="status-pill waiting"
            style={{ marginLeft: 8, marginTop: 0, padding: '2px 8px', fontSize: '0.72rem' }}
          >
            <span className="status-dot" />
            Pending
          </span>
        )}
        {error && (
          <div className="error-text" style={{ minHeight: 0, marginTop: 2 }}>
            {error}
          </div>
        )}
        {link && (
          <div style={{ maxWidth: 340 }}>
            <CopyField value={link} />
          </div>
        )}
      </div>
      <select
        value={member.role}
        onChange={(e) => changeRole(e.target.value)}
        disabled={roleBusy}
        style={{ marginBottom: 0, minWidth: 110 }}
      >
        <option value="admin">{ROLE_LABEL.admin}</option>
        <option value="inspector">{ROLE_LABEL.inspector}</option>
      </select>
      <div className="row-actions">
        {member.pending && (
          <button type="button" className="small-btn" disabled={busy} onClick={() => resend(false)}>
            {busy && <span className="spinner dark" />}
            Resend
          </button>
        )}
        {member.pending && (
          <button type="button" className="small-btn" disabled={busy} onClick={() => resend(true)}>
            {busy && <span className="spinner dark" />}
            Copy Link
          </button>
        )}
        <button type="button" className="small-btn end-live" disabled={busy || isSelf} onClick={revoke}>
          {busy && <span className="spinner dark" />}
          Remove
        </button>
      </div>
    </div>
  );
}

export default function TeamManager({ teamMembers, currentUserId }) {
  const router = useRouter();

  function refresh() {
    router.refresh();
  }

  return (
    <div>
      <InviteForm onDone={refresh} />

      {(!teamMembers || teamMembers.length === 0) ? (
        <div className="viewer-empty">No team members yet.</div>
      ) : (
        <div className="viewer-history">
          <div className="viewer-history-title">
            Admins &amp; Inspectors ({teamMembers.length})
          </div>
          <div className="viewer-history-list">
            {teamMembers.map((m) => (
              <TeamRow key={m.id} member={m} isSelf={m.id === currentUserId} onDone={refresh} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
