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
  ID: { currency: 'IDR', starter: 63000, pro: 179000, symbol: 'Rp ', prefix: true },
  NG: { currency: 'NGN', starter: 2099, pro: 5999, symbol: '₦', prefix: true },
  KE: { currency: 'KES', starter: 350, pro: 999, symbol: 'KSh ', prefix: true },
  EG: { currency: 'EGP', starter: 129, pro: 369, symbol: 'E£ ', prefix: true },
  IQ: { currency: 'IQD', starter: 5500, pro: 15500, symbol: '', prefix: false, suffix: ' IQD' },
  IR: { currency: 'TOMAN', starter: 175000, pro: 499000, symbol: '', prefix: false, suffix: ' Toman' },
  SY: { currency: 'USD', starter: 3, pro: 9, symbol: '$', prefix: true },
};

const COUNTRY_TO_REGION = {
  US: 'US', CA: 'CA', GB: 'GB', UK: 'GB',
  DE: 'EU', FR: 'EU', IT: 'EU', ES: 'EU', NL: 'EU', BE: 'EU', AT: 'EU', IE: 'EU', PT: 'EU',
  AU: 'AU', PK: 'PK', BD: 'BD', IN: 'IN', PH: 'PH', ID: 'ID', NG: 'NG', KE: 'KE', EG: 'EG',
  IQ: 'IQ', IR: 'IR', SY: 'SY', AE: 'US', SA: 'US',
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
export function formatPlanPrimaryPrice(country, pricing) {
  if (!pricing) return '';
  if (country === 'PK') return `Rs ${pricing.pkrPerMonth}/mo`;
  if (country === 'BD') return `৳${pricing.bdtPerMonth.toFixed(0)}/mo`;
  return `$${pricing.usdPerMonth}/mo`;
}

/** USD reference for PK/BD (canonical Paddle USD, not FX conversion). */
export function formatPlanUsdReference(country, pricing) {
  if (!pricing || (country !== 'PK' && country !== 'BD')) return null;
  return `$${pricing.usdPerMonth} USD total`;
}

/** Billing cycle subline (local currency). */
export function formatPlanBillingCycle(country, pricing, billingMonths, billingKey) {
  if (!pricing) return '';
  const every = billingMonths === 1 ? 'monthly' : `every ${billingMonths} months`;
  if (country === 'PK') {
    return billingKey === 'monthly'
      ? `Rs ${pricing.pkrTotal} billed monthly`
      : `Rs ${pricing.pkrTotal} billed ${every}`;
  }
  if (country === 'BD') {
    return billingKey === 'monthly'
      ? `৳${pricing.bdtTotal.toFixed(0)} billed monthly`
      : `৳${pricing.bdtTotal.toFixed(0)} billed ${every}`;
  }
  return billingKey === 'monthly'
    ? `$${pricing.usdTotal} billed monthly`
    : `$${pricing.usdTotal} billed ${every}`;
}

/** USD total reference for PK/BD billing cycles. */
export function formatPlanUsdTotalReference(country, pricing) {
  if (!pricing || (country !== 'PK' && country !== 'BD')) return null;
  return `$${pricing.usdTotal} USD total`;
}

/** Card hero amount — total when quarterly/yearly, monthly rate when monthly. */
export function formatPlanHeroAmount(country, pricing, billingKey) {
  if (!pricing) return '—';
  const monthly = billingKey === 'monthly';
  if (country === 'PK') {
    return monthly ? `Rs ${pricing.pkrPerMonth}` : `Rs ${pricing.pkrTotal}`;
  }
  if (country === 'BD') {
    return monthly ? `৳${pricing.bdtPerMonth.toFixed(0)}` : `৳${pricing.bdtTotal.toFixed(0)}`;
  }
  return monthly ? `$${pricing.usdPerMonth}` : `$${pricing.usdTotal}`;
}

/** Period label paired with formatPlanHeroAmount. */
export function formatPlanHeroPeriod(billingKey) {
  if (billingKey === 'monthly') return '/ month';
  if (billingKey === 'quarterly') return ' every 3 months';
  if (billingKey === 'yearly') return ' / year';
  return '';
}

/** Subline under hero — USD ref on monthly; effective /mo when billing upfront. */
export function formatPlanHeroSub(country, pricing, billingKey, formatLocalPrice) {
  if (!pricing) return '';
  if (billingKey === 'monthly') {
    const usdRef = formatPlanUsdReference(country, pricing);
    if (usdRef) return usdRef;
    const formatted = formatLocalPrice?.(pricing.usdPerMonth);
    return formatted ? `${formatted}/mo` : '';
  }
  if (country === 'PK') return `Rs ${pricing.pkrPerMonth}/mo · $${pricing.usdPerMonth}/mo effective`;
  if (country === 'BD') return `৳${pricing.bdtPerMonth.toFixed(0)}/mo · $${pricing.usdPerMonth}/mo effective`;
  const formatted = formatLocalPrice?.(pricing.usdPerMonth);
  return formatted ? `${formatted}/mo effective` : `$${pricing.usdPerMonth}/mo effective`;
}

/** Extra billing note — avoids duplicating the hero total on longer cycles. */
export function formatPlanHeroBillingNote(country, pricing, billingKey) {
  if (!pricing) return '';
  if (billingKey === 'monthly') {
    return formatPlanBillingCycle(country, pricing, 1, billingKey);
  }
  return formatPlanUsdTotalReference(country, pricing) || '';
}
