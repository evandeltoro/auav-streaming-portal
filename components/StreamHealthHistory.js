const QUALITY_ORDER = ['excellent', 'good', 'poor', 'unknown'];
const QUALITY_LABEL = { excellent: 'Excellent', good: 'Good', poor: 'Poor', unknown: 'Unknown' };

function formatWhen(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Turns a flat list of connection-quality samples for the field camera into
// a proportional stacked bar plus a list of when the quality actually
// changed -- gives a data-backed answer to "was it really freezing" instead
// of relying on a manual Starlink-obstruction-screenshot investigation.
export default function StreamHealthHistory({ samples }) {
  if (!samples || samples.length === 0) return null;

  const counts = { excellent: 0, good: 0, poor: 0, unknown: 0 };
  samples.forEach((s) => {
    counts[s.quality] = (counts[s.quality] || 0) + 1;
  });

  const transitions = [];
  let lastQuality = null;
  samples.forEach((s) => {
    if (s.quality !== lastQuality) {
      transitions.push(s);
      lastQuality = s.quality;
    }
  });
  const recentTransitions = transitions.slice(-15).reverse();

  return (
    <div className="viewer-history">
      <div className="viewer-history-title">Field Camera Connection History</div>

      <div className="health-bar">
        {QUALITY_ORDER.filter((q) => counts[q] > 0).map((q) => (
          <div
            key={q}
            className={`health-bar-segment health-${q}`}
            style={{ flexGrow: counts[q] }}
            title={`${QUALITY_LABEL[q]}: ${counts[q]} sample${counts[q] === 1 ? '' : 's'} (${Math.round((counts[q] / samples.length) * 100)}%)`}
          />
        ))}
      </div>

      <div className="health-legend">
        {QUALITY_ORDER.filter((q) => counts[q] > 0).map((q) => (
          <span key={q} className={`health-legend-item health-legend-${q}`}>
            {QUALITY_LABEL[q]} {Math.round((counts[q] / samples.length) * 100)}%
          </span>
        ))}
      </div>

      {recentTransitions.length > 1 && (
        <div className="viewer-history-list" style={{ marginTop: 10 }}>
          {recentTransitions.map((t, i) => (
            <div className="viewer-history-row viewer-history-row-2col" key={`${t.sampled_at}-${i}`}>
              <span className={`quality-chip health-legend-${t.quality}`}>{QUALITY_LABEL[t.quality]}</span>
              <span className="viewer-history-when">{formatWhen(t.sampled_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
