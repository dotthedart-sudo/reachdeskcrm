import React from 'react';
import { CreditCard, Check, AlertCircle } from 'lucide-react';
import { PLAN_LIMITS, getEffectivePlan, getEffectiveBillingCycle } from '../../lib/utils';
import { getPlanLeadLimit } from '../../lib/leadLimits';
import { getAiCreditLimit } from '../../lib/aiCredits';
import {
  canResumeSubscription,
  formatPlanCancelsAt,
  hasCancellableSubscription,
} from '../../lib/billing';
import { TEAMS_INCLUDED_SEATS, EXTRA_SEAT_USD_MONTHLY, getExtraSeats } from '../../lib/planConfig';

export default function BillingPanel({
  currentUser,
  cancelSuccessMsg,
  cancelErrorMsg,
  resumeSuccessMsg,
  resumeErrorMsg,
  billingActionLoading,
  leadsCount,
  templatesCount,
  aiUsage,
  isProOwner,
  teamLoading,
  seatsUsed,
  seatLimit,
  seatsAtCap,
  extraSeats = 0,
  canAddTeamMembers = false,
  onAddTeamMembers,
  onManagePlan,
  onCancelSubscription,
  onResumeSubscription,
  onSyncSubscription,
}) {
  const planKey = getEffectivePlan(currentUser);
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.trial;
  const maxLeads = getPlanLeadLimit(planKey, getEffectiveBillingCycle(currentUser)) ?? limits.leads;
  const maxTemplates = limits.templates;
  const maxAi = aiUsage.limit || getAiCreditLimit(planKey);
  const canCancel = hasCancellableSubscription(currentUser);
  const canResume = canResumeSubscription(currentUser);
  const accessEndsLabel = formatPlanCancelsAt(currentUser?.plan_cancels_at);

  return (
    <div className="card flex-col gap-3">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
        <CreditCard size={18} style={{ color: 'var(--accent-blue)' }} />
        <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Billing &amp; Subscription</h3>
      </div>

      {cancelSuccessMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Check size={15} style={{ flexShrink: 0 }} />
          <span>{cancelSuccessMsg}</span>
        </div>
      )}

      {resumeSuccessMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Check size={15} style={{ flexShrink: 0 }} />
          <span>{resumeSuccessMsg}</span>
        </div>
      )}

      {cancelErrorMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(224, 82, 82, 0.1)', border: '1px solid rgba(224, 82, 82, 0.2)', color: 'var(--status-hot)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{cancelErrorMsg}</span>
        </div>
      )}

      {resumeErrorMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(224, 82, 82, 0.1)', border: '1px solid rgba(224, 82, 82, 0.2)', color: 'var(--status-hot)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{resumeErrorMsg}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '100px' }}>Current Plan</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
            {currentUser?.plan || 'Trial'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '100px' }}>Status</span>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: '3px',
            background: currentUser?.plan_status === 'active'
              ? 'rgba(16, 185, 129, 0.1)'
              : 'rgba(245, 158, 11, 0.1)',
            color: currentUser?.plan_status === 'active'
              ? '#10b981'
              : 'var(--warning-color)',
            border: `1px solid ${
              currentUser?.plan_status === 'active'
                ? '#10b981'
                : 'rgba(245, 158, 11, 0.4)'
            }`,
          }}
          >
            {currentUser?.plan_status === 'active'
              ? 'Active'
              : currentUser?.plan_status === 'cancelling'
                ? 'Cancelling'
                : currentUser?.plan === 'trial'
                  ? 'Trial'
                  : 'Inactive'}
          </span>
        </div>
        {currentUser?.plan_status === 'cancelling' && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Access continues until{' '}
            <strong>{accessEndsLabel || 'the end of your billing period'}</strong>.
            {' '}Your plan will not renew after this.
          </p>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Leads</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {leadsCount} / {maxLeads === Infinity || maxLeads === null ? 'Unlimited' : maxLeads.toLocaleString()}
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--accent-blue)',
              width: `${maxLeads === Infinity || maxLeads === null ? 0 : Math.min(100, (leadsCount / maxLeads) * 100)}%`,
              borderRadius: '4px',
            }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Templates</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {templatesCount} / {maxTemplates === Infinity || maxTemplates === null ? 'Unlimited' : maxTemplates}
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--accent-blue)',
              width: `${maxTemplates === Infinity || maxTemplates === null ? 0 : Math.min(100, (templatesCount / maxTemplates) * 100)}%`,
              borderRadius: '4px',
            }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>AI credits {planKey === 'trial' ? '(trial)' : '(this month)'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {aiUsage.loading ? '…' : `${aiUsage.used} / ${maxAi}`}
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--accent-blue)',
              width: `${maxAi ? Math.min(100, (aiUsage.used / maxAi) * 100) : 0}%`,
              borderRadius: '4px',
            }}
            />
          </div>
        </div>

        {isProOwner && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Team seats</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {teamLoading ? '…' : `${seatsUsed} / ${seatLimit}`}
                {extraSeats > 0 && (
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    {' '}({TEAMS_INCLUDED_SEATS} included + {extraSeats} extra)
                  </span>
                )}
              </span>
            </div>
            <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: seatsAtCap ? 'var(--warning-color)' : 'var(--accent-blue)',
                width: `${Math.min(100, (seatsUsed / seatLimit) * 100)}%`,
                borderRadius: '4px',
              }}
              />
            </div>
          </div>
        )}

        {canAddTeamMembers && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Need more teammates? Add paid seats anytime — ${EXTRA_SEAT_USD_MONTHLY}/month each beyond your {TEAMS_INCLUDED_SEATS} included members.
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onAddTeamMembers}
              style={{ alignSelf: 'flex-start' }}
            >
              Add more members
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={onManagePlan}>
          <CreditCard size={15} /> Manage Plan
        </button>

        {canCancel && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancelSubscription}
            disabled={billingActionLoading}
            style={{ color: 'var(--status-hot)', borderColor: 'color-mix(in srgb, var(--status-hot) 35%, var(--border))' }}
          >
            {billingActionLoading ? 'Working…' : 'Cancel Subscription'}
          </button>
        )}

        {canResume && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onResumeSubscription}
            disabled={billingActionLoading}
          >
            {billingActionLoading ? 'Working…' : 'Resume Subscription'}
          </button>
        )}

        {onSyncSubscription && (currentUser?.plan === 'trial' || String(currentUser?.paddle_subscription_id || '').startsWith('sub_test')) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSyncSubscription}
            disabled={billingActionLoading}
          >
            {billingActionLoading ? 'Syncing…' : 'Sync from Paddle'}
          </button>
        )}
      </div>
    </div>
  );
}
