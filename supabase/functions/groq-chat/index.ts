import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAiCreditLimit, getAiCreditPeriodStart, normalizePlan } from '../_shared/aiCredits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_MODES = ['draft-reply', 'support'] as const;
type Mode = typeof ALLOWED_MODES[number];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ── Base system prompts ───────────────────────────────────────────────────────
const DRAFT_REPLY_PROMPT =
  "You are a professional outreach assistant helping a freelancer/agency owner reply to a lead. Write natural, human-sounding replies. Match the lead's language and tone. Keep it concise.";

// Support prompt is generated dynamically with account context — see buildSupportPrompt()
const SUPPORT_PROMPT_FALLBACK =
  "You are a helpful in-app assistant for ReachDesk CRM, a lead-tracking tool for freelancers and agencies. Answer the user's question about how to use the app clearly and concisely. If you don't know something app-specific, say so rather than guessing.";

// ── Helper: JSON response ────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Helper: build personalised support system prompt ────────────────────────
function buildSupportPrompt(plan: string, leadCount: number, memberSince: string): string {
  return `You are a helpful in-app assistant for ReachDesk CRM, a lead-tracking tool for freelancers and agencies.

User Context:
- Plan: ${plan}
- Tracked Leads: ${leadCount}
- Member Since: ${memberSince}

INSTRUCTIONS:
1. Keep answers short — 2 to 4 sentences unless the user explicitly asks for more detail or a step-by-step walkthrough.
2. Answer ONLY the specific question asked. Do not proactively list other features, tips, or related information unless the user asks for it.
3. If there's a natural one-line follow-up worth offering, you may end with a short offer like "Want me to walk you through that?" — but do not dump unrequested information.
4. Answer questions accurately based ONLY on actual ReachDesk capabilities listed below. If asked about an unbuilt feature, state clearly and politely that it is not available.

FEATURE REFERENCE (For your internal knowledge — do NOT recite this list verbatim):
Available Features (HAS):
- CRM & Lead Management: Kanban/Pipeline and Table views, lead priorities (Hot/Warm/Cold), statuses (Lead, Contacted, Meeting Set, Proposal Sent, Closed Won, Closed Lost), custom fields, CSV bulk import/export, Quick Add Lead, Quick Cleanup.
- Organization: Manual folders and Smart Folders with dynamic rules.
- Message Templates & AI: Starter and custom email/messaging templates with variable placeholders ({first_name}, {company}), plus AI message draft generation ("Generate with AI") for Trial/Pro/Teams plans.
- Invoicing & Revenue Tracker: Built-in invoice generator (public link, PDF download, payment status) and Revenue Tracker.
- Notes & Visual Boards: Rich-text canvas notes and interactive Drawing Board (whiteboard).
- Integrations: Google Calendar sync (on Trial/Pro/Teams/Enterprise) and Google Sheets import/export.
- Reminders & Chatbot: Follow-up reminders and this in-app AI assistant.

Unavailable Features (DOES NOT HAVE YET):
- Instagram / Facebook DM automation or direct message sending inside ReachDesk.
- Native in-app SMS sending.
- In-app text translation.
- Automated "Action to Take" execution.
- Direct email sending server (ReachDesk pre-fills drafts/links for external email clients).`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Auth check ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized: Missing Authorization header' }, 401);
  }

  // Create a user-scoped client — all queries made through this client are
  // automatically restricted to what the token owner can access (via RLS).
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // userId comes ONLY from the verified JWT — never from the request body.
  const userId = user.id;

  // ── Plan Access Check ───────────────────────────────────────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userProfile } = await supabaseUserClient
    .from('user_profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();

  const { data: planCtx } = await supabaseAdmin.rpc('get_user_plan_context', { p_user_id: userId });
  const effectivePlan = (planCtx?.plan || 'free').toLowerCase();

  const { data: planLimit } = await supabaseAdmin
    .from('plan_limits')
    .select('ai_credits')
    .eq('plan', effectivePlan)
    .maybeSingle();

  const creditLimit = planLimit?.ai_credits || 0;

  if (creditLimit <= 0) {
    return jsonResponse(
      { error: 'AI credits are not available on your plan.' },
      403,
    );
  }

  // ── Parse and validate request body ─────────────────────────────────────
  let body: { mode?: unknown; messages?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { mode, messages } = body;

  // Validate mode
  if (!mode || !ALLOWED_MODES.includes(mode as Mode)) {
    return jsonResponse(
      { error: `Invalid mode. Must be one of: ${ALLOWED_MODES.join(', ')}` },
      400,
    );
  }

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'messages must be a non-empty array' }, 400);
  }

  for (const msg of messages) {
    if (
      typeof msg !== 'object' ||
      msg === null ||
      !['user', 'system', 'assistant'].includes(msg.role) ||
      typeof msg.content !== 'string'
    ) {
      return jsonResponse(
        { error: 'Each message must have a valid role (user|system|assistant) and a string content' },
        400,
      );
    }
  }

  // ── Plan-based AI credit limit ──────────────────────────────────────────
  const periodStart = getAiCreditPeriodStart(effectivePlan, userProfile?.created_at);

  const { count: requestCount, error: countError } = await supabaseAdmin
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', periodStart);

  if (countError) {
    console.error('[groq-chat] Credit check error:', countError);
  } else if ((requestCount ?? 0) >= creditLimit) {
    return jsonResponse(
      {
        error: 'AI credit limit reached for your plan.',
        code: 'AI_CREDITS_EXCEEDED',
        used: requestCount ?? 0,
        limit: creditLimit,
      },
      429,
    );
  }

  // ── Build system prompt ──────────────────────────────────────────────────
  let systemPrompt: string;

  if (mode === 'support') {
    // Fetch account context scoped to the current user's JWT (via RLS + user client).
    // We never use service role here, and we never trust a user ID from the body.
    // Two queries: user profile (plan, created_at) + lead count owned by this user.
    try {
      const [profileResult, leadsResult] = await Promise.all([
        supabaseUserClient
          .from('user_profiles')
          .select('plan, created_at')
          .eq('id', userId)
          .maybeSingle(),
        supabaseUserClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

      const profileData = profileResult.data;
      const leadCount = leadsResult.count ?? 0;

      const plan = profileData?.plan ?? 'trial';
      const memberSince = profileData?.created_at
        ? new Date(profileData.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
          })
        : 'recently';

      systemPrompt = buildSupportPrompt(plan, leadCount, memberSince);
    } catch (ctxErr) {
      // Context fetch failed — fall back to generic prompt rather than failing the request
      console.error('[groq-chat] Failed to fetch user context for support prompt:', ctxErr);
      systemPrompt = SUPPORT_PROMPT_FALLBACK;
    }
  } else {
    systemPrompt = DRAFT_REPLY_PROMPT;
  }

  // ── Call Groq API ────────────────────────────────────────────────────────
  // Note: secret was added as 'GROK_API_KEY' (one O) — read both names for resilience
  const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? Deno.env.get('GROK_API_KEY');
  if (!groqApiKey) {
    console.error('[groq-chat] GROQ_API_KEY secret is not set');
    return jsonResponse({ error: 'Something went wrong, please try again.' }, 500);
  }

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  let reply: string;
  try {
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!groqResponse.ok) {
      const rawError = await groqResponse.text();
      console.error(
        `[groq-chat] Groq API error — status ${groqResponse.status}:`,
        rawError,
      );
      return jsonResponse({ error: 'Something went wrong, please try again.' }, 502);
    }

    const groqData = await groqResponse.json();
    reply = groqData?.choices?.[0]?.message?.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      console.error('[groq-chat] Unexpected Groq response shape:', JSON.stringify(groqData));
      return jsonResponse({ error: 'Something went wrong, please try again.' }, 502);
    }
  } catch (err) {
    console.error('[groq-chat] Fetch to Groq failed:', err);
    return jsonResponse({ error: 'Something went wrong, please try again.' }, 502);
  }

  // ── Log usage (non-blocking — fire and forget) ───────────────────────────
  supabaseAdmin
    .from('ai_usage_log')
    .insert({ user_id: userId, mode: mode as Mode })
    .then(({ error }) => {
      if (error) console.error('[groq-chat] Failed to log usage:', error);
    });

  return jsonResponse({ reply });
});
