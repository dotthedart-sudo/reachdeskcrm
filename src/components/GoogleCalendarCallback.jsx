import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { markCalendarScopeAck } from '../lib/googleCalendarOAuth';

/**
 * GoogleCalendarCallback
 *
 * Handles the OAuth redirect from Google after the user grants permission.
 * URL pattern: /auth/google/callback?code=...&state=...
 *
 * Flow:
 * 1. Verify CSRF `state` parameter matches what was stored in sessionStorage
 * 2. Get current user session
 * 3. Call google-oauth-exchange edge function with the code
 * 4. On success → redirect to /settings?tab=integrations&connected=google
 * 5. On failure → show error with Try Again option
 */
export default function GoogleCalendarCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const errorParam = params.get('error');

      // ── User denied access ───────────────────────────────────────────────
      if (errorParam === 'access_denied') {
        setErrorMessage('You declined to connect Google Calendar. You can try again anytime from Settings.');
        setStatus('error');
        return;
      }

      if (!code) {
        setErrorMessage('No authorization code received from Google.');
        setStatus('error');
        return;
      }

      // ── CSRF verification ─────────────────────────────────────────────────
      const storedState = sessionStorage.getItem('google_oauth_state');
      sessionStorage.removeItem('google_oauth_state');

      if (!storedState || storedState !== state) {
        setErrorMessage('Security check failed: OAuth state mismatch. Please try connecting again.');
        setStatus('error');
        return;
      }

      // ── Get current user session ──────────────────────────────────────────
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        setErrorMessage('You must be logged in to connect Google Calendar. Please log in and try again.');
        setStatus('error');
        return;
      }

      // ── Call the exchange edge function ───────────────────────────────────
      try {
        const { data, error } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { code },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // ── Success ───────────────────────────────────────────────────────
        markCalendarScopeAck();
        setStatus('success');

        // Small delay so user can see the success message
        setTimeout(() => {
          navigate('/settings?tab=integrations&connected=google', { replace: true });
        }, 1800);
      } catch (err) {
        console.error('[GoogleCalendarCallback] Exchange error:', err);
        setErrorMessage(err?.message || 'Failed to connect Google Calendar. Please try again.');
        setStatus('error');
      }
    }

    handleCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary, #0d1117)',
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    padding: '2rem',
  };

  const cardStyle = {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: '12px',
    padding: '2.5rem 3rem',
    textAlign: 'center',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  if (status === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <Loader size={40} style={{ color: 'var(--accent-blue, #3b82f6)', animation: 'spin 1s linear infinite' }} />
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary, #e6edf3)' }}>
            Connecting Google Calendar…
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem' }}>
            Exchanging credentials and setting up your calendar watch.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <CheckCircle size={40} style={{ color: '#10b981' }} />
          </div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary, #e6edf3)' }}>
            Google Calendar Connected!
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem' }}>
            Leads will now be automatically marked as <strong>Booked</strong> when they appear on your calendar.
            Redirecting you to Settings…
          </p>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
          <XCircle size={40} style={{ color: '#ef4444' }} />
        </div>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary, #e6edf3)' }}>
          Connection Failed
        </h2>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem' }}>
          {errorMessage}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/settings?tab=integrations')}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent-blue, #3b82f6)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Back to Settings
          </button>
        </div>
      </div>
    </div>
  );
}
