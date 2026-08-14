'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox } from 'lucide-react';

const STATUS_LABEL = {
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_CLASS = {
  scheduled: 'waiting',
  live: 'live',
  completed: 'offline',
  archived: 'offline',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectionList({ inspections, isStaff }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');

  async function setStatus(id, status) {
    setBusyId(id);
    await fetch(`/api/inspections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function deleteInspection(id, site) {
    if (
      !window.confirm(
        `Permanently delete "${site}"? This removes the recording, chat, and viewer history too -- clients will no longer see it. This can't be undone.`
      )
    ) {
      return;
    }
    setBusyId(id);
    const res = await fetch(`/api/inspections/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete');
      return;
    }
    router.refresh();
  }

  if (!inspections || inspections.length === 0) {
    return (
      <div className="archive-empty">
        <Inbox size={28} strokeWidth={1.5} />
        <span>Nothing here yet.</span>
      </div>
    );
  }

  const companyNames = Array.from(
    new Set(inspections.map((i) => i.companies?.name).filter(Boolean))
  ).sort();

  const filtered = inspections.filter((i) => {
    const haystack = `${i.site} ${i.asset || ''} ${i.pilot || ''}`.toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesCompany = companyFilter === 'all' || i.companies?.name === companyFilter;
    return matchesSearch && matchesCompany;
  });

  return (
    <div>
      {(inspections.length > 1 || companyNames.length > 1) && (
        <div className="list-filter-row">
          <input
            className="list-filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by site, asset, or pilot..."
          />
          {isStaff && companyNames.length > 1 && (
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">All companies</option>
              {companyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="archive-empty">
          <Inbox size={28} strokeWidth={1.5} />
          <span>No inspections match your filters.</span>
        </div>
      ) : (
        <div className="archive-list">
          {filtered.map((i) => (
        <div className="archive-item" key={i.id}>
          <a href={`/inspection/${i.id}`}>
            <strong>{i.site}</strong>
            <div className="meta-line">
              <span>{i.asset || 'Inspection'}</span>
              <span>· {formatDate(i.inspection_date)}</span>
              {i.pilot && <span>· Pilot: {i.pilot}</span>}
              {i.companies?.name && <span className="company-chip">· {i.companies.name}</span>}
            </div>
          </a>

          <span className={`status-pill ${STATUS_CLASS[i.status]}`}>
            <span className="status-dot" />
            {STATUS_LABEL[i.status]}
          </span>

          {isStaff && (
            <div className="row-actions">
              {i.status !== 'live' && i.status !== 'completed' && i.status !== 'archived' && (
                <button
                  className="small-btn go-live"
                  disabled={busyId === i.id}
                  onClick={() => setStatus(i.id, 'live')}
                >
                  {busyId === i.id && <span className="spinner dark" />}
                  Go Live
                </button>
              )}
              {i.status === 'live' && (
                <button
                  className="small-btn end-live"
                  disabled={busyId === i.id}
                  onClick={() => setStatus(i.id, 'completed')}
                >
                  {busyId === i.id && <span className="spinner dark" />}
                  End Stream
                </button>
              )}
              {(i.status === 'completed' || i.status === 'archived') && i.status !== 'archived' && (
                <button
                  className="small-btn"
                  disabled={busyId === i.id}
                  onClick={() => setStatus(i.id, 'archived')}
                >
                  {busyId === i.id && <span className="spinner dark" />}
                  Archive
                </button>
              )}
              <button
                className="small-btn end-live"
                disabled={busyId === i.id}
                onClick={() => deleteInspection(i.id, i.site)}
              >
                {busyId === i.id && <span className="spinner dark" />}
                Delete
              </button>
            </div>
          )}
        </div>
          ))}
        </div>
      )}
    </div>
  );
}
