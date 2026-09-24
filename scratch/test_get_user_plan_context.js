import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('c:/Users/T15/reachdesk/.env', 'utf8').split('\n').reduce((acc, line) => {
  if (line.trim() && !line.startsWith('#')) {
    const [k, ...v] = line.split('=');
    acc[k] = v.join('=').trim();
  }
  return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL;
// Use anon key, but we need to pass Authorization token somehow?
// Actually I'll use service role key and bypass it, but wait! The previous agent said "when called from the client".
// I'll sign in as you@example.com
const supabase = createClient(supabaseUrl, env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'you@example.com',
    password: 'password123'
  });
  if (authError) { console.error('Auth error:', authError); return; }

  const { data, error } = await supabase.rpc('get_user_plan_context', { p_user_id: session.user.id });
  console.log('get_user_plan_context:', { data, error });

  const { data: d2, error: e2 } = await supabase.rpc('get_lead_pipeline_stats', { p_user_ids: [session.user.id] });
  console.log('get_lead_pipeline_stats error:', e2);
}

test();
