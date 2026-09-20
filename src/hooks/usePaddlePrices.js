import { useState, useEffect } from 'react';
import { isRegionExcluded } from '../lib/regionalPricing';
import { BILLING } from '../components/Paywalls';
import { EXTRA_TEAMS_SEAT_PRICE_ID } from '../lib/planConfig';

// Cache to prevent refetching during session
const PREVIEW_CACHE = {};

export function usePaddlePrices(country, billingCycle) {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!billingCycle || isRegionExcluded(country)) {
      setLoading(false);
      return;
    }

    const cacheKey = `${country}-${billingCycle}`;
    if (PREVIEW_CACHE[cacheKey]) {
      setPrices(PREVIEW_CACHE[cacheKey]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    const fetchPrices = async () => {
      // Wait for Paddle.js to initialize
      let attempts = 0;
      while (!window.Paddle?.Initialized && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (!window.Paddle?.Initialized || !window.Paddle?.PricePreview) {
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
        return;
      }

      const cycleData = BILLING[billingCycle];
      if (!cycleData) {
        if (isMounted) setLoading(false);
        return;
      }

      const items = [];
      if (cycleData.starter?.priceId) items.push({ priceId: cycleData.starter.priceId, quantity: 1 });
      if (cycleData.pro?.priceId) items.push({ priceId: cycleData.pro.priceId, quantity: 1 });
      if (cycleData.teams?.priceId) items.push({ priceId: cycleData.teams.priceId, quantity: 1 });
      
      // Always fetch the extra seat monthly price
      items.push({ priceId: EXTRA_TEAMS_SEAT_PRICE_ID, quantity: 1 });

      try {
        const result = await window.Paddle.PricePreview({
          items,
          customerIpAddress: '', // Paddle infers from IP automatically if we omit it, but we can't easily spoof country from client side JS unless we pass address.
          address: {
            countryCode: country || 'US'
          }
        });

        if (isMounted && result?.data?.details?.lineItems) {
          const parsed = {};
          for (const item of result.data.details.lineItems) {
            // Paddle returns totals including taxes if applicable
            // For base display we want the unit price formatted
            const price = item.price;
            parsed[price.id] = {
              amount: (price.unitPrice.amount / 100),
              currency: price.unitPrice.currencyCode,
              formatted: item.formattedTotals.subtotal // Formatted string from paddle
            };
          }
          PREVIEW_CACHE[cacheKey] = parsed;
          setPrices(parsed);
        } else if (isMounted) {
          setError(true);
        }
      } catch (err) {
        console.error('Paddle PricePreview error:', err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPrices();

    return () => {
      isMounted = false;
    };
  }, [country, billingCycle]);

  return { prices, loading, error };
}
