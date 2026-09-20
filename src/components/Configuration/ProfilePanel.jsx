import React from 'react';
import { AlertCircle, Check, Save, Upload, Settings } from 'lucide-react';
import CurrencySelector, { CURRENCY_MAP } from '../CurrencySelector';
import { formatTimeZoneLabel } from '../../lib/dateTime';

const CURRENCY_SYMBOLS = CURRENCY_MAP;

export default function ProfilePanel({
  profileName,
  setProfileName,
  profileAvatarUrl,
  profileAvatarPreview,
  profileAvatarFile,
  profileDefaultCurrency,
  setProfileDefaultCurrency,
  defaultPaymentLink,
  setDefaultPaymentLink,
  defaultPaymentInstructions,
  setDefaultPaymentInstructions,
  monthlyRevenueTarget,
  setMonthlyRevenueTarget,
  profileTimezone,
  setProfileTimezone,
  browserTimezone,
  timezoneOptions,
  profileError,
  profileSuccess,
  profileSaving,
  onAvatarChange,
  onSubmit,
  localBrand,
  setLocalBrand,
  localCurrency,
  setLocalCurrency,
  localWebhook,
  setLocalWebhook,
  currentUser,
}) {
  return (
    <form onSubmit={onSubmit} className="flex-col gap-4">
      <div className="card rd-page-form">
        <div className="rd-page-form-header">
          <h3>Profile</h3>
          <p className="rd-modal-sub">How you appear on invoices and in the app.</p>
        </div>

        {profileError && (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{profileError}</span>
          </div>
        )}

        {profileSuccess && (
          <div className="auth-success-banner" role="status">
            <Check size={15} />
            <span>{profileSuccess}</span>
          </div>
        )}

        <div className="rd-form">
          <div className="rd-form-row">
            <div className="rd-form-group">
              <label className="form-label">Full name</label>
              <input
                type="text"
                className="form-input"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Jane Doe"
                required
                disabled={profileSaving}
              />
            </div>

            <div className="rd-form-group">
              <label className="form-label">Profile photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {profileAvatarPreview ? (
                  <img
                    src={profileAvatarPreview}
                    alt="Avatar Preview"
                    style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                  />
                ) : profileAvatarUrl ? (
                  <img
                    src={profileAvatarUrl}
                    alt="Current Avatar"
                    style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <Upload size={16} />
                  </div>
                )}
                <label
                  htmlFor="avatar-upload"
                  className="btn btn-secondary btn-sm"
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Upload size={14} /> Choose photo
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={onAvatarChange}
                  style={{ display: 'none' }}
                  disabled={profileSaving}
                />
                {profileAvatarFile && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {profileAvatarFile.name.slice(0, 20)}{profileAvatarFile.name.length > 20 ? '...' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rd-form-row">
            <div className="rd-form-group">
              <label className="form-label">Default currency</label>
              <CurrencySelector
                value={profileDefaultCurrency}
                onChange={(val) => setProfileDefaultCurrency(val)}
                placeholder="Select currency..."
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Used on invoices and targets</span>
            </div>

            <div className="rd-form-group">
              <label className="form-label">Monthly revenue target</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '0.9rem' }}>
                  {CURRENCY_SYMBOLS[profileDefaultCurrency] || '$'}
                </span>
                <input
                  type="number"
                  className="form-input"
                  style={{ paddingLeft: (CURRENCY_SYMBOLS[profileDefaultCurrency] || '$').length > 1 ? '2.75rem' : '1.75rem' }}
                  value={monthlyRevenueTarget}
                  onChange={(e) => setMonthlyRevenueTarget(e.target.value)}
                  placeholder="e.g. 5000"
                  disabled={profileSaving}
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Monthly earnings goal</span>
            </div>

            <div className="rd-form-group">
              <label className="form-label">Timezone</label>
              <select
                className="form-input"
                value={profileTimezone}
                onChange={(e) => setProfileTimezone(e.target.value)}
                disabled={profileSaving}
              >
                <option value="">Auto — use device timezone</option>
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
              {!profileTimezone && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Using your device: {formatTimeZoneLabel(browserTimezone)} ({browserTimezone})
                </span>
              )}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Auto uses your device timezone for activity logs and timestamps. Pick a fixed zone only if you want to override.
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Settings size={16} style={{ color: 'var(--primary-purple)' }} />
            <h4 className="rd-form-section-title" style={{ margin: 0 }}>Business & invoicing</h4>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Freelancer Brand Label Name</label>
              <input
                type="text"
                className="form-input"
                value={localBrand}
                onChange={(e) => setLocalBrand(e.target.value)}
                placeholder="e.g. ESEMDOT Core Solutions"
                required
                disabled={profileSaving}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Operation Currency Node Symbol</label>
              <input
                type="text"
                className="form-input"
                value={localCurrency}
                onChange={(e) => setLocalCurrency(e.target.value)}
                placeholder="e.g. PKR"
                required
                disabled={profileSaving}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Default Payment Link</label>
              <input
                type="url"
                className="form-input"
                value={defaultPaymentLink}
                onChange={(e) => setDefaultPaymentLink(e.target.value)}
                placeholder="e.g. https://buy.stripe.com/... or PayPal.Me/..."
                disabled={profileSaving}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Automatically added to new invoices</span>
            </div>

            <div className="form-group">
              <label className="form-label">Default Payment Instructions</label>
              <textarea
                className="form-input"
                value={defaultPaymentInstructions}
                onChange={(e) => setDefaultPaymentInstructions(e.target.value)}
                placeholder="e.g. Bank transfer details, wise account..."
                disabled={profileSaving}
                rows={3}
                style={{ resize: 'vertical' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>Shown on invoices when paid manually</span>
            </div>
          </div>

          {(currentUser?.plan || '').toLowerCase() !== 'starter' && (
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Webhook URL (Telemetry Integrations)</label>
              <input
                type="url"
                className="form-input"
                value={localWebhook}
                onChange={(e) => setLocalWebhook(e.target.value)}
                placeholder="e.g. https://api.yourdomain.com/v1/telemetry"
                disabled={profileSaving}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={profileSaving}>
            <Save size={16} /> {profileSaving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </form>
  );
}
