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
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const userId = '3e9650bc-a754-4096-a64c-065687a10fac';
  
  console.log('Testing countLeads with service role...');
  const { count, error: err2 } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  console.log('Error:', err2);
  console.log('Count:', count);

  const { data: leads } = await supabase.from('leads').select('id, user_id').eq('user_id', userId).limit(5);
  console.log('Leads:', leads);
}

test();
