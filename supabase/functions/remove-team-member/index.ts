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

    const { memberId } = await req.json().catch(() => ({}));
    if (!memberId || typeof memberId !== 'string') {
      return jsonResponse({ success: false, error: 'memberId is required' }, 400);
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
    const { data: ownerProfile, error: ownerErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, team_id, team_role')
      .eq('id', user.id)
      .single();

    if (ownerErr || !ownerProfile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 404);
    }

    if (!ownerProfile.team_id || (ownerProfile.team_role || 'owner').toLowerCase() !== 'owner') {
      return jsonResponse({ success: false, error: 'Only the workspace owner can remove members.' }, 403);
    }

    const { data: memberProfile, error: memberErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, team_id, team_role')
      .eq('id', memberId)
      .single();

    if (memberErr || !memberProfile) {
      return jsonResponse({ success: false, error: 'Member not found' }, 404);
    }

    if (memberProfile.team_id !== ownerProfile.team_id) {
      return jsonResponse({ success: false, error: 'That user is not on your workspace.' }, 400);
    }

    if ((memberProfile.team_role || 'owner').toLowerCase() === 'owner') {
      return jsonResponse({ success: false, error: 'Cannot remove the workspace owner.' }, 400);
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        team_id: null,
        team_role: 'owner',
        plan: 'free',
        plan_status: 'inactive',
        trial_ends_at: null
      })
      .eq('id', memberId)
      .eq('team_id', ownerProfile.team_id)
      .eq('team_role', 'member');

    if (updateError) {
      throw new Error(`Failed to remove member: ${updateError.message}`);
    }

    await supabaseAdmin
      .from('team_member_permissions')
      .delete()
      .eq('team_id', ownerProfile.team_id)
      .eq('user_id', memberId);

    await logBillingEvent(supabaseAdmin, {
      userId: user.id,
      eventType: 'remove_team_member',
      source: 'owner_action',
      rawPayload: {
        removed_user_id: memberId,
        removed_email: memberProfile.email,
        team_id: ownerProfile.team_id,
      },
    });

    return jsonResponse({
      success: true,
      message: 'Team member removed.',
    });
  } catch (error) {
    console.error('[RemoveTeamMember] Error:', error);
    return jsonResponse({ success: false, error: (error as Error).message }, 400);
  }
});
