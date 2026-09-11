'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DemoTour from './DemoTour';

// Auto-starts the walkthrough when arriving via /demo (?tour=1, same
// pattern as NewInspectionForm's ?new=1), and otherwise renders a small
// button so it can be replayed on demand -- this only ever renders on the
// practice inspection (see the is_demo check in app/inspection/[id]/page.js).
export default function DemoTourLauncher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (searchParams.get('tour') === '1') {
      setActive(true);
      router.replace(window.location.pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button type="button" className="secondary" style={{ marginBottom: 18, width: 'auto' }} onClick={() => setActive(true)}>
        Replay Walkthrough
      </button>
      <DemoTour active={active} onFinished={() => setActive(false)} />
    </>
  );
}
