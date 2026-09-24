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
  const userId = '3e9650bc-a754-4096-a64c-065687a10fac';
  console.log('Testing get_user_plan_context...');
  const { data, error } = await supabase.rpc('get_user_plan_context', { p_user_id: userId });
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
