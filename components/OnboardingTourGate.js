'use client';

import { useState } from 'react';
import OnboardingTour from './OnboardingTour';

// Thin client wrapper around OnboardingTour -- the server layout only knows
// onboarded_at as of the page load that rendered it, so this holds the
// starting value as local state. OnboardingTour always ends by navigating
// to /demo?tour=1 (part 2 of the walkthrough), which unmounts everything
// here anyway, so there's no separate "finished" state to flip back.
export default function OnboardingTourGate({ initialNeedsOnboarding, isStaff, isAdmin }) {
  const [active] = useState(initialNeedsOnboarding);

  if (!active) return null;

  return <OnboardingTour active={active} isStaff={isStaff} isAdmin={isAdmin} />;
}
