-- Re-create all cron jobs with Vault secret

SELECT cron.unschedule('trial-lifecycle-emails-daily');
SELECT cron.unschedule('renew-google-calendar-watches');
SELECT cron.unschedule('cleanup-draft-invoices-daily');
SELECT cron.unschedule('send-reminder-notifications-15m');

SELECT cron.schedule(
  'trial-lifecycle-emails-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1/trial-lifecycle-emails',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'renew-google-calendar-watches',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1/renew-calendar-watches',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'cleanup-draft-invoices-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1/cleanup-draft-invoices',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'send-reminder-notifications-15m',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://efxgwqfdstrhrnnvtynl.supabase.co/functions/v1/send-reminder-notifications',
    headers := jsonb_build_object(
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
