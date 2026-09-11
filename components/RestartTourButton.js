'use client';

import { useState } from 'react';
import { useToast } from './Toast';

// Clears profiles.onboarded_at server-side, then does a full hard navigation
// to the dashboard -- the tour reads its starting state from the root
// layout (a Server Component), so a client-side router.refresh() alone
// wouldn't be enough to make it reappear immediately.
export default function RestartTourButton() {
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  async function restart() {
    setBusy(true);
    const res = await fetch('/api/account/onboarding', { method: 'DELETE' });
    if (!res.ok) {
      setBusy(false);
      showToast('Failed to restart the tour', 'error');
      return;
    }
    window.location.href = '/';
  }

  return (
    <button type="button" className="secondary" disabled={busy} onClick={restart}>
      {busy && <span className="spinner dark" />}
      Restart walkthrough
    </button>
  );
}
