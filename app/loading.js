// Next.js shows this automatically while a page's server-side data fetch is
// in flight -- previously navigation just showed a blank gap until the
// Supabase queries in that page's Server Component resolved. Shape mirrors
// the page-wrap/card pattern used everywhere so it reads as "loading this
// page" rather than a flash of an unstyled/different screen.
export default function Loading() {
  return (
    <div className="page-wrap">
      <div className="card">
        <div className="skeleton-block skeleton-title" />
        <div className="skeleton-block skeleton-subtitle" />
        <div className="skeleton-block skeleton-row" />
        <div className="skeleton-block skeleton-row" />
        <div className="skeleton-block skeleton-row" style={{ marginBottom: 0 }} />
      </div>
    </div>
  );
}
