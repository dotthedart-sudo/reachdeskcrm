import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAppUrl, getMarketingUrl, isLocalDev } from '../utils/domain';
import { TRIAL_MARKETING } from '../lib/planMarketing';
import { getStoredInviteToken, storeInviteToken } from '../lib/teamWorkspace';
import AuthLogo from './AuthLogo';
import { BRAND_NAME } from '../config/brand';

const BLOCKED_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'throwaway.email', 'yopmail.com', 'sharklasers.com', 'trashmail.com',
];

const LOCAL_PASSWORD_AUTH = isLocalDev();

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.49 3.77v3.12h3.99a11.96 11.96 0 0 0 3.55-8.74Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.89-3.12c-1.08.72-2.48 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.21v3.22A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.17A7.18 7.18 0 0 1 4.8 12c0-.76.13-1.49.36-2.17V6.61H1.21A11.99 11.99 0 0 0 0 12c0 2.3.65 4.45 1.78 6.28l3.49-2.11Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.92 11.92 0 0 0 12 0 12 12 0 0 0 1.21 6.61l3.49 2.11C5.65 6.86 8.3 4.75 12 4.75Z" />
    </svg>
  );
}

function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  const domain = email.split('@')[1]?.toLowerCase();
  if (BLOCKED_DOMAINS.includes(domain)) return 'Please use a valid email address.';
  return null;
}

/**
 * Production: email → OTP (signup + login), Google.
 * Local/dev only: email + password so you can test without inbox OTP.
 */
export default function Auth({ mode = 'login' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSignup = mode === 'signup';

  const [step, setStep] = useState('methods'); // methods | email | otp
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingInvite, setPendingInvite] = useState(false);
  const [usePasswordForLogin, setUsePasswordForLogin] = useState(false);

  useEffect(() => {
    const inviteToken = searchParams.get('invite');
    if (inviteToken) {
      storeInviteToken(inviteToken);
      setPendingInvite(true);
    } else {
      setPendingInvite(!!getStoredInviteToken());
    }
  }, [searchParams]);

  useEffect(() => {
    setStep('methods');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setCode('');
    setError('');
    setSuccess('');
    setResendCooldown(0);
  }, [mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Invite accept runs in App fetchProfile (with paid-plan confirm when needed).
  const finishAuthNavigation = async (destination) => {
    navigate(destination);
  };

  const sendOtp = async (targetEmail) => {
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        shouldCreateUser: isSignup,
        data: isSignup ? { requested_plan: 'trial' } : undefined,
      },
    });
    if (otpErr) throw otpErr;
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      const { error: oAuthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAppUrl('/dashboard') },
      });
      if (oAuthErr) throw oAuthErr;
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
      setLoading(false);
    }
  };

  const handleEmailContinue = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Local/dev: password auth so OTP inbox isn't required
    if (isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) {
      if (!password.trim() || password.trim().length < 6) {
        setError('Enter a password (at least 6 characters).');
        return;
      }

      setLoading(true);
      try {
        if (isSignup) {
          const { error: signUpErr } = await supabase.auth.signUp({
            email: email.trim(),
            password: password.trim(),
            options: {
              data: { requested_plan: 'trial' },
              emailRedirectTo: getAppUrl('/dashboard'),
            },
          });
          if (signUpErr) throw signUpErr;
          await finishAuthNavigation('/setup');
        } else {
          const { error: loginErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim(),
          });
          if (loginErr) throw loginErr;
          await finishAuthNavigation('/dashboard');
        }
      } catch (err) {
        let msg = err.message || (isSignup ? 'Sign up failed.' : 'Login failed.');
        const lower = msg.toLowerCase();
        if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
          msg = 'Wrong email or password. If no password is set for this account, use the code we emailed you instead.';
        } else if (lower.includes('already') || lower.includes('exists') || lower.includes('registered')) {
          msg = 'An account with this email already exists. Log in instead.';
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Production: email OTP
    setLoading(true);
    try {
      await sendOtp(email.trim());
      setStep('otp');
      setCode('');
      setResendCooldown(30);
    } catch (err) {
      let msg = err.message || 'Could not send code.';
      const lower = msg.toLowerCase();
      if (isSignup && (lower.includes('already') || lower.includes('exists'))) {
        msg = 'An account with this email already exists. Log in instead.';
      } else if (!isSignup && (lower.includes('signups not allowed') || lower.includes('user not found'))) {
        msg = 'No account with that email. Sign up instead.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtpInstead = async () => {
    setError('');
    setSuccess('');
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await sendOtp(email.trim());
      setStep('otp');
      setCode('');
      setResendCooldown(30);
      setSuccess('Code sent — check your email.');
    } catch (err) {
      setError(err.message || 'Could not send code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (verifyErr) throw verifyErr;
      await finishAuthNavigation(isSignup ? '/setup' : '/dashboard');
    } catch (err) {
      setError('Invalid or expired code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await sendOtp(email.trim());
      setSuccess('Code resent.');
      setResendCooldown(30);
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 'otp'
      ? 'Check your email'
      : step === 'email'
        ? (isSignup ? 'Continue with email' : 'Log in with email')
        : (isSignup ? 'Create your workspace' : 'Welcome back');

  const subtitle =
    step === 'otp'
      ? `Enter the 6-digit code we sent to ${email.trim()}`
      : step === 'email'
        ? ((isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)
          ? (isSignup
            ? `${TRIAL_MARKETING.headline}.`
            : `Log in to your ${BRAND_NAME} workspace.`)
          : 'We’ll email you a one-time code — no password needed.')
        : step === 'methods'
          ? null
          : (isSignup
            ? `${TRIAL_MARKETING.headline}.`
            : `Log in to your ${BRAND_NAME} workspace.`);

  return (
    <div className="auth-page">
      <AuthLogo />

      <div className="auth-panel">
        <header className="auth-panel-header">
          <h1 className="auth-panel-title">{title}</h1>
          {subtitle && <p className="auth-panel-sub">{subtitle}</p>}
        </header>

        {pendingInvite && (
          <div className="auth-success-banner" role="status" style={{ marginBottom: '0.75rem' }}>
            <Check size={16} />
            <span>
              You&apos;ve been invited to a {BRAND_NAME} team workspace. Sign up or log in with the invited email address to join.
            </span>
          </div>
        )}

        {error && (
          <div className="auth-error-banner" role="alert">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="auth-success-banner" role="status">
            <Check size={16} />
            <span>{success}</span>
          </div>
        )}

        {step === 'methods' && (
          <div className="auth-methods">
            <button
              type="button"
              className="auth-btn auth-btn-google"
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="auth-btn auth-btn-secondary"
              onClick={() => {
                setError('');
                setSuccess('');
                setStep('email');
              }}
              disabled={loading}
            >
              Continue with email
            </button>
          </div>
        )}

        {step === 'email' && (
          <form className="auth-form-linear" onSubmit={handleEmailContinue}>
            <label className="auth-field">
              <span className="auth-field-label">Email</span>
              <input
                type="email"
                className="form-input w-full"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                disabled={loading}
              />
            </label>

            {!isSignup && !usePasswordForLogin && (
              <button
                type="button"
                className="auth-text-btn"
                style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                onClick={() => setUsePasswordForLogin(true)}
                disabled={loading}
              >
                Use a password instead
              </button>
            )}

            {(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) && (
              <label className="auth-field">
                <span className="auth-field-label">Password</span>
                <div className="rd-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input w-full"
                    placeholder={isSignup ? 'Create a password' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="rd-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}

            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading
                ? ((isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)
                  ? (isSignup ? 'Creating…' : 'Logging in…')
                  : 'Sending code…')
                : ((isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin)
                  ? (isSignup ? 'Create account' : 'Log in')
                  : 'Continue')}
            </button>

            {(isSignup ? LOCAL_PASSWORD_AUTH : usePasswordForLogin) && (
              <button
                type="button"
                className="auth-text-btn"
                onClick={() => {
                  if (!isSignup) {
                    setUsePasswordForLogin(false);
                    setPassword('');
                  } else {
                    handleSendOtpInstead();
                  }
                }}
                disabled={loading}
              >
                Email me a code instead
              </button>
            )}

            <button
              type="button"
              className="auth-back"
              onClick={() => {
                setError('');
                setSuccess('');
                setPassword('');
                setStep('methods');
              }}
              disabled={loading}
            >
              <ArrowLeft size={14} />
              Back
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form className="auth-form-linear" onSubmit={handleVerifyOtp}>
            <label className="auth-field">
              <span className="auth-field-label">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="form-input w-full auth-otp-input"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
                disabled={loading}
              />
            </label>

            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>

            <div className="auth-otp-actions">
              <button
                type="button"
                className="auth-text-btn"
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setError('');
                  setSuccess('');
                  setCode('');
                  setStep('email');
                }}
                disabled={loading}
              >
                <ArrowLeft size={14} />
                Back
              </button>
            </div>
          </form>
        )}

        {step === 'methods' && (
          <p className="auth-switch">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link to="/login">Log in</Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link to="/signup">Create an account</Link>
              </>
            )}
          </p>
        )}
      </div>

      <p className="auth-legal">
        By continuing, you agree to our{' '}
        <a href={getMarketingUrl('/terms')} target="_blank" rel="noopener noreferrer">Terms</a>,{' '}
        <a href={getMarketingUrl('/privacy')} target="_blank" rel="noopener noreferrer">Privacy</a>
        {' '}and{' '}
        <a href={getMarketingUrl('/refund')} target="_blank" rel="noopener noreferrer">Refund</a>
        {' '}policies.
      </p>
    </div>
  );
}
