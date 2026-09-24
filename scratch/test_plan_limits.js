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
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Fetching plan_limits...');
  const { data, error } = await supabase.from('plan_limits').select('*');
  console.log(data, error);
}
test();
