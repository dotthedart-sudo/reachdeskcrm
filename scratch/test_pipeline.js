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
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'you@example.com',
    password: 'password'
  });
  if (error) {
    console.error('Auth error:', error);
    // Maybe we try the service role just to call the RPC if it has EXECUTE? No, we need auth.
  } else {
    console.log('Authed!', data.user.id);
    const { data: d, error: e } = await supabase.rpc('get_lead_pipeline_stats', { p_user_ids: [data.user.id] });
    console.log('Result:', d, e);
  }
}

test();
