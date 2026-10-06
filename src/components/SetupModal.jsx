import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Upload, X, Check, Building, Globe, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AuthLogo from './AuthLogo';
import { BRAND_NAME } from '../config/brand';
import { COUNTRY_TIMEZONE_OPTIONS, inferCountryFromUserEnvironment } from '../lib/leadTimezone';

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee (PKR)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar (AUD)' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal (SAR)' },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar (SGD)' },
  { code: 'NZD', symbol: '$', name: 'New Zealand Dollar (NZD)' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc (CHF)' },
];

function inferCurrencyFromCountry(countryCode) {
  switch (countryCode) {
    case 'GB': return 'GBP';
    case 'PK': return 'PKR';
    case 'IN': return 'INR';
    case 'CA': return 'CAD';
    case 'AU': return 'AUD';
    case 'DE':
    case 'FR':
    case 'ES':
    case 'IT':
    case 'NL':
    case 'BE':
    case 'AT':
    case 'PT':
    case 'IE':
    case 'FI':
    case 'GR':
      return 'EUR';
    case 'AE': return 'AED';
    case 'SA': return 'SAR';
    case 'SG': return 'SGD';
    case 'NZ': return 'NZD';
    case 'JP': return 'JPY';
    case 'CH': return 'CHF';
    default: return 'USD';
  }
}

/**
 * Post-auth workspace setup — ONE single screen.
 */
export default function SetupModal({ profile, onRefreshProfile, navigate }) {
  const fileRef = useRef(null);

  const initialCountry = useMemo(() => {
    if (profile?.default_country_code) return profile.default_country_code;
    const inferred = inferCountryFromUserEnvironment();
    return inferred?.country || 'US';
  }, [profile?.default_country_code]);

  const initialCurrency = useMemo(() => {
    if (profile?.default_currency) return profile.default_currency;
    return inferCurrencyFromCountry(initialCountry);
  }, [profile?.default_currency, initialCountry]);

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [businessName, setBusinessName] = useState(
    profile?.business_name ||
    (profile?.full_name ? `${profile.full_name.trim().split(' ')[0]}'s Workspace` : '')
  );
  const [defaultCountry, setDefaultCountry] = useState(initialCountry);
  const [defaultCurrency, setDefaultCurrency] = useState(initialCurrency);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCountryChange = (newCountry) => {
    setDefaultCountry(newCountry);
    // If currency was default, adapt to new country
    const matchedCurr = inferCurrencyFromCountry(newCountry);
    if (matchedCurr) {
      setDefaultCurrency(matchedCurr);
    }
  };

  const handleAvatarChange = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError('Use a JPG, PNG, or WebP image.');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB.');
      e.target.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatarIfNeeded = async () => {
    if (!avatarFile || !profile?.id) return profile?.avatar_url || null;

    const ext = avatarFile.name.split('.').pop() || 'jpg';
    const fileName = `${profile.id}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

    if (uploadErr) {
      console.error('Avatar upload failed:', uploadErr);
      throw new Error('Could not upload profile photo.');
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const avatarUrl = urlData?.publicUrl || null;
    if (avatarUrl) {
      await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
    }
    return avatarUrl;
  };

  const goToDashboard = (path = '/dashboard') => {
    sessionStorage.setItem('rd_reveal', '1');
    navigate(path);
  };

  const handleFinish = async (e) => {
    e?.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const avatarUrl = await uploadAvatarIfNeeded();

      const userTimezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
      const workspaceTitle = businessName.trim() || (fullName.trim() ? `${fullName.trim().split(' ')[0]}'s Workspace` : 'My Workspace');

      const updates = {
        full_name: fullName.trim() || profile?.full_name || '',
        business_name: workspaceTitle,
        default_currency: defaultCurrency,
        default_country_code: defaultCountry,
        timezone: userTimezone,
        has_completed_setup: true,
      };
      if (avatarUrl) updates.avatar_url = avatarUrl;

      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', profile.id);

      if (updateErr) throw updateErr;

      localStorage.setItem('reachdesk_brand_name', workspaceTitle);

      if (onRefreshProfile) await onRefreshProfile();
      goToDashboard('/dashboard');
    } catch (err) {
      console.error('Error during setup submission:', err);
      setError(err.message || 'Failed to save setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      const userTimezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          has_completed_setup: true,
          timezone: userTimezone,
        })
        .eq('id', profile.id);

      if (updateErr) throw updateErr;
      if (onRefreshProfile) await onRefreshProfile();
      goToDashboard('/dashboard');
    } catch (err) {
      console.error('Error skipping setup wizard:', err);
      setError('Failed to skip. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page rd-setup-page">
      <AuthLogo />

      <div className="auth-panel auth-panel-setup" style={{ maxWidth: '480px', width: '100%' }}>
        <header className="auth-panel-header" style={{ marginBottom: '16px' }}>
          <h1 className="auth-panel-title">Set up your workspace</h1>
          <p className="auth-panel-sub">Add your details and defaults to get started.</p>
        </header>

        {error && (
          <div className="auth-error-banner" role="alert" style={{ marginBottom: '14px' }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleFinish} className="rd-setup-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* 1. Photo + Your Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={isSubmitting}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => !isSubmitting && fileRef.current?.click()}
                disabled={isSubmitting}
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  border: '1px dashed var(--border-color, #E8E8E6)',
                  backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  padding: 0,
                  color: 'var(--text-muted, #8E8D8A)',
                }}
                title="Upload photo"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Upload size={20} />
                )}
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="setup-full-name" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}>
                Your name
              </label>
              <input
                id="setup-full-name"
                type="text"
                required
                autoFocus
                placeholder="e.g. Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                style={{ height: '36px', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* 2. Workspace Name ("Shown on your invoices") */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="setup-workspace-name" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}>
              Workspace name
            </label>
            <input
              id="setup-workspace-name"
              type="text"
              required
              placeholder="e.g. Acme Studio"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={isSubmitting}
              className="form-input"
              style={{ height: '36px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #8E8D8A)' }}>
              Shown on your invoices
            </span>
          </div>

          {/* 3. Country + Currency side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="setup-country" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}>
                Country
              </label>
              <select
                id="setup-country"
                value={defaultCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                disabled={isSubmitting}
                className="form-select"
                style={{ height: '36px', fontSize: '13px' }}
              >
                {COUNTRY_TIMEZONE_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="setup-currency" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #6B7280)' }}>
                Currency
              </label>
              <select
                id="setup-currency"
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                disabled={isSubmitting}
                className="form-select"
                style={{ height: '36px', fontSize: '13px' }}
              >
                {CURRENCIES.map((cur) => (
                  <option key={cur.code} value={cur.code}>
                    {cur.name} ({cur.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim()}
              className="btn btn-primary"
              style={{ width: '100%', height: '38px', fontSize: '13px', fontWeight: 500 }}
            >
              {isSubmitting ? 'Opening workspace...' : 'Open workspace'}
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="btn btn-secondary"
              style={{ width: '100%', height: '34px', fontSize: '12px' }}
            >
              Skip for now
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
