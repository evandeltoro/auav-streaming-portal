'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountNameForm({ currentName }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    const res = await fetch('/api/account/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, middleInitial, lastName }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to save');
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    router.refresh();
  }

  return (
    <div>
      <div className="cred-field" style={{ marginBottom: 18 }}>
        <label>Current display name</label>
        <input readOnly value={currentName || "Not set -- your email shows instead"} />
      </div>

      <form className="new-inspection-form" onSubmit={handleSubmit} style={{ marginBottom: 0 }}>
        <label>First Name</label>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          required
        />

        <label>Middle Initial (optional)</label>
        <input
          value={middleInitial}
          onChange={(e) => setMiddleInitial(e.target.value)}
          placeholder="M"
          maxLength={1}
        />

        <label>Last Name</label>
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          required
        />

        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving && <span className="spinner" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save name'}
          </button>
        </div>
        <div className="error-text">{error}</div>
      </form>
    </div>
  );
}
