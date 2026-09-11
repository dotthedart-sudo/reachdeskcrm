/**
 * Single source of truth for call outcomes (built-ins) and rules.
 * Later extended to support custom user-defined outcomes.
 */

export const DEFAULT_OUTCOMES = [
  {
    label: 'Answered',
    color: '#10b981', // from Reports/callOutcomeRules '#22c55e' or '#10b981'
    terminal: false,
    follow_up_days: 3,
    suggested_call_status: 'Answered',
    suggested_call_action: 'Callback scheduled',
    suggested_priority: 'Warm',
  },
  {
    label: 'No Answer',
    color: '#f59e0b',
    terminal: false,
    follow_up_days: 1,
    suggested_call_status: 'No answer',
    suggested_call_action: 'Try again tomorrow',
    suggested_priority: 'Cold',
  },
  {
    label: 'Voicemail Left',
    color: '#3b82f6',
    terminal: false,
    follow_up_days: 1,
    suggested_call_status: 'Voicemail left',
    suggested_call_action: 'Try again tomorrow',
    suggested_priority: 'Cold',
  },
  {
    label: 'Busy',
    color: '#a855f7',
    terminal: false,
    follow_up_days: 1,
    suggested_call_status: 'Busy',
    suggested_call_action: 'Try again tomorrow',
    suggested_priority: 'Cold',
  },
  {
    label: 'Callback Requested',
    color: '#ec4899',
    terminal: false,
    follow_up_days: 0,
    suggested_call_status: 'Callback requested',
    suggested_call_action: 'Callback scheduled',
    suggested_priority: 'Warm',
  },
  {
    label: 'Wrong Number',
    color: '#ef4444',
    terminal: true,
    follow_up_days: null,
    suggested_call_status: 'Wrong number',
    suggested_call_action: 'Wrong number — remove',
    suggested_priority: 'Cold',
  },
  {
    label: 'Not Interested',
    color: '#6b7280',
    terminal: true,
    follow_up_days: null,
    suggested_call_status: 'Not interested',
    suggested_call_action: 'Not interested — close',
    suggested_priority: 'Cold',
  },
];

export const CALL_OUTCOMES = DEFAULT_OUTCOMES.map((o) => o.label);

export const DEFAULT_OUTCOME_RULES = DEFAULT_OUTCOMES.map((o) => ({
  outcome: o.label,
  suggested_call_status: o.suggested_call_status,
  suggested_call_action: o.suggested_call_action,
  suggested_priority: o.suggested_priority,
}));

export const TERMINAL_OUTCOMES = new Set(
  DEFAULT_OUTCOMES.filter((o) => o.terminal).map((o) => o.label)
);

export const FOLLOW_UP_DAYS = DEFAULT_OUTCOMES.reduce((acc, o) => {
  acc[o.label] = o.follow_up_days;
  return acc;
}, {});

export const OUTCOME_COLORS = DEFAULT_OUTCOMES.reduce((acc, o) => {
  acc[o.label] = o.color;
  return acc;
}, {});

export const QUICK_LOG_OUTCOMES = [
  { label: 'Answered', outcome: 'Answered' },
  { label: 'Voicemail', outcome: 'Voicemail Left' },
  { label: 'No answer', outcome: 'No Answer' },
  { label: 'Not interested', outcome: 'Not Interested' },
];

import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const customOutcomesCache = {};

export function useCustomCallOutcomes() {
  const [outcomes, setOutcomes] = useState(DEFAULT_OUTCOMES);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setOutcomes(DEFAULT_OUTCOMES);
          return;
        }
        
        const uid = session.user.id;
        const cacheKey = `outcomes_${uid}`;

        if (!customOutcomesCache[cacheKey]) {
          customOutcomesCache[cacheKey] = (async () => {
            const { data, error } = await supabase
              .from('custom_call_outcomes')
              .select('*')
              .eq('user_id', uid)
              .order('sort_order', { ascending: true });
            
            if (error) throw error;
            
            const merged = [...DEFAULT_OUTCOMES];
            if (data) {
              data.forEach(co => {
                const base = DEFAULT_OUTCOMES.find(o => o.label === co.based_on);
                if (base) {
                  merged.push({
                    ...base,
                    label: co.label,
                    color: co.color,
                    based_on: co.based_on,
                    is_custom: true,
                    is_archived: co.is_archived,
                  });
                }
              });
            }
            return merged;
          })();
        }

        try {
          const result = await customOutcomesCache[cacheKey];
          if (mounted) setOutcomes(result);
        } catch (err) {
          delete customOutcomesCache[cacheKey];
          console.error('Error loading custom call outcomes:', err);
          if (mounted) setOutcomes(DEFAULT_OUTCOMES);
        }
      } catch (err) {
        console.error('Auth error fetching outcomes:', err);
        if (mounted) setOutcomes(DEFAULT_OUTCOMES);
      }
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Clear cache on auth change
      for (const k in customOutcomesCache) delete customOutcomesCache[k];
      load();
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  return outcomes;
}

export function clearCustomOutcomesCache() {
  for (const k in customOutcomesCache) delete customOutcomesCache[k];
}
