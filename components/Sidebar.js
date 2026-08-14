'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Archive, BarChart3, LifeBuoy, LogOut, ShieldCheck, User, Users, Users2, Video } from 'lucide-react';
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
      <a href="/" className="sidebar-logo" aria-label="Go to dashboard">
        <img src="/auav-logo.png" alt="AUAV" />
      </a>

      <nav className="sidebar-nav">
        <a href="/" className={`sidebar-link ${pathname === '/' ? 'active' : ''}`}>
          <Video size={18} />
          <span>Live</span>
        </a>
        <a href="/archive" className={`sidebar-link ${pathname === '/archive' ? 'active' : ''}`}>
          <Archive size={18} />
          <span>Archived Streams</span>
        </a>
        <a href="/townhall" className={`sidebar-link ${pathname === '/townhall' || pathname.startsWith('/townhall/') ? 'active' : ''}`}>
          <Users2 size={18} />
          <span>Town Hall</span>
        </a>
        {isStaff && (
          <a href="/clients" className={`sidebar-link ${pathname === '/clients' ? 'active' : ''}`}>
            <Users size={18} />
            <span>Clients</span>
          </a>
        )}
        {isStaff && (
          <a href="/engagement" className={`sidebar-link ${pathname === '/engagement' ? 'active' : ''}`}>
            <BarChart3 size={18} />
            <span>Engagement</span>
          </a>
        )}
        {isAdmin && (
          <a href="/team" className={`sidebar-link ${pathname === '/team' ? 'active' : ''}`}>
            <ShieldCheck size={18} />
            <span>Team</span>
          </a>
        )}
      </nav>

      <div className="sidebar-bottom">
        <ThemeToggle />
        <a href="/account" className={`sidebar-link ${pathname === '/account' ? 'active' : ''}`}>
          <User size={18} />
          <span>My Account</span>
        </a>
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
