import { PLAN_LIMITS, AI_BOT_CREDITS, normalizePlan , getLimit } from './planConfig';
import { getPlanLeadLimit } from './leadLimits';

/** Format lead/template counts from PLAN_LIMITS for marketing copy. */
export function formatLeadCount(planId) {
  const key = normalizePlan(planId);
  const count = getLimit(PLAN_LIMITS[key], 'leads');
  if (count == null) return 'Unlimited leads';
  return `${count.toLocaleString()} leads`;
}

export function formatLeadCountForBilling(planId, billingCycle) {
  const limit = getPlanLeadLimit(normalizePlan(planId), billingCycle);
  if (limit == null) return 'Unlimited leads';
  return `${limit.toLocaleString()} leads`;
}

export function getYearlyLeadUpsellCount(planId, billingCycle) {
  const key = normalizePlan(planId);
  const isYearly = (billingCycle ?? '').toLowerCase() === 'yearly';
  if (isYearly || (key !== 'starter' && key !== 'pro')) return null;
  const base = getPlanLeadLimit(key, billingCycle);
  const yearly = getPlanLeadLimit(key, 'yearly');
  if (base == null || yearly == null || yearly <= base) return null;
  return yearly;
}

export function formatLeadLineForMarketing(planId, billingCycle) {
  const current = formatLeadCountForBilling(planId, billingCycle);
  const yearlyCount = getYearlyLeadUpsellCount(planId, billingCycle);
  if (!yearlyCount) return current;
  return {
    label: current,
    badge: `${yearlyCount.toLocaleString()} if billed yearly`,
  };
}

function formatLeadForTagline(planId, billingCycle) {
  const line = formatLeadLineForMarketing(planId, billingCycle);
  if (typeof line === 'string') return line;
  return `${line.label} (${line.badge})`;
}

export function formatTemplateCount(planId) {
  const key = normalizePlan(planId);
  const count = getLimit(PLAN_LIMITS[key], 'templates');
  if (count == null) return 'Unlimited templates';
  return `${count} templates`;
}

export function formatUserCount(planId) {
  const key = normalizePlan(planId);
  const count = getLimit(PLAN_LIMITS[key], 'users');
  if (count == null || count === Infinity) return 'Unlimited users';
  if (count === 1) return '1 user';
  return `${count} users`;
}

export function getPlanTagline(planId, billingCycle) {
  return `${formatLeadForTagline(planId, billingCycle)} · ${formatUserCount(planId)} · ${formatTemplateCount(planId)}`;
}

export { AI_BOT_CREDITS };

const FREE_FEATURES_BASE = [
  '3 templates',
  '0 AI credits',
  '1 List (folder)',
  'CSV import & export',
  'No integrations',
];

const STARTER_FEATURES_BASE = [
  '10 templates',
  `${AI_BOT_CREDITS.starter} AI credits / month`,
  'Cold Calls · Call Queue',
  '7-checkpoint follow-up reminders',
  'Smart folders · project/niche columns',
  'Notes · whiteboard',
  'Google Sheets import/export',
  'Convert lead to client',
  'Custom columns · copy analytics',
  'Export CSV',
];

const PRO_FEATURES_BASE = [
  '50 templates',
  `${AI_BOT_CREDITS.pro} AI credits / month`,
  'Everything in Starter',
  'Bulk CSV import',
  'Google Calendar sync',
  'Invoices · revenue tracking',
];

const TEAMS_FEATURES_BASE = [
  `${AI_BOT_CREDITS.teams} AI credits / month`,
  'Everything in Pro',
  'Up to 5 team seats',
  'Shared pipeline · templates · folders',
];

export function getPlanFeatures(planId, billingCycle) {
  const key = normalizePlan(planId);
  const leadLine = formatLeadLineForMarketing(key, billingCycle);
  const isYearly = (billingCycle ?? '').toLowerCase() === 'yearly';
  const hasYearlyBonus = isYearly && (key === 'starter' || key === 'pro');

  if (key === 'free') {
    return [leadLine, ...FREE_FEATURES_BASE];
  }

  if (key === 'starter') {
    const features = [leadLine, ...STARTER_FEATURES_BASE];
    if (hasYearlyBonus) {
      features.push({ label: '2,000 leads on yearly', badge: 'Bonus' });
    }
    return features;
  }

  if (key === 'pro') {
    const features = [leadLine, ...PRO_FEATURES_BASE];
    if (hasYearlyBonus) {
      features.push({ label: '2× lead capacity on yearly', badge: 'Bonus' });
    }
    return features;
  }

  if (key === 'teams') {
    return [leadLine, ...TEAMS_FEATURES_BASE];
  }

  return [];
}

export const MARKETING_PLANS = [
  {
    id: 'free',
    name: 'Free',
    tagline: (billing) => getPlanTagline('free', billing),
    getFeatures: (billing) => getPlanFeatures('free', billing),
    comingSoon: false,
    highlighted: false,
    ctaLabel: 'Current Plan',
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: (billing) => getPlanTagline('starter', billing),
    getFeatures: (billing) => getPlanFeatures('starter', billing),
    comingSoon: false,
    highlighted: true,
    ctaLabel: 'Get Starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: (billing) => getPlanTagline('pro', billing),
    getFeatures: (billing) => getPlanFeatures('pro', billing),
    comingSoon: false,
    highlighted: false,
    ctaLabel: 'Get Pro',
  },
  {
    id: 'teams',
    name: 'Teams',
    tagline: (billing) => getPlanTagline('teams', billing),
    getFeatures: (billing) => getPlanFeatures('teams', billing),
    comingSoon: false,
    highlighted: false,
    ctaLabel: 'Get Teams',
  },
];

export const PLANS = MARKETING_PLANS;

export const TRIAL_MARKETING = {
  leads: PLAN_LIMITS.trial.leads,
  templates: PLAN_LIMITS.trial.templates,
  aiCredits: AI_BOT_CREDITS.trial,
  days: 7,
  headline: 'Start 7-day free trial',
  ctaNav: 'Start free trial',
  detail: `7-day trial · ${AI_BOT_CREDITS.trial} AI credits · ${PLAN_LIMITS.trial.leads} leads · ${PLAN_LIMITS.trial.templates} templates · no card required`,
  micro: 'No credit card · cancel anytime',
};

export const HOMEPAGE_OUTCOMES = [
  {
    id: 'today',
    title: 'Know who to contact today',
    desc: 'Open ReachDesk CRM and see the exact leads waiting on a follow-up — not a buried spreadsheet row.',
  },
  {
    id: 'slip',
    title: 'Stop quiet leads from dying',
    desc: 'Seven checkpoints keep Warm and Cold leads alive while you deliver client work.',
  },
  {
    id: 'close',
    title: 'Close without switching tools',
    desc: 'Templates, pipeline, and invoices live in one place so booked calls turn into paid work.',
  },
];

export const HOMEPAGE_FEATURES = [
  {
    id: 'pipeline',
    title: 'Pipeline that shows the next move',
    desc: 'Hot, Warm, Cold priorities plus an 11-stage pipeline — every lead has a status and an action.',
  },
  {
    id: 'reminders',
    title: '7-checkpoint follow-ups',
    desc: 'Mark a lead Contacted once. ReachDesk CRM schedules the reminders so nothing slips while you\'re heads-down.',
  },
  {
    id: 'templates',
    title: 'Templates that sound like you',
    desc: 'Save winning outreach. Drop in name, niche, and project placeholders in seconds — or draft with AI.',
  },
  {
    id: 'revenue',
    title: 'Invoices when the deal closes',
    desc: 'Draft invoices from won leads and track monthly revenue without a second spreadsheet.',
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    step: '1',
    title: 'Capture the lead',
    desc: 'Add a name, niche, and where you found them — takes under a minute.',
  },
  {
    step: '2',
    title: 'Mark Contacted',
    desc: 'ReachDesk CRM schedules your follow-up checkpoints automatically.',
  },
  {
    step: '3',
    title: 'Follow up until close',
    desc: 'Get nudged until they reply, book, or you mark Won / Lost.',
  },
];

export const HOMEPAGE_FIT = [
  'Freelancers juggling delivery and outreach',
  'Solo operators tired of Notes + Sheets + memory',
  'Small agencies that need a shared next-step view',
];
