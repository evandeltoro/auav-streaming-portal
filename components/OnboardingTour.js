'use client';

import { usePathname } from 'next/navigation';
import StepTour from './StepTour';

// Sidebar is the one piece of UI guaranteed to be on-screen no matter which
// page a new user lands on right after accepting their invite, so this
// tour spotlights sidebar nav items (via the data-tour-id attributes added
// in Sidebar.js) instead of trying to choreograph navigation across pages
// -- that would be far more fragile to keep in sync as the app changes.
function buildSteps({ isStaff, isAdmin }) {
  const steps = [
    {
      kind: 'welcome',
      title: 'Welcome to AUAV Private Stream',
      body: 'Quick tour of the portal -- under a minute, and you can skip any time.',
    },
  ];

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

  steps.push({
    kind: 'done',
    title: 'You’re all set',
    body: 'That’s the whole portal. Want to actually practice inside a live inspection -- joining voice comms, using chat, all of it -- with nothing real on the line?',
    cta: { label: 'Try the practice inspection', href: '/demo' },
  });

  return steps;
}

export default function OnboardingTour({ active, isStaff, isAdmin, onFinished }) {
  const pathname = usePathname();

  // Never show mid-auth -- a fresh invite lands on /set-password with a
  // session already present but onboarded_at still null, and the tour
  // shouldn't cover that form before the account even has a password.
  const AUTH_FLOW_PATHS = ['/login', '/set-password', '/signup', '/auth/callback'];
  const shouldRender = active && !AUTH_FLOW_PATHS.includes(pathname);

  const steps = buildSteps({ isStaff, isAdmin });

  async function finish() {
    try {
      await fetch('/api/account/onboarding', { method: 'POST' });
    } catch {
      // Best effort -- if this fails the tour just shows again next visit,
      // which is a safe fallback, not a broken one.
    }
    onFinished?.();
  }

  if (!shouldRender) return null;

  return <StepTour active={shouldRender} steps={steps} onFinished={finish} skipLabel="Skip tour" />;
}
