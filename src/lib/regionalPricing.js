/** Regional display pricing — checkout uses Paddle price IDs from Paywalls BILLING. */

export const EXCLUDED_COUNTRY_CODES = ['IL'];

export const REGIONAL_MONTHLY = {
  US: { currency: 'USD', starter: 5, pro: 15, symbol: '$', prefix: true },
  CA: { currency: 'CAD', starter: 7, pro: 19, symbol: 'CA$', prefix: true },
  GB: { currency: 'GBP', starter: 3.99, pro: 11.99, symbol: '£', prefix: true },
  EU: { currency: 'EUR', starter: 4.99, pro: 13.99, symbol: '€', prefix: true },
  AU: { currency: 'AUD', starter: 8, pro: 22, symbol: 'A$', prefix: true },
  PK: { currency: 'PKR', starter: 350, pro: 999, symbol: 'Rs ', prefix: true },
  BD: { currency: 'BDT', starter: 209, pro: 599, symbol: '৳', prefix: true },
  IN: { currency: 'INR', starter: 350, pro: 999, symbol: '₹', prefix: true },
  PH: { currency: 'PHP', starter: 209, pro: 599, symbol: '₱', prefix: true },
  NG: { currency: 'NGN', starter: 2099, pro: 5999, symbol: '₦', prefix: true },
  KE: { currency: 'KES', starter: 350, pro: 999, symbol: 'KSh ', prefix: true },
};

const COUNTRY_TO_REGION = {
  US: 'US', CA: 'CA', GB: 'GB', UK: 'GB',
  DE: 'EU', FR: 'EU', IT: 'EU', ES: 'EU', NL: 'EU', BE: 'EU', AT: 'EU', IE: 'EU', PT: 'EU',
  AU: 'AU', PK: 'PK', BD: 'BD', IN: 'IN', PH: 'PH', NG: 'NG', KE: 'KE',
  AE: 'US', SA: 'US',
};

export function resolvePricingRegion(countryCode) {
  if (!countryCode) return 'US';
  const cc = countryCode.toUpperCase();
  if (EXCLUDED_COUNTRY_CODES.includes(cc)) return null;
  return COUNTRY_TO_REGION[cc] || 'US';
}

export function isRegionExcluded(countryCode) {
  return EXCLUDED_COUNTRY_CODES.includes((countryCode || '').toUpperCase());
}

function cycleMultiplier(cycle) {
  if (cycle === 'quarterly') return { months: 3, discount: 0.15, badge: 'Save 15%' };
  if (cycle === 'yearly') return { months: 12, discount: 0.3, badge: 'Save 30%' };
  return { months: 1, discount: 0, badge: null };
}

export function formatRegionalPrice(amount, regionConfig) {
  const { symbol, prefix, suffix } = regionConfig;
  const formatted = Number(amount) % 1 === 0 ? String(amount) : Number(amount).toFixed(2);
  if (suffix) return `${formatted}${suffix}`;
  if (prefix) return `${symbol}${formatted}`;
  return `${formatted}${symbol}`;
}

export function getRegionalPlanPrice(regionKey, planId, cycle = 'monthly') {
  const region = REGIONAL_MONTHLY[regionKey] || REGIONAL_MONTHLY.US;
  const base = planId === 'pro' ? region.pro : region.starter;
  const { months, discount, badge } = cycleMultiplier(cycle);
  const monthlyEffective = base * (1 - discount);
  const total = monthlyEffective * months;
  return {
    region,
    monthlyEffective,
    total,
    months,
    badge,
    perMonthLabel: formatRegionalPrice(monthlyEffective, region),
    totalLabel: formatRegionalPrice(total, region),
  };
}

/** Primary monthly price label for checkout/marketing cards. */
export function formatPlanPrimaryPrice(country, pricing, livePrice, planId) {
  if (livePrice) return `${livePrice.formatted}/mo`;
  if (!pricing) return '';
  const region = resolvePricingRegion(country);
  const fallback = getRegionalPlanPrice(region, planId, 'monthly');
  return `approx ${fallback.perMonthLabel}/mo`;
}

/** Billing cycle subline (local currency). */
export function formatPlanBillingCycle(country, pricing, billingMonths, billingKey, livePrice, liveMonthlyPrice, planId) {
  const every = billingMonths === 1 ? 'monthly' : `every ${billingMonths} months`;
  if (livePrice) return `${livePrice.formatted} billed ${every}`;
  if (!pricing) return '';
  
  const region = resolvePricingRegion(country);
  const fallback = getRegionalPlanPrice(region, planId, billingKey);
  const total = fallback.totalLabel;
  return `approx ${total} billed ${every}`;
}

/** Card hero amount — total when quarterly/yearly, monthly rate when monthly. */
export function formatPlanHeroAmount(country, pricing, billingKey, planId, livePrice) {
  if (planId === 'free') return 'Free';
  if (livePrice) return livePrice.formatted;
  if (!pricing) return '—';
  
  const region = resolvePricingRegion(country);
  const fallback = getRegionalPlanPrice(region, planId, billingKey);
  const monthly = billingKey === 'monthly';
  return `approx ${monthly ? fallback.perMonthLabel : fallback.totalLabel}`;
}

/** Period label paired with formatPlanHeroAmount. */
export function formatPlanHeroPeriod(billingKey, planId) {
  if (planId === 'free') return '';
  if (billingKey === 'monthly') return '/ month';
  if (billingKey === 'quarterly') return ' every 3 months';
  if (billingKey === 'yearly') return ' / year';
  return '';
}

/** Subline under hero — effective /mo when billing upfront. */
export function formatPlanHeroSub(country, pricing, billingKey, formatLocalPrice, liveMonthlyPrice, planId) {
  if (billingKey === 'monthly') return ''; 
  if (liveMonthlyPrice) return `${liveMonthlyPrice.formatted}/mo effective`;
  if (!pricing) return '';
  
  const region = resolvePricingRegion(country);
  const fallback = getRegionalPlanPrice(region, planId, billingKey);
  return `approx ${fallback.perMonthLabel}/mo effective`;
}

/** Extra billing note — avoids duplicating the hero total on longer cycles. */
export function formatPlanHeroBillingNote(country, pricing, billingKey, livePrice, planId) {
  if (!pricing && !livePrice) return '';
  if (billingKey === 'monthly') {
    return formatPlanBillingCycle(country, pricing, 1, billingKey, livePrice, null, planId);
  }
  return '';
}
