import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLocalCurrency } from '../utils/useLocalCurrency';
import { APP_DOMAIN, isLocalDev } from '../utils/domain';
import { PLANS, getPlanFeatures } from '../lib/planMarketing';
import { ShinyButton } from '@/registry/magicui/shiny-button';
import { isRegionExcluded, formatPlanHeroAmount, formatPlanHeroPeriod, formatPlanHeroSub, formatPlanHeroBillingNote } from '../lib/regionalPricing';
import { normalizePlan, EXTRA_TEAMS_SEAT_PRICE_ID, EXTRA_SEAT_USD_MONTHLY, TEAMS_INCLUDED_SEATS, MAX_EXTRA_SEATS_PER_ACTION } from '../lib/planConfig';
import { isTeamMember } from '../lib/teamWorkspace';
import MemberBillingNotice from './MemberBillingNotice';
import AuthLogo from './AuthLogo';

// ─── Unified Pricing Data ──────────────────────────────────────────────────
// ⚠️  SYNC WARNING: Mirrored in supabase/functions/_shared/prices.ts
export const BILLING = {
  monthly: {
    label: 'Monthly',
    badge: null,
    months: 1,
    starter: {
      priceId: 'pri_01kyjynvsztqyctmvng7jwm3a2',
      usdPerMonth: '5.00',
      usdTotal: '5.00',
      pkrPerMonth: 350,
      pkrTotal: 350,
      bdtPerMonth: 209,
      bdtTotal: 209,
      badge: null
    },
    pro: {
      priceId: 'pri_01kym7e8a59znm8wt54233phs0',
      usdPerMonth: '15.00',
      usdTotal: '15.00',
      pkrPerMonth: 999,
      pkrTotal: 999,
      bdtPerMonth: 599,
      bdtTotal: 599,
      badge: null
    },
    teams: {
      priceId: 'pri_01kymbs35k74ep884frg6cvjze',
      usdPerMonth: '29.00',
      usdTotal: '29.00',
      pkrPerMonth: 1949,
      pkrTotal: 1949,
      bdtPerMonth: 1159,
      bdtTotal: 1159,
      badge: null
    }
  },
  quarterly: {
    label: 'Quarterly',
    badge: 'Save 15%',
    months: 3,
    starter: {
      priceId: 'pri_01kym6qvynxjby24z4s1303qne',
      usdPerMonth: '4.25',
      usdTotal: '12.75',
      pkrPerMonth: 298,
      pkrTotal: 893,
      bdtPerMonth: 178,
      bdtTotal: 533,
      badge: 'Save 15%'
    },
    pro: {
      priceId: 'pri_01kym7nbacv5z4p9w9e4z3ggh7',
      usdPerMonth: '12.75',
      usdTotal: '38.25',
      pkrPerMonth: 849,
      pkrTotal: 2549,
      bdtPerMonth: 509,
      bdtTotal: 1527,
      badge: 'Save 15%'
    },
    teams: {
      priceId: 'pri_01kymckgvx8xsg84zkygzfr72d',
      usdPerMonth: '24.65',
      usdTotal: '73.95',
      pkrPerMonth: 1657,
      pkrTotal: 4971,
      bdtPerMonth: 985,
      bdtTotal: 2955,
      badge: 'Save 15%'
    }
  },
  yearly: {
    label: 'Yearly',
    badge: 'Save 30%',
    months: 12,
    starter: {
      priceId: 'pri_01kym74hqdz60rj3fn5hvtk487',
      usdPerMonth: '3.50',
      usdTotal: '42.00',
      pkrPerMonth: 245,
      pkrTotal: 2940,
      bdtPerMonth: 146,
      bdtTotal: 1754,
      badge: 'Save 30%'
    },
    pro: {
      priceId: 'pri_01kym81ydj3gdb8crd8m9qrdk2',
      usdPerMonth: '10.50',
      usdTotal: '126.00',
      pkrPerMonth: 699,
      pkrTotal: 8392,
      bdtPerMonth: 419,
      bdtTotal: 5030,
      badge: 'Save 30%'
    },
    teams: {
      priceId: 'pri_01kymd8sne7zm5hvz7vdqwcymg',
      usdPerMonth: '20.30',
      usdTotal: '243.60',
      pkrPerMonth: 1364,
      pkrTotal: 16368,
      bdtPerMonth: 811,
      bdtTotal: 9732,
      badge: 'Save 30%'
    }
  }
};

// Plan copy/features come from ../lib/planMarketing (PLANS + getPlanFeatures)

// ─── Shared Screens ──────────────────────────────────────────────────────────
export function PendingScreen({ profile, handleLogout }) {
  return (
    <div className="paywall-overlay" style={{ backgroundColor: 'var(--bg-page)', backgroundImage: 'none', fontFamily: 'Mattone, sans-serif' }}>
      <div className="paywall-card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', boxShadow: 'none', animation: 'none' }}>
        <div className="paywall-icon" style={{ background: 'var(--accent-blue)', boxShadow: 'none' }}><Lock size={36} /></div>
        <h1 className="paywall-title" style={{ fontFamily: 'Mattone, sans-serif' }}>Activation Pending</h1>
        <p className="paywall-text">
          Your upgrade request for <strong>{profile?.requested_plan?.toUpperCase()}</strong> is pending
          administrator verification. Your data is fully safe.
        </p>
        <button onClick={handleLogout} className="btn btn-secondary w-full" style={{ marginTop: '1rem', justifyContent: 'center', borderRadius: '3px' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}

export function DeniedScreen({ handleLogout }) {
  return (
    <div className="paywall-overlay" style={{ backgroundColor: 'var(--bg-page)', backgroundImage: 'none', fontFamily: 'Mattone, sans-serif' }}>
      <div className="paywall-card" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', boxShadow: 'none', animation: 'none' }}>
        <div className="paywall-icon" style={{ background: 'var(--accent-blue)', boxShadow: 'none' }}><ShieldAlert size={36} /></div>
        <h1 className="paywall-title" style={{ fontFamily: 'Mattone, sans-serif' }}>Access Denied</h1>
        <p className="paywall-text">
          Your workspace access has been denied. Please contact support at support@reachdeskcrm.com.
        </p>
        <button onClick={handleLogout} className="btn btn-secondary w-full" style={{ marginTop: '1rem', justifyContent: 'center', borderRadius: '3px' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}

// ─── Plan Card Component ──────────────────────────────────────────────────────
const PLAN_LEVELS = {
  trial: 0,
  starter: 1,
  pro: 2,
  teams: 3,
};

function PlanCard({ plan, billing, onSelectPlan, profile, country, formatLocalPrice }) {
  const { id, name, tagline, comingSoon, highlighted, ctaLabel } = plan;
  const features = getPlanFeatures(id, billing);
  const checkoutBlocked = isRegionExcluded(country);

  const hasPricing = BILLING[billing] && BILLING[billing][id];
  const pricing = hasPricing ? BILLING[billing][id] : null;

  const currentUserPlan = normalizePlan(profile?.plan);
  const isPlanActive = profile?.plan_status === 'active' || profile?.plan_status === 'cancelling';
  const userPlanLevel = PLAN_LEVELS[currentUserPlan] ?? 0;
  const cardPlanLevel = PLAN_LEVELS[id.toLowerCase()] ?? 0;
  const isCurrentPlan = isPlanActive && currentUserPlan === id.toLowerCase();
  const isUpgrade = isPlanActive && cardPlanLevel > userPlanLevel;

  let cardStatus = 'disabled';
  let isSelectable = false;

  if (isCurrentPlan) {
    cardStatus = 'current';
  } else if (isPlanActive) {
    if (isUpgrade) {
      cardStatus = 'upgrade';
      isSelectable = true;
    }
  } else if (!comingSoon) {
    cardStatus = 'selectable';
    isSelectable = true;
  }

  const renderPrice = () => formatPlanHeroAmount(country, pricing, billing);
  const renderPeriod = () => formatPlanHeroPeriod(billing);
  const renderDetailsSub = () => formatPlanHeroSub(country, pricing, billing, formatLocalPrice);
  const renderBillingNote = () => formatPlanHeroBillingNote(country, pricing, billing);

  const savingsLabel = (() => {
    if (billing === 'monthly' || !pricing || cardStatus === 'current') return null;
    const monthlyPrice = parseFloat(BILLING.monthly[id].usdPerMonth);
    const currentPrice = parseFloat(pricing.usdPerMonth);
    const savings = monthlyPrice - currentPrice;
    if (country === 'BD' && BILLING.monthly[id].bdtPerMonth && pricing.bdtPerMonth) {
      const bdtSavings = BILLING.monthly[id].bdtPerMonth - pricing.bdtPerMonth;
      if (bdtSavings > 0) return `Save ৳${bdtSavings}/mo`;
    }
    if (country === 'PK' && BILLING.monthly[id].pkrPerMonth && pricing.pkrPerMonth) {
      const pkrSavings = BILLING.monthly[id].pkrPerMonth - pricing.pkrPerMonth;
      if (pkrSavings > 0) return `Save Rs ${pkrSavings}/mo`;
    }
    const formatted = formatLocalPrice(savings);
    if (formatted) return `Save ${formatted}/mo`;
    if (savings > 0) return `Save $${savings.toFixed(2)}/mo`;
    return pricing.badge;
  })();

  const ctaText =
    cardStatus === 'current'
      ? 'Current plan'
      : cardStatus === 'upgrade'
        ? `Upgrade to ${name}`
        : (ctaLabel || 'Get Started');

  return (
    <div
      className={`rd-pricing-card${highlighted ? ' rd-pricing-popular' : ''}${cardStatus === 'disabled' ? ' disabled' : ''}`}
    >
      {highlighted && cardStatus !== 'current' && (
        <span className="rd-pricing-popular-badge">Most popular</span>
      )}
      {cardStatus === 'current' && (
        <span className="rd-pricing-tag rd-pricing-tag--current">
          <Check size={11} aria-hidden /> Current plan
        </span>
      )}
      {cardStatus !== 'current' && savingsLabel && (
        <span className="rd-pricing-tag rd-pricing-tag--save">{savingsLabel}</span>
      )}

      <div className="rd-pricing-card-header">
        <div className="rd-pricing-plan-name">{name}</div>
        <p className="rd-pricing-tagline">
          {typeof tagline === 'function' ? tagline(billing) : tagline}
        </p>
        <div className="rd-pricing-price-main">
          <span className="rd-pricing-price-amount">{renderPrice()}</span>
          {renderPeriod() && (
            <span className="rd-pricing-price-period">{renderPeriod()}</span>
          )}
        </div>
        {renderDetailsSub() && (
          <span className="rd-pricing-price-sub">{renderDetailsSub()}</span>
        )}
        {renderBillingNote() && (
          <div className="rd-pricing-price-billing">
            <span className="rd-pricing-price-sub">{renderBillingNote()}</span>
          </div>
        )}
      </div>

      <ul className="rd-pricing-features">
        {features.map((feat, i) => {
          const isObj = typeof feat === 'object';
          const label = isObj ? feat.label : feat;
          return (
            <li key={`${id}-${label}-${i}`} className="rd-pricing-feature">
              <Check size={15} className="rd-pricing-feature-icon" aria-hidden />
              <span className="rd-pricing-feature-text">{label}</span>
              {isObj && feat.badge && (
                <span className="rd-pricing-feature-badge">{feat.badge}</span>
              )}
            </li>
          );
        })}
      </ul>

      {checkoutBlocked && isSelectable ? (
        <p className="rd-upgrade-region-block">
          Checkout is not available in your region. Contact support@reachdeskcrm.com.
        </p>
      ) : isSelectable ? (
        <ShinyButton
          onClick={() => onSelectPlan(id, pricing?.priceId, cardStatus === 'upgrade')}
          className="rd-pricing-cta"
        >
          {ctaText}
        </ShinyButton>
      ) : cardStatus === 'current' ? (
        <>
          <button type="button" className="rd-pricing-cta disabled" disabled>
            <Check size={14} aria-hidden /> Current plan
          </button>
          <p className="rd-upgrade-renewal">
            {profile?.paddle_next_billing_date
              ? `Renews ${profile.paddle_next_billing_date}`
              : `Your ${name} plan is active.`}
          </p>
        </>
      ) : (
        <button type="button" className="rd-pricing-cta disabled" disabled>
          {comingSoon ? 'Coming soon' : 'Not available'}
        </button>
      )}
    </div>
  );
}

// ─── Main UpgradePage Export ──────────────────────────────────────────────────
function normalizeBillingCycle(cycle) {
  const key = String(cycle || '').toLowerCase();
  return ['monthly', 'quarterly', 'yearly'].includes(key) ? key : null;
}

function hasPaddleSubscription(profile) {
  const id = String(profile?.paddle_subscription_id || '');
  return id.startsWith('sub_');
}

export function UpgradePage({ profile, handleLogout, onRefreshProfile, bankAccount, bankIban, isEmbedded = false }) {
  const profileCycle = normalizeBillingCycle(profile?.billing_cycle) || 'monthly';
  const [billing, setBilling] = useState(profileCycle);
  const { formatLocalPrice, country } = useLocalCurrency();
  const [upgradeModal, setUpgradeModal] = useState(null); // { planKey, charge, loading, error, confirming, extraSeats }
  const [teamsCheckoutModal, setTeamsCheckoutModal] = useState(null); // { priceId, extraSeats }
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const next = normalizeBillingCycle(profile?.billing_cycle);
    if (next) setBilling(next);
  }, [profile?.billing_cycle]);

  useEffect(() => {
    if (window.Paddle) {
      window.Paddle.Initialize({
        token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
      });
    }
  }, []);

  const openPaddleCheckout = async (planKey, priceId, extraSeats = 0) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !priceId) return;
    if (profile?.role === 'admin' || isTeamMember(profile)) return;

    const items = [{ priceId, quantity: 1 }];
    const extraQty = planKey === 'teams' ? Math.min(MAX_EXTRA_SEATS_PER_ACTION, Math.max(0, Number(extraSeats) || 0)) : 0;
    if (extraQty > 0) {
      items.push({ priceId: EXTRA_TEAMS_SEAT_PRICE_ID, quantity: extraQty });
    }

    window.Paddle.Checkout.open({
      items,
      customer: { email: user.email },
      customData: { supabase_user_id: user.id },
      successUrl: isLocalDev()
        ? `${window.location.origin}/dashboard?upgraded=true`
        : `${APP_DOMAIN}/dashboard?upgraded=true`,
    });
  };

  const canUseProratedUpgrade = (isUpgradeClick) => {
    if (!isUpgradeClick) return false;
    if (!hasPaddleSubscription(profile)) return false;
    const currentCycle = normalizeBillingCycle(profile?.billing_cycle);
    if (!currentCycle) return false;
    // Same-cycle upgrades only
    return billing === currentCycle;
  };

  const runUpgradePreview = async (planKey, extraSeats = 0) => {
    const extra = planKey === 'teams' ? Math.min(MAX_EXTRA_SEATS_PER_ACTION, Math.max(0, Number(extraSeats) || 0)) : 0;

    setUpgradeModal((prev) => ({
      ...(prev || {}),
      planKey,
      charge: null,
      loading: true,
      confirming: false,
      error: '',
      extraSeats: planKey === 'teams' ? extra : undefined,
    }));

    try {
      const { data, error } = await supabase.functions.invoke('upgrade-subscription', {
        body: {
          action: 'preview',
          targetPlan: planKey,
          billingCycle: billing,
          extraSeats: extra,
        },
      });

      if (error) throw error;
      if (data?.useCheckout) {
        const priceId = BILLING[billing]?.[planKey]?.priceId;
        setUpgradeModal(null);
        if (planKey === 'teams') {
          setTeamsCheckoutModal({ priceId, extraSeats: extra });
        } else {
          await openPaddleCheckout(planKey, priceId);
        }
        return;
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Could not estimate upgrade charge');
      }

      setUpgradeModal({
        planKey,
        charge: data.immediateCharge,
        loading: false,
        confirming: false,
        error: '',
        billingCycle: data.billingCycle,
        fromPlan: data.fromPlan,
        toPlan: data.toPlan,
        extraSeats: planKey === 'teams' ? extra : undefined,
      });
    } catch (err) {
      console.error('[UpgradePage] preview failed:', err);
      setUpgradeModal((prev) => ({
        ...(prev || {}),
        planKey,
        charge: null,
        loading: false,
        confirming: false,
        error: err.message || 'Could not estimate upgrade charge',
        extraSeats: planKey === 'teams' ? extra : undefined,
      }));
    }
  };

  const handleSelectPlan = async (planKey, priceId, isUpgradeClick) => {
    setActionError('');
    if (profile?.role === 'admin' || isTeamMember(profile)) return;

    if (!canUseProratedUpgrade(isUpgradeClick)) {
      if (planKey === 'teams') {
        setTeamsCheckoutModal({ priceId, extraSeats: 0 });
        return;
      }
      await openPaddleCheckout(planKey, priceId);
      return;
    }

    await runUpgradePreview(planKey, 0);
  };

  const confirmProratedUpgrade = async () => {
    if (!upgradeModal?.planKey || upgradeModal.confirming) return;
    setUpgradeModal((prev) => ({ ...prev, confirming: true, error: '' }));

    try {
      const { data, error } = await supabase.functions.invoke('upgrade-subscription', {
        body: {
          action: 'confirm',
          targetPlan: upgradeModal.planKey,
          billingCycle: upgradeModal.billingCycle || billing,
          extraSeats: upgradeModal.planKey === 'teams' ? (upgradeModal.extraSeats ?? 0) : 0,
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Upgrade charge failed. Your plan was not changed.');
      }

      setUpgradeModal(null);
      if (onRefreshProfile) await onRefreshProfile();
      window.location.href = isLocalDev()
        ? `${window.location.origin}/dashboard?upgraded=true`
        : `${APP_DOMAIN}/dashboard?upgraded=true`;
    } catch (err) {
      console.error('[UpgradePage] confirm failed:', err);
      setUpgradeModal((prev) => ({
        ...prev,
        confirming: false,
        error: err.message || 'Upgrade charge failed. Your plan was not changed.',
      }));
    }
  };

  const isTrialExpired = profile?.plan === 'trial';

  if (profile?.role === 'admin') {
    return <MemberBillingNotice profile={profile} variant="admin" />;
  }

  if (isTeamMember(profile)) {
    return <MemberBillingNotice profile={profile} variant="member" />;
  }

  const headerTitle = isEmbedded
    ? 'Upgrade your workspace'
    : isTrialExpired
      ? 'Your free trial has ended'
      : 'Renew your subscription';

  const headerSub = isEmbedded
    ? 'Pick Starter or Pro — billed monthly, quarterly, or yearly. Upgrade anytime.'
    : isTrialExpired
      ? 'Choose a plan to keep your leads, templates, and pipeline data.'
      : `Your plan expired${profile?.plan_expires_at ? ` on ${new Date(profile.plan_expires_at).toLocaleDateString()}` : ''}. Renew below to unlock your workspace.`;

  const planName = (key) => PLANS.find((p) => p.id === key)?.name || String(key || '').toUpperCase();

  return (
    <div className={`rd-upgrade-page${isEmbedded ? ' rd-upgrade-page--embedded' : ' rd-upgrade-page--standalone'}`}>
      <div className="rd-upgrade-inner">
        {!isEmbedded && (
          <div className="rd-upgrade-brand">
            <AuthLogo />
          </div>
        )}

        <header className="rd-upgrade-header">
          {!isEmbedded && (
            <div className="rd-upgrade-icon" aria-hidden>
              <Lock size={22} />
            </div>
          )}
          <h1 className="rd-upgrade-title">{headerTitle}</h1>
          <p className="rd-upgrade-sub">{headerSub}</p>
        </header>

        {actionError && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: 'rgba(224, 82, 82, 0.1)',
            border: '1px solid rgba(224, 82, 82, 0.25)',
            color: 'var(--status-hot)',
            fontSize: '0.875rem',
          }}
          >
            {actionError}
          </div>
        )}

        <div className="rd-billing-toggle-wrap">
          <div className="rd-billing-toggle" role="tablist" aria-label="Billing cycle">
            {Object.entries(BILLING).map(([key, info]) => (
              <button
                key={key}
                type="button"
                className={`rd-billing-btn${billing === key ? ' active' : ''}`}
                onClick={() => setBilling(key)}
              >
                {info.label}
                {info.badge && <span className="rd-billing-save">{info.badge}</span>}
              </button>
            ))}
          </div>
        </div>

        {billing === 'yearly' && (
          <p className="rd-pricing-yearly-callout">Yearly: Starter gets 2,000 leads · Pro gets 2× lead capacity.</p>
        )}

        {hasPaddleSubscription(profile) && normalizeBillingCycle(profile?.billing_cycle) && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem', textAlign: 'center' }}>
            Same-cycle upgrades (your {normalizeBillingCycle(profile.billing_cycle)} plan) are prorated and charged immediately via Paddle.
            Changing billing cycle still uses checkout.
          </p>
        )}

        <div className="rd-pricing-grid">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billing={billing}
              onSelectPlan={handleSelectPlan}
              profile={profile}
              country={country}
              formatLocalPrice={formatLocalPrice}
            />
          ))}
        </div>

        {!isEmbedded && (
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-secondary rd-upgrade-logout"
          >
            Log out
          </button>
        )}
      </div>

      {upgradeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="proration-upgrade-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => {
            if (!upgradeModal.confirming && !upgradeModal.loading) setUpgradeModal(null);
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '1.25rem',
              background: 'var(--bg-card)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <h3 id="proration-upgrade-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Confirm upgrade
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setUpgradeModal(null)}
                disabled={upgradeModal.confirming || upgradeModal.loading}
                aria-label="Close"
                style={{ padding: '0.25rem 0.4rem' }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {upgradeModal.fromPlan
                ? (
                  <>
                    Upgrade from <strong style={{ textTransform: 'capitalize' }}>{planName(upgradeModal.fromPlan)}</strong>
                    {' '}to <strong>{planName(upgradeModal.toPlan || upgradeModal.planKey)}</strong>
                    {' '}({upgradeModal.billingCycle || billing}).
                  </>
                )
                : (
                  <>Upgrade to <strong>{planName(upgradeModal.planKey)}</strong> ({billing}).</>
                )}
            </p>

            {upgradeModal.planKey === 'teams' && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="upgrade-extra-seats" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Additional members (beyond {TEAMS_INCLUDED_SEATS} included)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    id="upgrade-extra-seats"
                    type="number"
                    min={0}
                    max={MAX_EXTRA_SEATS_PER_ACTION}
                    value={upgradeModal.extraSeats ?? 0}
                    onChange={(e) => {
                      const next = Math.min(MAX_EXTRA_SEATS_PER_ACTION, Math.max(0, Number(e.target.value) || 0));
                      runUpgradePreview('teams', next);
                    }}
                    className="form-input"
                    style={{ width: 88 }}
                    disabled={upgradeModal.confirming || upgradeModal.loading}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    × ${EXTRA_SEAT_USD_MONTHLY}/mo each
                  </span>
                </div>
              </div>
            )}

            {upgradeModal.loading ? (
              <p style={{ margin: '1rem 0', color: 'var(--text-muted)' }}>Calculating prorated charge…</p>
            ) : (
              <div style={{
                marginTop: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-hover)',
              }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Due today (prorated)
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
                  {upgradeModal.charge?.formatted || '—'}
                </div>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Charged now via your payment method on file. Your plan updates only if the charge succeeds.
                </p>
              </div>
            )}

            {upgradeModal.error && (
              <div style={{
                marginTop: '0.85rem',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                background: 'rgba(224, 82, 82, 0.1)',
                border: '1px solid rgba(224, 82, 82, 0.25)',
                color: 'var(--status-hot)',
                fontSize: '0.85rem',
              }}
              >
                {upgradeModal.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUpgradeModal(null)}
                disabled={upgradeModal.confirming || upgradeModal.loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmProratedUpgrade}
                disabled={upgradeModal.loading || upgradeModal.confirming || (!upgradeModal.charge && !!upgradeModal.error)}
              >
                {upgradeModal.confirming ? 'Charging…' : 'Confirm & pay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {teamsCheckoutModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="teams-checkout-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setTeamsCheckoutModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 460, width: '100%', padding: '1.25rem', background: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
              <h3 id="teams-checkout-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Teams plan — choose team size
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setTeamsCheckoutModal(null)}
                aria-label="Close"
                style={{ padding: '0.25rem 0.4rem' }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Teams includes {TEAMS_INCLUDED_SEATS} members. Add more now if you need a larger workspace — each extra seat is ${EXTRA_SEAT_USD_MONTHLY}/month with full Teams access.
            </p>

            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="checkout-extra-seats" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Additional members (optional)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  id="checkout-extra-seats"
                  type="number"
                  min={0}
                  max={MAX_EXTRA_SEATS_PER_ACTION}
                  value={teamsCheckoutModal.extraSeats ?? 0}
                  onChange={(e) => {
                    const next = Math.min(MAX_EXTRA_SEATS_PER_ACTION, Math.max(0, Number(e.target.value) || 0));
                    setTeamsCheckoutModal((prev) => ({ ...prev, extraSeats: next }));
                  }}
                  className="form-input"
                  style={{ width: 88 }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  × ${EXTRA_SEAT_USD_MONTHLY}/mo each
                </span>
              </div>
            </div>

            <div style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-hover)',
            }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Estimated monthly total
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.25rem' }}>
                ${(
                  Number(BILLING[billing]?.teams?.usdPerMonth || 29)
                  + (teamsCheckoutModal.extraSeats || 0) * EXTRA_SEAT_USD_MONTHLY
                ).toFixed(2)}/mo
              </div>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {TEAMS_INCLUDED_SEATS + (teamsCheckoutModal.extraSeats || 0)} total seats
                {' '}({TEAMS_INCLUDED_SEATS} included{(teamsCheckoutModal.extraSeats || 0) > 0 ? ` + ${teamsCheckoutModal.extraSeats} paid` : ''})
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.1rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTeamsCheckoutModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const { priceId, extraSeats } = teamsCheckoutModal;
                  setTeamsCheckoutModal(null);
                  await openPaddleCheckout('teams', priceId, extraSeats);
                }}
              >
                Continue to checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
