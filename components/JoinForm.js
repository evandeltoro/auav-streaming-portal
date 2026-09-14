'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

const ROLE_LABEL = { client: 'client', inspector: 'inspector', admin: 'admin' };

// The redemption route (/api/join/[code]) creates the account server-side
// with email_confirm: true, so there's no confirmation email to wait on --
// this signs straight in with the password just set and lands on the
// portal, the same instant the account exists.
export default function JoinForm({ code, role, companyName }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
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

    const res = await fetch(`/api/join/${code}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error || 'Failed to create account');
      return;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      // Account exists at this point either way -- send them to log in
      // manually rather than stranding them on a broken auto-signin.
      router.push('/login');
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
        <h1>Create your inspection portal account</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.4, marginTop: -8, marginBottom: 16 }}>
          You&apos;re joining as {ROLE_LABEL[role] || role}
          {companyName ? ` at ${companyName}` : ''}.
        </p>
        <form onSubmit={handleSubmit}>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            required
          />
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <div className="error-text">{error}</div>
        </form>
      </div>
    </div>
  );
}
