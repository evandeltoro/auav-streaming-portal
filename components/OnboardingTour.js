'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Sidebar is the one piece of UI guaranteed to be on-screen no matter which
// page a new user lands on right after accepting their invite, so the tour
// spotlights sidebar nav items (via the data-tour-id attributes added in
// Sidebar.js) instead of trying to choreograph navigation across pages --
// that would be far more fragile to keep in sync as the app changes.
function buildSteps({ isStaff, isAdmin }) {
  const steps = [{ kind: 'welcome' }];

  if (isStaff) {
    steps.push({
      target: 'nav-new-inspection',
      title: 'Schedule an inspection',
      body: 'Start here any time to schedule a new inspection -- pick the client, site, asset, and pilot, and it’s ready to go live.',
    });
  }

  steps.push({
    target: 'nav-dashboard',
    title: 'Dashboard',
    body: isStaff
      ? 'Every scheduled and live inspection across all your clients, with live streams always floating to the top.'
      : 'Your company’s scheduled and live inspections, always up to date.',
  });

  steps.push({
    target: 'nav-archive',
    title: 'Archived Streams',
    body: 'Completed and archived inspections live here, with their recordings and viewer history.',
  });

  steps.push({
    target: 'nav-townhall',
    title: 'Town Hall',
    body: 'A shared room for live camera feeds and screen shares across your team -- handy for reviewing a feed together in real time.',
  });

  steps.push({
    target: 'nav-assets',
    title: 'Assets',
    body: isStaff
      ? 'Platforms and rigs -- like an FPSO or a rig -- grouped by client. Add assets from the Clients page, then dive into one here to see just its inspections.'
      : 'Dive into one of your company’s assets to see only the inspections tied to it, instead of everything mixed together.',
  });

  if (isStaff) {
    steps.push({
      target: 'nav-clients',
      title: 'Clients',
      body: 'Manage client companies, invite their users, register surveyors for voice comms, and set up assets.',
    });
    steps.push({
      target: 'nav-engagement',
      title: 'Engagement',
      body: 'See who’s actually watching -- viewer sessions and engagement across your streams.',
    });
  }

  if (isAdmin) {
    steps.push({
      target: 'nav-team',
      title: 'Team',
      body: 'Manage your internal AUAV team and their roles.',
    });
  }

  steps.push({
    target: 'nav-account',
    title: 'My Account',
    body: 'Update your name and theme here. You can restart this tour any time from this page too.',
  });

  steps.push({ kind: 'done' });

  return steps;
}

export default function OnboardingTour({ active, isStaff, isAdmin, onFinished }) {
  const pathname = usePathname();
  const steps = useMemo(() => buildSteps({ isStaff, isAdmin }), [isStaff, isAdmin]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const finishingRef = useRef(false);

  const step = steps[index];
  const isOverlayStep = step && !step.kind;

  // Recompute the highlighted element's position whenever the step changes
  // or the viewport changes -- sidebar links don't move, but this keeps the
  // spotlight correct if someone resizes mid-tour.
  useEffect(() => {
    if (!active || !isOverlayStep) {
      setRect(null);
      return;
    }

    function measure() {
      const el = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (!el) {
        // Target isn't in the DOM (e.g. a staff-only link that hasn't
        // rendered yet on this pass) -- skip forward rather than stall the
        // tour on a step that can never complete.
        setIndex((i) => Math.min(i + 1, steps.length - 1));
        return;
      }
      setRect(el.getBoundingClientRect());
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, isOverlayStep, step?.target]);

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await fetch('/api/account/onboarding', { method: 'POST' });
    } catch {
      // Best effort -- if this fails the tour just shows again next visit,
      // which is a safe fallback, not a broken one.
    }
    onFinished?.();
  }

  // Never show mid-auth -- a fresh invite lands on /set-password with a
  // session already present but onboarded_at still null, and the tour
  // shouldn't cover that form before the account even has a password.
  const AUTH_FLOW_PATHS = ['/login', '/set-password', '/signup', '/auth/callback'];
  if (!active || AUTH_FLOW_PATHS.includes(pathname)) return null;

  function next() {
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function skip() {
    finish();
  }

  if (step.kind === 'welcome') {
    return (
      <div className="onboarding-backdrop">
        <div className="onboarding-modal">
          <h2>Welcome to AUAV Private Stream</h2>
          <p>Quick tour of the portal -- under a minute, and you can skip any time.</p>
          <div className="onboarding-modal-actions">
            <button type="button" className="secondary" onClick={skip}>
              Skip
            </button>
            <button type="button" className="primary" onClick={next}>
              Start tour
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.kind === 'done') {
    return (
      <div className="onboarding-backdrop">
        <div className="onboarding-modal">
          <h2>You’re all set</h2>
          <p>That’s the whole portal. You can replay this tour any time from My Account.</p>
          <div className="onboarding-modal-actions">
            <button type="button" className="primary" onClick={finish}>
              Finish
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!rect) return null;

  // Sidebar is a left column on desktop and a top bar on mobile (see the
  // 720px breakpoint in globals.css) -- rather than branch on layout,
  // anchor the tooltip below-right of the highlighted element and clamp it
  // inside the viewport, which reads correctly in either arrangement.
  const TOOLTIP_WIDTH = 300;
  const TOOLTIP_HEIGHT_ESTIMATE = 180;
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - TOOLTIP_WIDTH - 16);
  const top = Math.min(rect.bottom + 14, window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - 16);

  return (
    <div className="onboarding-backdrop onboarding-backdrop-spotlight">
      <div
        className="onboarding-highlight"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
      />
      <div className="onboarding-tooltip" style={{ top, left }}>
        <div className="onboarding-tooltip-step">
          Step {index + 1} of {steps.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="onboarding-modal-actions">
          <button type="button" className="secondary" onClick={skip}>
            Skip tour
          </button>
          <button type="button" className="primary" onClick={next}>
            {index >= steps.length - 2 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
