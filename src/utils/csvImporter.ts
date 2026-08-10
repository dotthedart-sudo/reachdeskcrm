import { supabase } from '../lib/supabase';
import { splitFullName, normalizePriority } from './csvMapping';
import { getTeamIds } from '../lib/utils';
import { getPlanLeadLimit, normalizePlan } from '../lib/planConfig';
import { fetchAllLeadsForScope } from '../lib/leadsQuery';

interface ImportBatchOptions {
  data: any[][];
  headers: string[];
  mapping: Record<number, string>;
  duplicateStrategy: 'skip' | 'overwrite';
  folderId: string | null;
  defaultPriority: string;
  userId: string;
  filename: string;
  onProgress: (imported: number, skipped: number, errors: number, progress: number) => void;
  onComplete: (imported: number, skipped: number, errors: number) => void;
}

export async function processImportBatch({
  data,
  headers,
  mapping,
  duplicateStrategy,
  folderId,
  defaultPriority,
  userId,
  filename,
  onProgress,
  onComplete
}: ImportBatchOptions) {
  let importedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const totalRows = data.length;
  if (totalRows === 0) {
    onComplete(0, 0, 0);
    return;
  }

  // Enforce leads limit
  let currentCount = 0;
  let leadLimit = Infinity;
  let plan = 'trial';
  let limitReached = false;
  try {
    const teamIds = await getTeamIds(userId);
    const { data: planCtx } = await supabase.rpc('get_my_plan_context');
    const effectivePlan = normalizePlan(planCtx?.plan ?? 'trial');
    const effectiveBilling = planCtx?.billing_cycle ?? null;

    const { data: p } = await supabase.from('user_profiles').select('plan').eq('id', userId).maybeSingle();
    plan = effectivePlan || (p?.plan || 'trial').toLowerCase();
    leadLimit = getPlanLeadLimit(normalizePlan(plan), effectiveBilling) ?? Infinity;

    // Get current lead count
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('user_id', teamIds);
    currentCount = count || 0;
  } catch (err) {
    console.error('Error checking lead limits during import:', err);
  }

  // 1. Pre-fetch existing leads to handle duplicates efficiently
  const existingEmails = new Map<string, string>(); // email -> lead_id
  try {
    const leadsData = await fetchAllLeadsForScope({
      userIds: [userId],
      columns: 'id, email',
    });

    if (leadsData) {
      leadsData.forEach(lead => {
        if (lead.email) {
          existingEmails.set(lead.email.toLowerCase().trim(), lead.id);
        }
      });
    }
  } catch (err) {
    console.error('Error fetching existing leads for deduplication:', err);
    // Continue anyway; we'll catch DB constraint errors on insert
  }

  // 2. Process in batches
  const batchSize = 50;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    const insertData: any[] = [];
    const updateData: any[] = [];

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

      // Extract fields according to mapping
      headers.forEach((_, colIdx) => {
        const fieldKey = mapping[colIdx];
        const rawValue = row[colIdx]?.trim() || '';

        if (!fieldKey || fieldKey === 'skip') return;

        if (fieldKey === 'custom') {
          // Fallback to header name if unmapped column selected as custom field
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

      // Cleanup
      if (!leadObj.first_name) leadObj.first_name = null;
      if (!leadObj.email) leadObj.email = null;

      // Validation check
      if (!leadObj.first_name && !leadObj.email) {
        errorCount++;
        continue; // Skip this row
      }

      // Deduplication check
      const emailLower = leadObj.email ? leadObj.email.toLowerCase().trim() : '';
      const existingLeadId = emailLower ? existingEmails.get(emailLower) : null;

      if (existingLeadId) {
        if (duplicateStrategy === 'skip') {
          skippedCount++;
        } else if (duplicateStrategy === 'overwrite') {
          leadObj.id = existingLeadId;
          updateData.push(leadObj);
        }
      } else {
        if (leadLimit !== Infinity && currentCount >= leadLimit) {
          limitReached = true;
          skippedCount++;
        } else {
          insertData.push(leadObj);
          if (leadLimit !== Infinity) {
            currentCount++;
          }
        }
      }
    }

    // 3. Perform DB operations for this batch
    try {
      if (insertData.length > 0) {
        const { error } = await supabase.from('leads').insert(insertData);
        if (error) {
          console.error('Batch insert error:', error.message);
          errorCount += insertData.length;
        } else {
          importedCount += insertData.length;
          // Update our local map so same-batch duplicates don't slip through
          insertData.forEach(l => {
            if (l.email) existingEmails.set(l.email.toLowerCase().trim(), 'new');
          });
        }
      }

      if (updateData.length > 0) {
        for (const upd of updateData) {
          const { error } = await supabase.from('leads').update(upd).eq('id', upd.id);
          if (error) {
            console.error('Lead update error:', error.message);
            errorCount++;
          } else {
            importedCount++;
          }
        }
      }
    } catch (err) {
      console.error('Error executing batch operations:', err);
      errorCount += batch.length;
    }

    // 4. Report progress
    const currentProgress = Math.min(100, Math.round(((i + batch.length) / totalRows) * 100));
    onProgress(importedCount, skippedCount, errorCount, currentProgress);
  }

  // 5. Log import history
  try {
    await supabase.from('csv_imports').insert({
      user_id: userId,
      filename: filename,
      total_rows: totalRows,
      imported: importedCount,
      skipped: skippedCount,
      errors: errorCount,
      field_mapping: mapping,
      duplicate_strategy: duplicateStrategy,
      status: 'completed'
    });
  } catch (err) {
    console.error('Failed to log import to csv_imports:', err);
  }

  if (limitReached) {
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    alert(`You've reached your ${planName} plan limit of ${leadLimit} leads. Only leads up to the limit were imported.`);
  }

  onComplete(importedCount, skippedCount, errorCount);
}
