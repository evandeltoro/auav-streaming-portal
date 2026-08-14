'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Staff-only switch between the two comms access models:
// - Restricted (default, field-ready): only staff + the one assigned
//   surveyor can join voice comms.
// - Open (demo mode): anyone who can already load this inspection page
//   (RLS still scopes that to staff or same-company clients) can join and
//   talk -- useful for a room full of stakeholders on a demo call, not for
//   an actual field job where a single dedicated seat is the point.
export default function CommsModeToggle({ inspectionId, openComms }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setError('');
    setBusy(true);
    const res = await fetch(`/api/inspections/${inspectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_comms: !openComms }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Failed to update comms mode');
      return;
    }
    router.refresh();
  }

  return (
    <div className="viewer-history">
      <div className="viewer-history-title">Comms Access</div>
      <div className="meta-line" style={{ marginBottom: 10 }}>
        {openComms
          ? 'Open -- anyone with access to this inspection can join voice comms. Good for demos, not for field ops.'
          : 'Restricted -- only staff and the assigned surveyor can join voice comms.'}
      </div>
      <button
        type="button"
        className={`small-btn ${openComms ? 'end-live' : 'go-live'}`}
        disabled={busy}
        onClick={toggle}
      >
        {busy && <span className="spinner dark" />}
        {openComms ? 'Restrict to Surveyor Only' : 'Open Comms to Everyone (Demo Mode)'}
      </button>
      <div className="error-text">{error}</div>
    </div>
  );
}
