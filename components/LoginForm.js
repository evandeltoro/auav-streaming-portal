'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError('Incorrect email or password.');
      return;
    }

    const next = searchParams.get('next');
    router.push(next && next.startsWith('/') ? next : '/');
    router.refresh();
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>Sign in to your inspection portal</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="error-text">{error}</div>
        </form>
      </div>
    </div>
  );
}
