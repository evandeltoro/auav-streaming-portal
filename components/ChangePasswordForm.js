'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

// For someone who's already signed in and just wants to update their
// password -- separate from the forgot-password flow on the login page,
// which is for someone locked out entirely. Supabase's updateUser() trusts
// the active session rather than asking for the current password again.
export default function ChangePasswordForm() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);

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

    setPassword('');
    setConfirm('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="new-inspection-form" style={{ marginBottom: 0 }}>
      <label>New password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />
      <label>Confirm password</label>
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
      />
      <div className="form-actions">
        <button className="primary" type="submit" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? 'Saving...' : saved ? 'Password updated' : 'Update password'}
        </button>
      </div>
      <div className="error-text">{error}</div>
    </form>
  );
}
