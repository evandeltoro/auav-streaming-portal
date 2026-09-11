'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Shared engine behind both the sidebar onboarding tour and the in-stream
// demo-inspection tour -- spotlighting a `[data-tour-id]` element with a
// positioned tooltip, plus centered welcome/done modals. Callers just
// supply a `steps` array and copy; all the positioning/sequencing logic
// lives here once instead of being duplicated per tour.
//
// A step is one of:
//   { kind: 'welcome' | 'done', title, body, cta? }  -- centered modal.
//     `cta` (optional, welcome/done only) renders an extra link/button:
//     { label, href } opens in a new tab, or { label, onClick }.
//   { target, title, body, optional? }  -- spotlights the element matching
//     `[data-tour-id="target"]`. If `optional` is true and the element
//     isn't found, the step is silently skipped (used for steps whose
//     target only renders for some roles). If not optional and the target
//     is missing, the step still renders as a centered fallback card so
//     the tour never just vanishes.
export default function StepTour({ active, steps, onFinished, skipLabel = 'Skip', finishLabel = 'Finish' }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const finishingRef = useRef(false);
  const resolvedSteps = useMemo(() => steps, [steps]);

  const step = resolvedSteps[index];
  const isOverlayStep = step && !step.kind;

  useEffect(() => {
    if (!active || !isOverlayStep) {
      setRect(null);
      return;
    }

    function measure() {
      const el = document.querySelector(`[data-tour-id="${step.target}"]`);
      if (!el) {
        if (step.optional) {
          setIndex((i) => Math.min(i + 1, resolvedSteps.length - 1));
          return;
        }
        setRect(null);
        return;
      }
      setRect(el.getBoundingClientRect());
    }

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, isOverlayStep, step?.target, step?.optional]);

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await onFinished?.();
  }

  if (!active || !step) return null;

  function next() {
    if (index >= resolvedSteps.length - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function skip() {
    finish();
  }

  function renderCta(cta) {
    if (!cta) return null;
    if (cta.href) {
      return (
        <a href={cta.href} className="secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          {cta.label}
        </a>
      );
    }
    return (
      <button type="button" className="secondary" onClick={cta.onClick}>
        {cta.label}
      </button>
    );
  }

  if (step.kind === 'welcome' || step.kind === 'done') {
    const isDone = step.kind === 'done';
    return (
      <div className="onboarding-backdrop">
        <div className="onboarding-modal">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          {renderCta(step.cta)}
          <div className="onboarding-modal-actions" style={{ marginTop: step.cta ? 10 : 0 }}>
            {!isDone && (
              <button type="button" className="secondary" onClick={skip}>
                {skipLabel}
              </button>
            )}
            <button type="button" className="primary" onClick={isDone ? finish : next}>
              {isDone ? finishLabel : 'Start'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Overlay/spotlight step whose target isn't in the DOM (and isn't
  // optional) -- fall back to a centered card rather than disappearing.
  if (!rect) {
    return (
      <div className="onboarding-backdrop">
        <div className="onboarding-modal">
          <div className="onboarding-tooltip-step">
            Step {index + 1} of {resolvedSteps.length}
          </div>
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          <div className="onboarding-modal-actions">
            <button type="button" className="secondary" onClick={skip}>
              {skipLabel}
            </button>
            <button type="button" className="primary" onClick={next}>
              {index >= resolvedSteps.length - 2 ? finishLabel : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Anchor below-right of the highlighted element and clamp inside the
  // viewport -- reads correctly whether the target sits in a left column
  // (desktop sidebar) or a top bar (mobile sidebar, per the 720px
  // breakpoint in globals.css), without branching on layout.
  const TOOLTIP_WIDTH = 300;
  const TOOLTIP_HEIGHT_ESTIMATE = 200;
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
          Step {index + 1} of {resolvedSteps.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="onboarding-modal-actions">
          <button type="button" className="secondary" onClick={skip}>
            {skipLabel}
          </button>
          <button type="button" className="primary" onClick={next}>
            {index >= resolvedSteps.length - 2 ? finishLabel : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
