function formatDuration(joinedAt, leftAt) {
  const start = new Date(joinedAt).getTime();
  const end = leftAt ? new Date(leftAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatWhen(joinedAt) {
  return new Date(joinedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ViewerHistory({ sessions }) {
  return (
    <div className="viewer-history">
      <div className="viewer-history-title">Viewer Log</div>
      {!sessions || sessions.length === 0 ? (
        <div className="viewer-empty">No viewers recorded yet.</div>
      ) : (
        <div className="viewer-history-list">
          {sessions.map((s) => (
            <div className="viewer-history-row" key={s.id}>
              <span className="viewer-history-name">{s.display_name || s.participant_identity}</span>
              <span className="viewer-history-when">{formatWhen(s.joined_at)}</span>
              <span className={`viewer-history-duration ${!s.left_at ? 'live' : ''}`}>
                {!s.left_at ? 'Still watching' : formatDuration(s.joined_at, s.left_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
