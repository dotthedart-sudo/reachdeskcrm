import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lock, Check, AlertCircle } from 'lucide-react';

export default function PasswordPanel() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setSuccess('Password updated successfully.');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card rd-page-form" style={{ marginTop: '1.5rem' }}>
      <div className="rd-page-form-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Lock size={20} style={{ color: 'var(--primary-purple)' }} />
        <div>
          <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Password</h3>
          <p className="rd-modal-sub" style={{ margin: 0, marginTop: '0.25rem' }}>Set or change your login password. Email OTP will always remain active.</p>
        </div>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert" style={{ marginTop: '1rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="auth-success-banner" role="status" style={{ marginTop: '1rem' }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      <div className="rd-form" style={{ marginTop: '1rem' }}>
        <div className="rd-form-row">
          <div className="rd-form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="Minimum 8 characters"
              disabled={loading}
              required
            />
          </div>
          <div className="rd-form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              placeholder="Confirm your new password"
              disabled={loading}
              required
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={loading || !password || !confirm}>
          {loading ? 'Saving...' : 'Set password'}
        </button>
      </div>
    </form>
  );
}
