import { isRealPaddleSubscriptionId } from './billing';

/** Admin/dev accounts — manually granted, not Paddle-paid customers. */
export function isManualAdminAccess(user) {
  return (user?.role ?? '').toLowerCase() === 'admin';
}

/** Real paying customer with a live Paddle subscription on file. */
export function isPaddlePaidCustomer(user) {
  if (!user || isManualAdminAccess(user)) return false;
  const plan = (user.plan ?? '').toLowerCase();
  if (plan === 'trial' || plan === 'enterprise' || plan === 'lifetime') return false;
  const status = (user.plan_status ?? '').toLowerCase();
  if (!['active', 'cancelling'].includes(status)) return false;
  return isRealPaddleSubscriptionId(user.paddle_subscription_id);
}

export const BILLING_PLAN_TABS = ['all', 'trial', 'free', 'starter', 'pro', 'teams'];

export function matchesBillingPlanTab(user, tab) {
  const plan = (user?.plan ?? 'trial').toLowerCase();
  if (tab === 'all') return true;
  if (tab === 'trial') return plan === 'trial';
  return plan === tab;
}

export function formatBillingCycle(cycle) {
  if (!cycle) return '—';
  const value = String(cycle).toLowerCase();
  if (value === 'monthly') return 'Monthly';
  if (value === 'quarterly') return 'Quarterly';
  if (value === 'yearly') return 'Yearly';
  return cycle;
}
