'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { useToast } from './Toast';

// Admin/inspector-only edit for a job's details -- previously the only way
// to fix a typo'd site name or wrong asset was delete + recreate, which also
// threw away chat history, viewer sessions, and OBS credentials. This PATCHes
// the same fields NewInspectionForm sets at creation, minus company (too much
// else keys off it) and surveyor/open_comms (already have their own controls
// on this page).
export default function EditInspectionForm({ inspection, assets }) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    site: inspection.site || '',
    asset: inspection.asset || '',
    asset_id: inspection.asset_id || '',
    pilot: inspection.pilot || '',
    inspection_type: inspection.inspection_type || 'confined_space',
    inspection_date: inspection.inspection_date || '',
    inspection_time: inspection.inspection_time || '',
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch(`/api/inspections/${inspection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to save changes');
      return;
    }

    showToast('Inspection updated', 'success');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="secondary" style={{ marginBottom: 14 }} onClick={() => setOpen(true)}>
        <Pencil size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
        Edit Inspection
      </button>
    );
  }

  return (
    <form className="new-inspection-form" onSubmit={handleSubmit} style={{ marginBottom: 18 }}>
      <label>Site</label>
      <input value={form.site} onChange={(e) => update('site', e.target.value)} required />

      <div className="form-row-split">
        <div>
          <label>Date</label>
          <input type="date" value={form.inspection_date} onChange={(e) => update('inspection_date', e.target.value)} required />
        </div>
        <div>
          <label>Call time (optional)</label>
          <input type="time" value={form.inspection_time} onChange={(e) => update('inspection_time', e.target.value)} />
        </div>
      </div>

      <label>Asset</label>
      {(assets || []).length === 0 ? (
        <div className="meta-line" style={{ marginBottom: 10 }}>
          This client has no registered assets yet -- add one on the Clients page.
        </div>
      ) : (
        <select value={form.asset_id} onChange={(e) => update('asset_id', e.target.value)}>
          <option value="">No specific asset</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}

      <label>Component / Location (optional)</label>
      <input value={form.asset} onChange={(e) => update('asset', e.target.value)} placeholder="e.g. Riser Tower B" />

      <label>Pilot</label>
      <input value={form.pilot} onChange={(e) => update('pilot', e.target.value)} placeholder="Pilot name" />

      <label>Inspection Type</label>
      <select value={form.inspection_type} onChange={(e) => update('inspection_type', e.target.value)}>
        <option value="confined_space">Confined Space (ScoutDI)</option>
        <option value="offshore">Offshore</option>
        <option value="other">Other</option>
      </select>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving && <span className="spinner" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="error-text">{error}</div>
    </form>
  );
}
