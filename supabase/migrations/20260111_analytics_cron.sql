-- Create cron job for analytics cache warmup
-- Runs every 6 hours to pre-warm cache for active users

SELECT cron.schedule(
  'analytics-cache-warmup',
  '0 */6 * * *',  -- Every 6 hours at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://orhzmnxfkrtzmoizyhyr.supabase.co/functions/v1/analytics-cache-warmup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, active, nodename 
FROM cron.job 
WHERE jobname = 'analytics-cache-warmup';
