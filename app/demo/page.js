import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { withPageError, assertNoError } from '../../lib/withPageError';

// Stable entry point for the practice inspection -- links (Sidebar, the
// sidebar onboarding tour's done step, docs/emails later) point at /demo
// instead of a hardcoded inspection id, and this just looks up the
// singleton is_demo row and forwards on. ?tour=1 auto-starts the in-stream
// walkthrough (DemoTourLauncher) once there.
export default async function DemoRedirectPage() {
  return withPageError(DemoRedirectPageInner);
}

async function DemoRedirectPageInner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=%2Fdemo');
  }

  const { data: demoInspection, error } = await supabase
    .from('inspections')
    .select('id')
    .eq('is_demo', true)
    .limit(1)
    .maybeSingle();
  assertNoError('demo inspection lookup', error);

  if (!demoInspection) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div className="archive-empty">
            The practice inspection hasn&apos;t been set up yet -- ask an admin to create one.
          </div>
        </div>
      </div>
    );
  }

  redirect(`/inspection/${demoInspection.id}?tour=1`);
}
