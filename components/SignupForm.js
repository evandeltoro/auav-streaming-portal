'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';
import { composeFullName } from '../lib/name';

// Public, stand-alone sign-up -- no admin action required to create an
// account. New accounts default to role 'client' with no company assigned
// (enforced server-side by DB defaults/triggers, not by this form), so a
// self-registered person can log in but sees nothing until staff assigns
// their company from the Clients page registry.
export default function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

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
    const full_name = composeFullName(firstName, '', lastName);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.push('/');
      router.refresh();
      return;
    }

    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <img src="/auav-logo.png" alt="AUAV" />
          </div>
          <h1>Check your email</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to finish setting up
            your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <img src="/auav-logo.png" alt="AUAV" />
        </div>
        <h1>Create your inspection portal account</h1>
        <form onSubmit={handleSubmit}>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
          />
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
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 14 }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: 'var(--auav-orange)', fontWeight: 600 }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
