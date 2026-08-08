/**
 * Safe Supabase production deploy for ReachDesk.
 *
 * Requires SUPABASE_ACCESS_TOKEN (from `supabase login` or Dashboard → Account → Access Tokens).
 * Optionally reads token from .env.local: SUPABASE_ACCESS_TOKEN=sbp_...
 *
 * Usage:
 *   node scratch/deploy_supabase.cjs              # dry-run: list pending, no changes
 *   node scratch/deploy_supabase.cjs --apply      # db push + secrets + deploy functions
 *   node scratch/deploy_supabase.cjs --apply --skip-secrets
 *   node scratch/deploy_supabase.cjs --apply --skip-functions
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROJECT_REF = 'efxgwqfdstrhrnnvtynl';

const PRIORITY_FUNCTIONS = [
  'send-team-invite',
  'google-calendar-api',
  'calendar-webhook-receiver',
  'notify-admin-signup',
  'respond-upgrade-request',
  'upgrade-subscription',
  'purchase-extra-seat',
  'admin-sync-paddle-subscriptions',
  'paddle-webhook',
  'sync-paddle-subscription',
  'cancel-subscription',
  'resume-subscription',
  'google-sheets-oauth-exchange',
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const skipSecrets = args.includes('--skip-secrets');
const skipFunctions = args.includes('--skip-functions');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      env[key] = value;
    });
  return env;
}

function run(cmd, { allowFail = false } = {}) {
  console.log(`\n> ${cmd}\n`);
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    if (out.trim()) console.log(out.trim());
    return out;
  } catch (err) {
    const msg = [err.stdout, err.stderr].filter(Boolean).join('\n');
    if (msg.trim()) console.error(msg.trim());
    if (!allowFail) throw err;
    return msg;
  }
}

function maskSecrets(text) {
  return text
    .replace(/re_[a-zA-Z0-9_-]+/g, 're_******')
    .replace(/GOCSPX-[a-zA-Z0-9_-]+/g, 'GOCSPX-******')
    .replace(/sbp_[a-zA-Z0-9_-]+/g, 'sbp_******');
}

function main() {
  const env = {
    ...loadEnvFile(path.join(ROOT, '.env')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
  };

  if (!process.env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_ACCESS_TOKEN) {
    process.env.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
  }

  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error(
      'Missing SUPABASE_ACCESS_TOKEN.\n\n' +
        'Run once in a normal terminal:\n' +
        '  supabase login\n\n' +
        'Or create .env.local with:\n' +
        '  SUPABASE_ACCESS_TOKEN=sbp_...\n',
    );
    process.exit(1);
  }

  console.log('ReachDesk Supabase deploy');
  console.log(`Project: ${PROJECT_REF}`);
  console.log(`Mode: ${apply ? 'APPLY (will change production)' : 'DRY-RUN (read only)'}`);

  console.log('\n--- Step 1: Migration status ---');
  run('supabase migration list --linked');

  if (!apply) {
    console.log('\nDry-run complete. No changes made.');
    console.log('To apply pending migrations, sync secrets, and deploy functions:');
    console.log('  node scratch/deploy_supabase.cjs --apply');
    return;
  }

  console.log('\n--- Step 2: Apply pending migrations only (db push) ---');
  run('supabase db push --linked --yes');

  if (!skipSecrets) {
    console.log('\n--- Step 3: Sync edge function secrets from .env ---');
    const secretPairs = [];
    const add = (key, value) => {
      if (value) secretPairs.push(`${key}="${value.replace(/"/g, '\\"')}"`);
    };

    add('RESEND_API_KEY', env.RESEND_API_KEY);
    add('APP_URL', env.APP_URL || 'https://app.reachdeskcrm.com');
    add('GOOGLE_CLIENT_ID', env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID);
    add('GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET);
    add('GOOGLE_SHEETS_CLIENT_ID', env.VITE_GOOGLE_SHEETS_CLIENT_ID || env.GOOGLE_SHEETS_CLIENT_ID);
    add('GOOGLE_SHEETS_CLIENT_SECRET', env.GOOGLE_SHEETS_CLIENT_SECRET);
    add('GROQ_API_KEY', env.GROQ_API_KEY || env.GROK_API_KEY);
    add('PADDLE_API_KEY', env.PADDLE_API_KEY);
    add('PADDLE_WEBHOOK_SECRET', env.PADDLE_WEBHOOK_SECRET);
    add('VAPID_EMAIL', env.VAPID_EMAIL);
    add('VAPID_PUBLIC_KEY', env.VAPID_PUBLIC_KEY || env.VITE_VAPID_PUBLIC_KEY);
    add('VAPID_PRIVATE_KEY', env.VAPID_PRIVATE_KEY);
    add('CRON_SECRET', env.CRON_SECRET);
    add('ADMIN_NOTIFY_EMAIL', env.ADMIN_NOTIFY_EMAIL);

    if (secretPairs.length === 0) {
      console.log('No secrets found in .env — skipping.');
    } else {
      run(`supabase secrets set ${secretPairs.join(' ')}`);
      console.log('Secrets synced (values masked):');
      console.log(maskSecrets(secretPairs.map((p) => p.split('=')[0]).join(', ')));
    }
  }

  if (!skipFunctions) {
    console.log('\n--- Step 4: Deploy priority edge functions ---');
    run(`supabase functions deploy ${PRIORITY_FUNCTIONS.join(' ')}`);
  }

  console.log('\n--- Step 5: Verify ---');
  run('supabase migration list --linked');

  console.log('\nDone. If cron jobs are not scheduled yet, run scratch/setup_cron.sql in Supabase SQL Editor.');
  console.log('Then hard-refresh the app (Ctrl+Shift+R) and retry team invite.');
}

main();
