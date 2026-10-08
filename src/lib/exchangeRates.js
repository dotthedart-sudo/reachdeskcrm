// Latest exchange rates (free source, no API key), cached for 12 hours.
// rates[X] = how many X you get for 1 unit of the base currency.
const CACHE_PREFIX = 'rd_fx_rates_';
const CACHE_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

function readCache(base) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + base);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(base, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + base, JSON.stringify(data));
  } catch {
    /* storage unavailable: fine, we just refetch next time */
  }
}

/** Returns { rates, date } for the base currency, or null if nothing could be loaded. */
export async function getLatestRates(base = 'USD') {
  const B = String(base || 'USD').toUpperCase();
  const cached = readCache(B);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${B}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.rates) throw new Error('No rates in response');
    const data = { rates: json.rates, date: json.date || null, fetchedAt: Date.now() };
    writeCache(B, data);
    return data;
  } catch (err) {
    console.warn('[exchangeRates] Could not load latest rates:', err?.message || err);
    return cached || null; // fall back to the last known rates, even if old
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converts an amount from one currency to the base currency of `rates`.
 * Returns null when the rate is unknown (so callers can skip it and say so).
 */
export function convertToBase(amount, from, base, rates) {
  const F = String(from || base).toUpperCase();
  const B = String(base).toUpperCase();
  if (F === B) return amount;
  const rate = rates?.[F];
  if (!rate) return null;
  return amount / rate;
}
