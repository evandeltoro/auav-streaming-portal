'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// Supabase's default invite/magic-link/recovery emails don't land here with
// a query-string token -- they redirect with the session tokens in the URL
// *hash fragment* (#access_token=...&refresh_token=...&type=invite). Hash
// fragments never reach the server, so this has to be a client component
// that reads window.location.hash itself and establishes the session.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        setError('This link is missing its login token.');
        return;
      }

      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (!access_token || !refresh_token) {
        setError('This link is invalid or has expired. Ask staff to resend your invite.');
        return;
      }

      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      router.replace('/set-password');
    }

    run();
  }, [router]);

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>{error ? 'There was a problem with this link' : 'Signing you in...'}</h1>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
