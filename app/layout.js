import './globals.css';
import Sidebar from '../components/Sidebar';
import { createClient } from '../lib/supabase/server';

export const metadata = {
  title: 'AUAV Private Stream',
  description: 'AUAV private inspection streaming portal',
  icons: {
    icon: '/auav-logo.png',
    apple: '/auav-logo.png',
  },
};

export default async function RootLayout({ children }) {
  // Resolved server-side (fresh on every navigation, via cookies) and
  // passed down as a prop rather than fetched client-side in Sidebar.
  // Sidebar lives in this shared layout and never remounts across
  // login/logout, so a client-side-only fetch would go stale: sign out
  // of a staff account, sign into a client account, and the old isStaff
  // state (and the "Clients" nav link) would linger until a hard refresh.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isStaff = false;
  let isAdmin = false;
  let email = '';
  if (user) {
    email = user.email || '';
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    isStaff = profile?.role === 'admin' || profile?.role === 'inspector';
    isAdmin = profile?.role === 'admin';
  }

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap"
          rel="stylesheet"
        />
        {/* Set the theme before paint so there's no light/dark flash on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('auav-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <div className="app-shell">
          <Sidebar email={email} isStaff={isStaff} isAdmin={isAdmin} />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
