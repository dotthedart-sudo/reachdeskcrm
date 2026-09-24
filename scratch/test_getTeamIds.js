import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('c:/Users/T15/reachdesk/.env', 'utf8').split('\n').reduce((acc, line) => {
  if (line.trim() && !line.startsWith('#')) {
    const [k, ...v] = line.split('=');
    acc[k] = v.join('=').trim();
  }
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const getTeamIds = async (userId, opts = {}) => {
  const respectLeadIsolation = opts.respectLeadIsolation !== false;
  if (!userId) return [];
  try {
    const { data: p, error: e1 } = await supabase.from('user_profiles')
      .select('team_id, team_role').eq('id', userId).maybeSingle();
    console.log('Profile:', p, 'Error:', e1);
    if (!p || !p.team_id) return [userId];

    const role = (p.team_role || 'owner').toLowerCase();
    if (respectLeadIsolation && role === 'member') {
      const { data: team, error: e2 } = await supabase
        .from('teams')
        .select('members_see_own_leads_only')
        .eq('id', p.team_id)
        .maybeSingle();
      console.log('Team:', team, 'Error:', e2);
      if (team?.members_see_own_leads_only) {
        return [userId];
      }
    }

    const { data: members, error: e3 } = await supabase.from('user_profiles')
      .select('id').eq('team_id', p.team_id);
    console.log('Members:', members, 'Error:', e3);
    if (!members || members.length === 0) return [userId];
    const ids = members.map(m => m.id).filter(Boolean);
    if (!ids.includes(userId)) ids.push(userId);
    return ids;
  } catch (err) {
    console.error('Error fetching team IDs:', err);
    return [userId];
  }
};

async function test() {
  const userId = '3e9650bc-a754-4096-a64c-065687a10fac';
  console.log('Testing getTeamIds...');
  const ids = await getTeamIds(userId);
  console.log('Result ids:', ids);
}

test();
