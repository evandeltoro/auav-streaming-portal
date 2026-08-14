'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewInspectionForm({ companies, clients }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    company_id: companies[0]?.id || '',
    site: '',
    asset: '',
    pilot: '',
    inspection_type: 'confined_space',
    surveyor_id: '',
    open_comms: false,
  });

  const surveyorOptions = (clients || []).filter((c) => c.company_id === form.company_id);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateCompany(company_id) {
    // Surveyor list is scoped to the selected company -- reset the pick so
    // we never submit a surveyor that belongs to a different client.
    const nextOptions = (clients || []).filter((c) => c.company_id === company_id);
    setForm((f) => ({ ...f, company_id, surveyor_id: nextOptions[0]?.id || '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const res = await fetch('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to create inspection');
      return;
    }

    setOpen(false);
    setForm({
      company_id: companies[0]?.id || '',
      site: '',
      asset: '',
      pilot: '',
      inspection_type: 'confined_space',
      surveyor_id: '',
      open_comms: false,
    });
    router.refresh();
  }

  if (!open) {
    return (
      <button className="primary" style={{ marginBottom: 18 }} onClick={() => setOpen(true)}>
        + New Inspection
      </button>
    );
  }

  return (
    <form className="new-inspection-form" onSubmit={handleSubmit}>
      <label>Client / Company</label>
      <select value={form.company_id} onChange={(e) => updateCompany(e.target.value)} required>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label>Site</label>
      <input value={form.site} onChange={(e) => update('site', e.target.value)} placeholder="e.g. Gulf Platform 4" required />

      <label>Asset</label>
      <input value={form.asset} onChange={(e) => update('asset', e.target.value)} placeholder="e.g. Riser Tower B" />

      <label>Pilot</label>
      <input value={form.pilot} onChange={(e) => update('pilot', e.target.value)} placeholder="Pilot name" />

      <label>Inspection Type</label>
      <select value={form.inspection_type} onChange={(e) => update('inspection_type', e.target.value)}>
        <option value="confined_space">Confined Space (ScoutDI)</option>
        <option value="offshore">Offshore</option>
        <option value="other">Other</option>
      </select>

      <label>Surveyor (voice comms access)</label>
      {surveyorOptions.length === 0 ? (
        <div className="meta-line" style={{ marginBottom: 10 }}>
          This client has no registered surveyors yet -- register one on the Clients page, then
          assign them here or from the inspection page later.
        </div>
      ) : (
        <select value={form.surveyor_id} onChange={(e) => update('surveyor_id', e.target.value)} required>
          {surveyorOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name || 'Unnamed client'}
            </option>
          ))}
        </select>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          style={{ width: 'auto', marginBottom: 0 }}
          checked={form.open_comms}
          onChange={(e) => update('open_comms', e.target.checked)}
        />
        Open comms to everyone (demo mode -- not for field ops)
      </label>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving && <span className="spinner" />}
          {saving ? 'Creating...' : 'Create Inspection'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="error-text">{error}</div>
    </form>
  );
}
