import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing! Check your .env file.');
}

export const isPlanLimitError = (err) => {
  const msg = err?.message || err?.error?.message || err?.error || '';
  const code = err?.code || '';
  return typeof msg === 'string' && (
    msg.includes('limit reached') ||
    msg.includes('not available on your current plan') ||
    msg.includes('violates row-level security') ||
    code === '42501'
  );
};

const customFetch = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      
      if (isPlanLimitError(data)) {
        const tableMatch = url.match(/\/rest\/v1\/([^?]+)/);
        const table = tableMatch ? tableMatch[1] : 'unknown';
        const msg = data?.message || data?.error?.message || data?.error || '';
        const code = data?.code || '';
        
        window.dispatchEvent(new CustomEvent('reachdesk:limit-error', { 
          detail: { msg, code, table, url } 
        }));
      }
    } catch (e) {
      console.warn('[Supabase Interceptor] Failed to parse error response:', e);
    }
  }
  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch
  }
});
