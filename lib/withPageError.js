import PageError from '../components/PageError';

// Next's redirect()/notFound() work by throwing a special error whose
// `digest` starts with NEXT_REDIRECT (or equals NEXT_NOT_FOUND) -- that
// throw must propagate untouched, or navigation silently breaks. Everything
// else that throws gets rendered as an on-page diagnostic instead of either
// a blank/empty UI (the Home page "Create Inspection" bug, PGRST201) or
// Next's generic unstyled 500 page.
export async function withPageError(renderInner) {
  try {
    return await renderInner();
  } catch (err) {
    const digest = err?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) {
      throw err;
    }
    return <PageError error={err} />;
  }
}

// Throws with a clear, labeled message if a Supabase call returned an
// error, instead of silently continuing with null/undefined data -- that
// silent continuation is exactly what hid the PGRST201 embed-ambiguity bug.
export function assertNoError(label, error) {
  if (error) {
    throw new Error(`${label} failed: ${error.message} (code ${error.code})`);
  }
}
