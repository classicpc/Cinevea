CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'release-expired-seat-holds';

SELECT cron.schedule(
  'release-expired-seat-holds',
  '* * * * *',
  $$SELECT release_expired_holds();$$
);
