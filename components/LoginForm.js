'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

function ForgotPasswordForm({ onBack }) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Supabase doesn't reveal whether the email has an account either way
    // (no error for an unknown address) -- always show the same "check your
    // email" state so this can't be used to test which emails are
    // registered.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <h1>Check your email</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>
          If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
        </p>
        <button type="button" className="primary" style={{ marginTop: 14 }} onClick={onBack}>
          Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Reset your password</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.4, marginTop: -6, marginBottom: 14 }}>
        Enter the email on your account and we&apos;ll send a link to set a new password.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
        <div className="error-text">{error}</div>
      </form>
      <p style={{ fontSize: '0.8rem', marginTop: 14 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--auav-orange)', fontWeight: 600, cursor: 'pointer' }}
        >
          Back to sign in
        </button>
      </p>
    </>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

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
        {forgotPassword ? (
          <ForgotPasswordForm onBack={() => setForgotPassword(false)} />
        ) : (
          <>
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
            <p style={{ fontSize: '0.8rem', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--auav-orange)', fontWeight: 600, cursor: 'pointer' }}
              >
                Forgot password?
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
