'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

// Landed on from a password-recovery email (see auth/callback, which routes
// type=recovery here instead of to /set-password) -- the session is already
// established by the time this renders, so this only ever asks for the new
// password, never name/email, unlike the first-time invite flow.
export default function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push('/');
      router.refresh();
    }, 1200);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>Set a new password</h1>
        {done ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>
            Password updated -- taking you to the portal...
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save new password'}
            </button>
            <div className="error-text">{error}</div>
          </form>
        )}
      </div>
    </div>
  );
}
