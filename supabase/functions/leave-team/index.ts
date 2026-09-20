import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { logBillingEvent } from '../_shared/billing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Unauthorized: Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, team_id, team_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 404);
    }

    if (!profile.team_id || (profile.team_role || 'owner').toLowerCase() !== 'member') {
      return jsonResponse({ success: false, error: 'You are not on a team as a member.' }, 400);
    }

    const previousTeamId = profile.team_id;

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        team_id: null,
        team_role: 'owner',
        plan: 'free',
        plan_status: 'inactive',
        trial_ends_at: null
      })
      .eq('id', user.id)
      .eq('team_role', 'member');

    if (updateError) {
      throw new Error(`Failed to leave workspace: ${updateError.message}`);
    }

    await supabaseAdmin
      .from('team_member_permissions')
      .delete()
      .eq('team_id', previousTeamId)
      .eq('user_id', user.id);

    await logBillingEvent(supabaseAdmin, {
      userId: user.id,
      eventType: 'leave_workspace',
      source: 'user_action',
      rawPayload: { previous_team_id: previousTeamId },
    });

    return jsonResponse({
      success: true,
      message: 'You have left the workspace.',
    });
  } catch (error) {
    console.error('[LeaveTeam] Error:', error);
    return jsonResponse({ success: false, error: (error as Error).message }, 400);
  }
});
