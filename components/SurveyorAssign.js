'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SurveyorAssign({ inspectionId, currentSurveyorId, currentSurveyorName, clients }) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentSurveyorId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    const res = await fetch(`/api/inspections/${inspectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surveyor_id: selected || null }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to update surveyor');
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    router.refresh();
  }

  const changed = selected !== (currentSurveyorId || '');

  return (
    <div className="viewer-history">
      <div className="viewer-history-title">Surveyor (voice comms access)</div>
      <div className="meta-line" style={{ marginBottom: 10 }}>
        Only this person can join voice comms with the field inspector. Reassign here for a
        no-show or a redo.
      </div>

      {(!clients || clients.length === 0) ? (
        <div className="meta-line">
          This client has no portal users yet -- invite one on the Clients page first.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <option value="">-- No surveyor assigned --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || 'Unnamed client'}
              </option>
            ))}
          </select>
          <button type="button" className="small-btn go-live" disabled={saving || !changed} onClick={handleSave}>
            {saving && <span className="spinner dark" />}
            {saved ? 'Saved' : 'Update Surveyor'}
          </button>
        </div>
      )}

      {!changed && currentSurveyorName && (
        <div className="meta-line" style={{ marginTop: 8 }}>
          Currently assigned: <strong>{currentSurveyorName}</strong>
        </div>
      )}
      {!changed && !currentSurveyorId && (
        <div className="meta-line" style={{ marginTop: 8 }}>
          No surveyor assigned yet -- voice comms won&apos;t be available to any client until one is.
        </div>
      )}

      <div className="error-text">{error}</div>
    </div>
  );
}
