'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useToast } from './Toast';

// Single entry point in the sidebar for every guided-learning thing in the
// portal -- currently the practice inspection and the sidebar walkthrough,
// with room to add more (a Town Hall walkthrough, an Assets walkthrough,
// etc.) as menu items without the sidebar itself growing a new top-level
// link each time.
export default function TutorialsMenu() {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function restartWalkthrough() {
    setRestarting(true);
    const res = await fetch('/api/account/onboarding', { method: 'DELETE' });
    if (!res.ok) {
      setRestarting(false);
      showToast('Failed to restart the walkthrough', 'error');
      return;
    }
    // Full reload, not router.refresh() -- the walkthrough's starting state
    // comes from the root layout (a Server Component), so only a hard
    // navigation is guaranteed to pick the cleared state back up.
    window.location.href = '/';
  }

  return (
    <div className="tutorials-menu" ref={containerRef}>
      <button type="button" className="sidebar-link sidebar-support" onClick={() => setOpen((o) => !o)}>
        <GraduationCap size={18} />
        <span>Tutorials</span>
      </button>

      {open && (
        <div className="tutorials-menu-popover">
          <Link href="/demo" className="tutorials-menu-item" onClick={() => setOpen(false)}>
            Practice Demo
          </Link>
          <button type="button" className="tutorials-menu-item" disabled={restarting} onClick={restartWalkthrough}>
            {restarting && <span className="spinner dark" />}
            Portal Walkthrough
          </button>
        </div>
      )}
    </div>
  );
}
