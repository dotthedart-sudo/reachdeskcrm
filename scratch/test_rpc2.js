import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// read .env
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
  console.log('Testing RPC get_lead_pipeline_stats...');
  const { data, error } = await supabase.rpc('get_lead_pipeline_stats', {
    p_user_ids: [userId],
    p_shared_folder_ids: null,
    p_apply_folder_filter: false,
    p_selected_folder_ids: null,
    p_include_unfiled: false,
    p_created_from: null,
    p_created_to: null,
    p_owner_user_id: null,
  });
  console.log('Error:', error);
  console.log('Data:', data);
  
  console.log('Testing countLeads...');
  const { count, error: err2 } = await supabase.from('leads').select('id', { count: 'exact', head: true }).in('user_id', [userId]);
  console.log('Error:', err2);
  console.log('Count:', count);
}

test();
