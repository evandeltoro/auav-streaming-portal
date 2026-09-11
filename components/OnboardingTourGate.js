'use client';

import { useState } from 'react';
import OnboardingTour from './OnboardingTour';

// Thin client wrapper around OnboardingTour -- the server layout only knows
// onboarded_at as of the page load that rendered it, so once the tour
// finishes (or is skipped) we flip local state immediately instead of
// waiting on a full navigation to re-fetch the profile.
export default function OnboardingTourGate({ initialNeedsOnboarding, isStaff, isAdmin }) {
  const [active, setActive] = useState(initialNeedsOnboarding);

  if (!active) return null;

  return <OnboardingTour active={active} isStaff={isStaff} isAdmin={isAdmin} onFinished={() => setActive(false)} />;
}
