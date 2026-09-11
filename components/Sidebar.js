'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, BarChart3, Boxes, LayoutDashboard, LifeBuoy, LogOut, Plus, ShieldCheck, User, Users, Users2 } from 'lucide-react';
import { createClient } from '../lib/supabase/client';
import ThemeToggle from './ThemeToggle';

// email/isStaff come from the root layout (a Server Component that reads
// the auth cookie fresh on every navigation) instead of being fetched here.
// That avoids stale state across login/logout -- see the comment in
// app/layout.js for why a client-side-only fetch here caused a bug where a
// client account could briefly see the staff-only "Clients" nav link.
export default function Sidebar({ email = '', isStaff = false, isAdmin = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  if (pathname === '/login') return null;

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-logo" aria-label="Go to dashboard">
        <img src="/auav-logo.png" alt="AUAV" />
      </Link>

      {isStaff && (
        <Link href="/?new=1" className="sidebar-link sidebar-quick-action" data-tour-id="nav-new-inspection">
          <Plus size={18} />
          <span>New Inspection</span>
        </Link>
      )}

      <nav className="sidebar-nav">
        {isStaff && <div className="sidebar-group-label">Operations</div>}
        <Link
          href="/"
          data-tour-id="nav-dashboard"
          className={`sidebar-link ${pathname === '/' || pathname.startsWith('/inspection/') ? 'active' : ''}`}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </Link>
        <Link href="/archive" data-tour-id="nav-archive" className={`sidebar-link ${pathname === '/archive' ? 'active' : ''}`}>
          <Archive size={18} />
          <span>Archived Streams</span>
        </Link>
        <Link
          href="/townhall"
          data-tour-id="nav-townhall"
          className={`sidebar-link ${pathname === '/townhall' || pathname.startsWith('/townhall/') ? 'active' : ''}`}
        >
          <Users2 size={18} />
          <span>Town Hall</span>
        </Link>
        <Link
          href="/assets"
          data-tour-id="nav-assets"
          className={`sidebar-link ${pathname === '/assets' || pathname.startsWith('/assets/') ? 'active' : ''}`}
        >
          <Boxes size={18} />
          <span>Assets</span>
        </Link>

        {(isStaff || isAdmin) && <div className="sidebar-group-label">Admin</div>}
        {isStaff && (
          <Link href="/clients" data-tour-id="nav-clients" className={`sidebar-link ${pathname === '/clients' ? 'active' : ''}`}>
            <Users size={18} />
            <span>Clients</span>
          </Link>
        )}
        {isStaff && (
          <Link
            href="/engagement"
            data-tour-id="nav-engagement"
            className={`sidebar-link ${pathname === '/engagement' ? 'active' : ''}`}
          >
            <BarChart3 size={18} />
            <span>Engagement</span>
          </Link>
        )}
        {isAdmin && (
          <Link href="/team" data-tour-id="nav-team" className={`sidebar-link ${pathname === '/team' ? 'active' : ''}`}>
            <ShieldCheck size={18} />
            <span>Team</span>
          </Link>
        )}
      </nav>

      <div className="sidebar-bottom">
        <ThemeToggle />
        <Link href="/account" data-tour-id="nav-account" className={`sidebar-link ${pathname === '/account' ? 'active' : ''}`}>
          <User size={18} />
          <span>My Account</span>
        </Link>
        <a href="mailto:support@auav-us.com" className="sidebar-link sidebar-support">
          <LifeBuoy size={18} />
          <span>Support</span>
        </a>
        <div className="sidebar-user">
          {email && <div className="sidebar-user-email">{email}</div>}
          <button className="sidebar-signout" onClick={signOut}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
