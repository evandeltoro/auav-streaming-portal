export default function PageError({ error }) {
  return (
    <div className="page-wrap">
      <div className="card">
        <h1>Page error</h1>
        <p className="subtitle">DIAGNOSTIC: {error?.message || String(error)}</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{error?.stack}</pre>
      </div>
    </div>
  );
}
