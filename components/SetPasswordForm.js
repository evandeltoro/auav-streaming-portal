'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export default function SetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const nameRes = await fetch('/api/account/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, middleInitial, lastName }),
    });
    const nameData = await nameRes.json();
    if (!nameRes.ok) {
      setLoading(false);
      setError(nameData.error || 'Failed to save your name');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>Finish setting up your account</h1>
        <form onSubmit={handleSubmit}>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
          <input
            value={middleInitial}
            onChange={(e) => setMiddleInitial(e.target.value)}
            placeholder="Middle initial (optional)"
            maxLength={1}
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
          />
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
            {loading ? 'Saving...' : 'Save and continue'}
          </button>
          <div className="error-text">{error}</div>
        </form>
      </div>
    </div>
  );
}
