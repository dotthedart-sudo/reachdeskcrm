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
  console.log('Testing leads schema...');
  const feedColumns = 'id, user_id, first_name, last_name, status, call_status, created_at, last_contacted_at, last_called_at, action_to_take, next_checkpoint_at, template_used, reply_type, meeting_ends_at';
  const { data, error } = await supabase.from('leads').select(feedColumns).limit(1);
  console.log('Error:', error);
}

test();
