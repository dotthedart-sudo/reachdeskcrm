import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canInviteTeammates, getTeamSeatLimitFromProfile } from '../_shared/seatLimits.ts';

const DEFAULT_FROM_EMAIL = 'ReachDesk CRM <invites@mail.app.reachdeskcrm.com>';
const APP_URL = Deno.env.get('APP_URL') || 'https://app.reachdeskcrm.com';

function hasActiveInviteAccess(plan: string, planStatus: string | null): boolean {
  const normalized = (plan || 'trial').toLowerCase();
  if (normalized === 'trial') return true;
  return planStatus === 'active';
}

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
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const jwtToken = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwtToken);
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const { invitedEmail } = await req.json();
    const email = (invitedEmail || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: false, error: 'Valid invitedEmail is required' }, 400);
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, full_name, plan, plan_status, team_id, team_role, extra_seats')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 404);
    }

    const plan = (profile.plan || 'trial').toLowerCase();
    const seatLimit = getTeamSeatLimitFromProfile(profile);
    if (!canInviteTeammates(plan, profile.team_id)) {
      return jsonResponse({ success: false, error: 'Teams plan required to invite teammates' }, 403);
    }
    if (!hasActiveInviteAccess(plan, profile.plan_status)) {
      return jsonResponse({ success: false, error: 'Active subscription required to invite teammates' }, 403);
    }

    if ((profile.team_role || 'owner') !== 'owner') {
      return jsonResponse({ success: false, error: 'Only the workspace owner can send invites' }, 403);
    }

    let teamId = profile.team_id;
    if (!teamId) {
      const ownerEmail = profile.email || user.email || 'user';
      const { data: team, error: teamError } = await supabaseAdmin
        .from('teams')
        .insert({ owner_id: user.id, name: `${ownerEmail}'s Team` })
        .select('id')
        .single();

      if (teamError || !team) {
        console.error('[send-team-invite] team insert failed:', teamError);
        return jsonResponse(
          { success: false, error: teamError?.message || 'Failed to create team workspace' },
          500,
        );
      }

      teamId = team.id;
      const { error: profileUpdateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ team_id: teamId, team_role: 'owner' })
        .eq('id', user.id);

      if (profileUpdateError) {
        console.error('[send-team-invite] profile update failed:', profileUpdateError);
        return jsonResponse({ success: false, error: profileUpdateError.message }, 500);
      }
    }

    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId),
      supabaseAdmin
        .from('team_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'pending'),
    ]);

    const seatsUsed = (memberCount ?? 0) + (pendingCount ?? 0);
    if (seatsUsed >= seatLimit) {
      return jsonResponse({ success: false, error: `All ${seatLimit} seats are in use` }, 400);
    }

    const { data: existingMember } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('team_id', teamId)
      .ilike('email', email)
      .maybeSingle();

    if (existingMember) {
      return jsonResponse({ success: false, error: 'That person is already on your team' }, 400);
    }

    const { data: existingInvite } = await supabaseAdmin
      .from('team_invitations')
      .select('id')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .ilike('invited_email', email)
      .maybeSingle();

    if (existingInvite) {
      return jsonResponse({ success: false, error: 'An invite is already pending for that email' }, 400);
    }

    const inviteToken = crypto.randomUUID();
    const { data: invite, error: insertError } = await supabaseAdmin
      .from('team_invitations')
      .insert({
        team_id: teamId,
        invited_email: email,
        invited_by: user.id,
        invite_token: inviteToken,
        status: 'pending',
      })
      .select('id, invite_token')
      .single();

    if (insertError) {
      console.error('[send-team-invite] insert failed:', insertError);
      return jsonResponse({ success: false, error: insertError.message }, 500);
    }

    const ownerName = profile.full_name || profile.email || 'A ReachDesk user';
    const signupUrl = `${APP_URL.replace(/\/$/, '')}/signup?invite=${invite.invite_token}`;
    const loginUrl = `${APP_URL.replace(/\/$/, '')}/login?invite=${invite.invite_token}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return jsonResponse({
        success: true,
        inviteId: invite.id,
        inviteToken: invite.invite_token,
        emailSent: false,
        warning: 'Invite created but RESEND_API_KEY is not configured',
      });
    }

    const html = `
      <div style="background-color: #0D1117; color: #FFFFFF; font-family: sans-serif; padding: 30px; border-radius: 3px; max-width: 600px; margin: 0 auto; border: 1px solid #21262D;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.08em; font-size: 22px; color: #FFFFFF; font-weight: bold;">ReachDesk</span>
        </div>
        <h2 style="color: #5B8FB9; border-bottom: 1px solid #21262D; padding-bottom: 10px;">You're invited to a team workspace</h2>
        <p><strong>${ownerName}</strong> invited you to collaborate on their ReachDesk CRM pipeline — shared leads, templates, and follow-ups.</p>
        <p>Sign up or log in using <strong>${email}</strong> to join the workspace.</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${signupUrl}" style="background-color: #5B8FB9; color: #0D1117; padding: 12px 24px; text-decoration: none; border-radius: 3px; font-weight: bold; display: inline-block;">Accept invite</a>
        </div>
        <p style="font-size: 0.85rem; color: #8B949E;">Already have an account? <a href="${loginUrl}" style="color: #5B8FB9;">Log in here</a> with ${email}.</p>
        <p style="color: #8B949E; font-size: 0.8rem; border-top: 1px solid #21262D; padding-top: 15px; margin-top: 30px;">
          If you did not expect this invite, you can ignore this email.
        </p>
      </div>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: DEFAULT_FROM_EMAIL,
        reply_to: 'support@reachdeskcrm.com',
        to: [email],
        subject: `${ownerName} invited you to ReachDesk CRM`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error('[send-team-invite] Resend failed:', errText);
      return jsonResponse({
        success: true,
        inviteId: invite.id,
        inviteToken: invite.invite_token,
        emailSent: false,
        warning: 'Invite saved but email failed to send',
      });
    }

    return jsonResponse({
      success: true,
      inviteId: invite.id,
      inviteToken: invite.invite_token,
      emailSent: true,
      teamId,
    });
  } catch (err) {
    console.error('[send-team-invite] error:', err);
    return jsonResponse({ success: false, error: (err as Error).message }, 500);
  }
});
