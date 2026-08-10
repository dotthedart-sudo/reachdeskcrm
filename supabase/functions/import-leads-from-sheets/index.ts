import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_LIMITS = {
  trial:   { leads: 50 },
  starter: { leads: 750 },
  pro:     { leads: 5000 },
  teams:   { leads: null as number | null },
};

const STARTER_YEARLY_LEADS = 2000;

function getPlanLeadLimit(plan: string, billingCycle: string | null): number {
  const base = (PLAN_LIMITS[plan] || PLAN_LIMITS.trial).leads;
  if (base === null) return Infinity;
  if ((billingCycle ?? '').toLowerCase() !== 'yearly') return base;
  if (plan === 'starter') return STARTER_YEARLY_LEADS;
  if (plan === 'pro') return base * 2;
  return base;
}

function splitFullName(fullName: string): { first_name: string; last_name: string } {
  if (!fullName) return { first_name: "", last_name: "" };
  
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: "" };
  }
  
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ");
  
  return { first_name, last_name };
}

function normalizePriority(value: string, defaultPriority: string): string {
  if (!value) return defaultPriority;
  
  const lower = value.toLowerCase().trim();
  
  if (lower === "hot" || lower === "🔥" || lower === "🔥 hot") return "Hot";
  if (lower === "warm" || lower === "⚡" || lower === "⚡ warm") return "Warm";
  if (lower === "cold" || lower === "🧊" || lower === "🧊 cold") return "Cold";
  
  return defaultPriority;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      spreadsheetId,
      sheetName,
      mapping,
      duplicateStrategy,
      folderId,
      defaultPriority,
      filename
    } = await req.json();

    if (!spreadsheetId || !sheetName || !mapping) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Get admin client for sheets integrations & database queries
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Plan check: Sheets import requires trial/Pro/Enterprise ─────────────
    const { data: importUserProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('plan, role, email')
      .eq('id', userId)
      .maybeSingle();

    const importAllowedPlans = ['trial', 'starter', 'pro', 'teams'];
    const importAccessAllowed =
      importUserProfile?.role === 'admin' ||
      importAllowedPlans.includes(importUserProfile?.plan ?? '');

    if (!importAccessAllowed) {
      return new Response(
        JSON.stringify({ error: 'Google Sheets import requires a Pro plan or higher' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: integration, error: fetchErr } = await supabaseAdmin
      .from('sheets_integrations')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchErr || !integration) {
      return new Response(
        JSON.stringify({ error: 'Google Sheets not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken = integration.access_token;
    const isExpired = new Date(integration.token_expires_at) <= new Date(Date.now() + 60_000);

    if (isExpired) {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_SHEETS_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_SHEETS_CLIENT_SECRET')!,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!resp.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to refresh access token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const refreshed = await resp.json();
      accessToken = refreshed.access_token;

      await supabaseAdmin
        .from('sheets_integrations')
        .update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('user_id', userId);
    }

    // ── Step 1: Fetch all sheet values ───────────────────────────────────────
    const range = encodeURIComponent(`'${sheetName}'!A:Z`);
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;

    const sheetsResp = await fetch(sheetsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sheetsResp.ok) {
      const errText = await sheetsResp.text();
      console.error('[import-leads-from-sheets] Google Sheets API error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch values from Google Sheets API' }),
        { status: sheetsResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sheetsData = await sheetsResp.json();
    const values = sheetsData.values || [];

    if (values.length < 2) {
      return new Response(
        JSON.stringify({ error: 'No data rows found in sheet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = values[0] as string[];
    const rows = values.slice(1) as any[][];
    const totalRows = rows.length;

    // ── Step 2: Enforce leads limit (team members inherit workspace owner plan) ─
    let currentCount = 0;
    let leadLimit = Infinity;
    let plan = 'trial';
    let billingCycle: string | null = null;
    let limitReached = false;
    let teamIds = [userId];
    try {
      const { data: planCtx } = await supabaseAdmin.rpc('get_user_plan_context', { p_user_id: userId });
      plan = (planCtx?.plan || 'trial').toLowerCase();
      billingCycle = planCtx?.billing_cycle ?? null;

      teamIds = [userId];
      const { data: pProfile } = await supabaseAdmin.from('user_profiles')
        .select('team_id, plan').eq('id', userId).maybeSingle();
      
      if (pProfile?.team_id) {
        const { data: members } = await supabaseAdmin.from('user_profiles')
          .select('id').eq('team_id', pProfile.team_id);
        if (members && members.length > 0) {
          teamIds = members.map(m => m.id);
        }
      }
      
      leadLimit = getPlanLeadLimit(plan, billingCycle);

      const { count } = await supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('user_id', teamIds);
      currentCount = count || 0;
    } catch (err) {
      console.error('Error checking lead limits:', err);
    }

    // ── Step 3: Pre-fetch existing leads for deduplication (paged — max-rows safe) ─
    const existingEmails = new Map<string, string>();
    try {
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data: leadsData, error: leadsPrefetchErr } = await supabaseAdmin
          .from('leads')
          .select('id, email')
          .in('user_id', teamIds)
          .range(from, from + pageSize - 1);
        if (leadsPrefetchErr) throw leadsPrefetchErr;
        const batch = leadsData || [];
        batch.forEach((lead: { id: string; email: string | null }) => {
          if (lead.email) {
            existingEmails.set(lead.email.toLowerCase().trim(), lead.id);
          }
        });
        if (batch.length < pageSize) break;
        from += pageSize;
      }
    } catch (err) {
      console.error('Error pre-fetching leads:', err);
    }

    // ── Step 4: Map and validate rows ────────────────────────────────────────
    let importedCount = 0;
    let skippedCount = 0;
    let addedToListCount = 0;
    let skippedDuplicates = 0;
    let skippedLimit = 0;
    let errorCount = 0;

    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const insertData: any[] = [];
      const updateData: any[] = [];
      const folderOnlyUpdates: { id: string }[] = [];
      const batchInsertEmails = new Set<string>();

      for (const row of batch) {
        const leadObj: any = {
          user_id: userId,
          folder_id: folderId || null,
          custom_fields: {},
          status: 'Lead',
          priority: defaultPriority,
          first_name: null,
          last_name: null,
          email: null
        };

        headers.forEach((_, colIdx) => {
          const fieldKey = mapping[colIdx];
          const rawValue = (row[colIdx] ?? '').toString().trim();

          if (!fieldKey || fieldKey === 'skip') return;

          if (fieldKey === 'custom') {
            leadObj.custom_fields[headers[colIdx]] = rawValue !== '' ? rawValue : null;
          } else if (fieldKey === 'full_name') {
            const { first_name, last_name } = splitFullName(rawValue);
            leadObj.first_name = first_name !== '' ? first_name : leadObj.first_name;
            leadObj.last_name = last_name !== '' ? last_name : leadObj.last_name;
          } else if (fieldKey === 'priority') {
            leadObj.priority = normalizePriority(rawValue, defaultPriority);
          } else {
            leadObj[fieldKey] = rawValue !== '' ? rawValue : null;
          }
        });

        if (!leadObj.first_name) leadObj.first_name = null;
        if (!leadObj.email) leadObj.email = null;

        if (!leadObj.first_name && !leadObj.email && !leadObj.phone) {
          errorCount++;
          continue;
        }

        const emailLower = leadObj.email ? leadObj.email.toLowerCase().trim() : '';
        const existingLeadId = emailLower ? existingEmails.get(emailLower) : null;
        const isInBatchDuplicate = emailLower ? batchInsertEmails.has(emailLower) : false;

        if (existingLeadId || isInBatchDuplicate) {
          if (duplicateStrategy === 'skip') {
            if (folderId && existingLeadId && !isInBatchDuplicate) {
              folderOnlyUpdates.push({ id: existingLeadId });
              addedToListCount++;
            } else {
              skippedCount++;
              skippedDuplicates++;
            }
          } else if (duplicateStrategy === 'overwrite' && existingLeadId && !isInBatchDuplicate) {
            leadObj.id = existingLeadId;
            updateData.push(leadObj);
          } else {
            skippedCount++;
            skippedDuplicates++;
          }
        } else {
          if (leadLimit !== Infinity && currentCount >= leadLimit) {
            limitReached = true;
            skippedCount++;
            skippedLimit++;
          } else {
            insertData.push(leadObj);
            if (emailLower) {
              batchInsertEmails.add(emailLower);
            }
            if (leadLimit !== Infinity) {
              currentCount++;
            }
          }
        }
      }

      // Execute batch operations
      try {
        if (insertData.length > 0) {
          const { data: inserted, error } = await supabaseAdmin.from('leads').insert(insertData).select('id, email');
          if (error) {
            console.error('Batch insert error:', error.message);
            errorCount += insertData.length;
            insertData.forEach((l) => {
              if (l.email) existingEmails.delete(l.email.toLowerCase().trim());
            });
          } else {
            importedCount += insertData.length;
            (inserted || []).forEach((l: { id: string; email: string | null }) => {
              if (l.email) existingEmails.set(l.email.toLowerCase().trim(), l.id);
            });
          }
        }

        if (folderOnlyUpdates.length > 0 && folderId) {
          const ids = [...new Set(folderOnlyUpdates.map((u) => u.id))];
          const { error } = await supabaseAdmin
            .from('leads')
            .update({ folder_id: folderId })
            .in('id', ids);
          if (error) {
            console.error('Folder assign error:', error.message);
            errorCount += ids.length;
            addedToListCount -= ids.length;
            skippedCount += ids.length;
            skippedDuplicates += ids.length;
          }
        }

        if (updateData.length > 0) {
          for (const upd of updateData) {
            const { error } = await supabaseAdmin.from('leads').update(upd).eq('id', upd.id);
            if (error) {
              console.error('Lead update error:', error.message);
              errorCount++;
            } else {
              importedCount++;
            }
          }
        }
      } catch (err) {
        console.error('Batch DB operations error:', err);
        errorCount += batch.length;
      }
    }

    // Log import history
    try {
      await supabaseAdmin.from('csv_imports').insert({
        user_id: userId,
        filename: filename || `Google Sheet: ${sheetName}`,
        total_rows: totalRows,
        imported: importedCount,
        skipped: skippedCount,
        errors: errorCount,
        field_mapping: mapping,
        duplicate_strategy: duplicateStrategy,
        status: 'completed'
      });
    } catch (err) {
      console.error('Failed to log import history:', err);
    }

    return new Response(
      JSON.stringify({
        imported: importedCount,
        skipped: skippedCount,
        addedToList: addedToListCount,
        skippedDuplicates,
        skippedLimit,
        errors: errorCount,
        totalRows,
        limitReached,
        planLimit: leadLimit,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[import-leads-from-sheets] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
