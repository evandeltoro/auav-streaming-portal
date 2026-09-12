'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Inbox } from 'lucide-react';
import { useToast } from './Toast';

const STATUS_ACTION_LABEL = { live: 'went live', completed: 'ended', archived: 'archived' };

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

const QUALITY_LABEL = { excellent: 'Excellent', good: 'Good', poor: 'Poor', unknown: 'Unknown' };

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectionList({ inspections, isStaff, viewerCountByInspection = {}, qualityByInspection = {} }) {
  const router = useRouter();
  const showToast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');

  async function setStatus(id, status, site) {
    setBusyId(id);
    let ok = false;
    let errorMsg = 'Failed to update status';
    try {
      const res = await fetch(`/api/inspections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      ok = res.ok;
      if (!ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data.error || errorMsg;
      }
    } catch {
      errorMsg = 'Network error -- the change may not have gone through';
    }
    setBusyId(null);
    if (!ok) {
      showToast(`"${site}": ${errorMsg}`, 'error', 6000);
      return;
    }
    showToast(`"${site}" ${STATUS_ACTION_LABEL[status] || 'updated'}`, 'success');
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
      showToast(data.error || 'Failed to delete', 'error', 6000);
      return;
    }
    showToast(`"${site}" deleted`, 'success');
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

  // Live/scheduled (the Dashboard) render as a card grid -- closer to how
  // Twitch/YouTube present "what's happening now" than a dense list, and
  // it's where the live viewer count/quality dot actually matter at a
  // glance. Completed/archived (the Archive page) stay a list -- once
  // there are dozens of past recordings, scanning a list beats scrolling
  // past big cards for something you're specifically looking for.
  const cardItems = filtered.filter((i) => i.status === 'live' || i.status === 'scheduled');
  const listItems = filtered.filter((i) => i.status === 'completed' || i.status === 'archived');

  function renderActions(i) {
    if (!isStaff) return null;
    return (
      <div className="row-actions">
        {i.status !== 'live' && i.status !== 'completed' && i.status !== 'archived' && (
          <button
            className="small-btn go-live"
            disabled={busyId === i.id}
            onClick={() => setStatus(i.id, 'live', i.site)}
          >
            {busyId === i.id && <span className="spinner dark" />}
            Go Live
          </button>
        )}
        {i.status === 'live' && (
          <button
            className="small-btn end-live"
            disabled={busyId === i.id}
            onClick={() => setStatus(i.id, 'completed', i.site)}
          >
            {busyId === i.id && <span className="spinner dark" />}
            End Stream
          </button>
        )}
        {(i.status === 'completed' || i.status === 'archived') && i.status !== 'archived' && (
          <button className="small-btn" disabled={busyId === i.id} onClick={() => setStatus(i.id, 'archived', i.site)}>
            {busyId === i.id && <span className="spinner dark" />}
            Archive
          </button>
        )}
        <button className="small-btn end-live" disabled={busyId === i.id} onClick={() => deleteInspection(i.id, i.site)}>
          {busyId === i.id && <span className="spinner dark" />}
          Delete
        </button>
      </div>
    );
  }

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
        <>
          {cardItems.length > 0 && (
            <div className="inspection-grid">
              {cardItems.map((i) => (
                <div className={`inspection-card ${i.status === 'live' ? 'is-live' : ''}`} key={i.id}>
                  <Link href={`/inspection/${i.id}`} className="inspection-card-main">
                    <div className="inspection-card-top">
                      <span className={`status-pill ${STATUS_CLASS[i.status]}`}>
                        <span className="status-dot" />
                        {STATUS_LABEL[i.status]}
                      </span>
                      {i.status === 'live' && (
                        <span className="live-row-meta">
                          <span className="live-row-viewers">
                            <Eye size={13} /> {viewerCountByInspection[i.id] || 0}
                          </span>
                          {qualityByInspection[i.id] && (
                            <span
                              className={`quality-dot q-${qualityByInspection[i.id]}`}
                              title={`Field camera: ${QUALITY_LABEL[qualityByInspection[i.id]] || 'Unknown'}`}
                            />
                          )}
                        </span>
                      )}
                    </div>
                    <strong className="inspection-card-title">{i.site}</strong>
                    <div className="meta-line">
                      <span>{i.asset || 'Inspection'}</span>
                      <span>· {formatDate(i.inspection_date)}</span>
                      {i.pilot && <span>· Pilot: {i.pilot}</span>}
                      {i.companies?.name && <span className="company-chip">· {i.companies.name}</span>}
                    </div>
                  </Link>
                  {renderActions(i)}
                </div>
              ))}
            </div>
          )}

          {listItems.length > 0 && (
            <div className="archive-list" style={{ marginTop: cardItems.length > 0 ? 16 : 0 }}>
              {listItems.map((i) => (
                <div className="archive-item" key={i.id}>
                  <Link href={`/inspection/${i.id}`}>
                    <strong>{i.site}</strong>
                    <div className="meta-line">
                      <span>{i.asset || 'Inspection'}</span>
                      <span>· {formatDate(i.inspection_date)}</span>
                      {i.pilot && <span>· Pilot: {i.pilot}</span>}
                      {i.companies?.name && <span className="company-chip">· {i.companies.name}</span>}
                    </div>
                  </Link>

                  <span className={`status-pill ${STATUS_CLASS[i.status]}`}>
                    <span className="status-dot" />
                    {STATUS_LABEL[i.status]}
                  </span>

                  {renderActions(i)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
