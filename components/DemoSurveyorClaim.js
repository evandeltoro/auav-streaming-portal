'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';

// On a real inspection, only staff can set surveyor_id (SurveyorAssign.js,
// staff-only). This is the practice-inspection equivalent for everyone
// else: a self-serve way to become "the assigned surveyor" so a client can
// feel the real one-seat comms model from both sides -- assigned and not.
export default function DemoSurveyorClaim({ inspectionId, currentSurveyorId, currentSurveyorName, currentUserId }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const isMe = currentSurveyorId === currentUserId;
  const isSomeoneElse = !!currentSurveyorId && !isMe;

  async function claim() {
    setBusy(true);
    const res = await fetch('/api/inspections/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to claim the surveyor seat', 'error');
      return;
    }
    showToast('You’re now the assigned surveyor for this practice inspection -- try Voice Comms below.', 'success', 6000);
    router.refresh();
  }

  async function release() {
    setBusy(true);
    await fetch('/api/inspections/demo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId }),
    });
    setBusy(false);
    showToast('Released -- comms are locked again until someone claims the seat.', 'success');
    router.refresh();
  }

  return (
    <div className="viewer-history" data-tour-id="demo-claim-surveyor">
      <div className="viewer-history-title">Surveyor Assignment</div>
      <div className="meta-line" style={{ marginBottom: 10 }}>
        On a real job, only the one client assigned as surveyor can join voice comms -- everyone else is locked
        out. Here, you can assign yourself to see both sides.
      </div>

      {isMe ? (
        <div>
          <div className="meta-line" style={{ marginBottom: 10 }}>
            You are the assigned surveyor for this practice inspection.
          </div>
          <button type="button" className="secondary" disabled={busy} onClick={release}>
            {busy && <span className="spinner dark" />}
            Release seat
          </button>
        </div>
      ) : (
        <div>
          {isSomeoneElse && (
            <div className="meta-line" style={{ marginBottom: 10 }}>
              Currently assigned to {currentSurveyorName || 'another practice user'} -- claiming it will take over
              the seat.
            </div>
          )}
          <button type="button" className="primary" disabled={busy} onClick={claim}>
            {busy && <span className="spinner" />}
            Become the Surveyor
          </button>
        </div>
      )}
    </div>
  );
}
