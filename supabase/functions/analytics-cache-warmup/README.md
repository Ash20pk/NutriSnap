# Analytics Cache Warmup Edge Function

Pre-warms analytics cache for active users to ensure instant load times.

## Purpose

This edge function runs on a schedule (every 6 hours) to:
1. Identify users who logged meals in the last 24 hours
2. Pre-generate their analytics for the week view
3. Cache results so analytics load instantly when users open the app

## Benefits

- **Instant UX**: Analytics ready before users open the app
- **Cost Efficient**: Spreads API load over time, avoids peak-hour spikes
- **Smart**: Only processes active users (30% of total users typically)

## Configuration

### Environment Variables

Required in Supabase Edge Function settings:

```bash
BACKEND_BASE_URL=https://your-backend.ngrok-free.app
ADMIN_SYNC_KEY=your-admin-sync-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Cron Schedule

**Option 1: SQL Migration (Recommended)**
```bash
psql $DATABASE_URL -f supabase/migrations/20260111_analytics_cron.sql
```

**Option 2: Supabase Dashboard**
1. Go to Dashboard → Integrations → Cron Jobs
2. Create job: `analytics-cache-warmup`
3. Schedule: `0 */6 * * *`
4. Type: HTTP Request
5. URL: `https://your-project.supabase.co/functions/v1/analytics-cache-warmup`
6. Method: POST

**Schedule Options:**
```
0 */6 * * *   # Every 6 hours (recommended)
0 */12 * * *  # Every 12 hours (lower cost)
*/30 * * * *  # Every 30 minutes (testing only)
```

## Deployment

### 1. Deploy the function

```bash
cd supabase
supabase functions deploy analytics-cache-warmup
```

### 2. Set environment variables

```bash
supabase secrets set BACKEND_BASE_URL=https://your-backend.ngrok-free.app
supabase secrets set ADMIN_SYNC_KEY=your-admin-sync-key
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set up cron trigger

In Supabase Dashboard:
1. Go to Edge Functions
2. Select `analytics-cache-warmup`
3. Add Cron Job: `0 */6 * * *`

### 4. Test manually

```bash
curl -X POST https://your-project.supabase.co/functions/v1/analytics-cache-warmup \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## How It Works

```
1. Query meals table for activity in last 24h
   ↓
2. Extract unique user IDs (e.g., 300 active users)
   ↓
3. Process in batches of 10 users
   ↓
4. For each user:
   - Call POST /api/analytics/{user_id}/refresh
   - Generate AI insights
   - Cache for 6 hours
   ↓
5. Wait 2 seconds between batches (rate limiting)
   ↓
6. Return summary: {success: 295, failed: 5}
```

## Performance

**For 1000 active users:**
- Processing time: ~20 minutes (10 users/batch, 2s delay)
- API calls: 1000 (spread over 20 minutes)
- Cost: ~$0.30 per run
- Runs: 4 times per day
- Daily cost: ~$1.20

**Cache hit rate improvement:**
- Before: 20% (most users get stale data)
- After: 95% (analytics pre-warmed for active users)

## Monitoring

Check logs in Supabase Dashboard → Edge Functions → Logs:

```
✓ Warmed cache for user abc123: 21 meals, 450 tokens
✓ Warmed cache for user def456: 18 meals, 420 tokens
✗ Failed for user ghi789: HTTP 429: Rate limit exceeded
```

## Error Handling

- **Rate limiting**: 2 second delay between batches
- **Individual failures**: Logged but don't stop batch processing
- **No active users**: Returns success with 0 processed
- **Backend down**: Retries on next cron run

## Cost Optimization

**Why this is cost-effective:**

1. **Selective processing**: Only active users (30% of total)
2. **Batch processing**: Spreads load, avoids rate limits
3. **Cache reuse**: 6-hour TTL means 4 refreshes/day max
4. **Background timing**: Runs during off-peak hours

**Alternative (worse) approach:**
- On-demand generation when user opens app
- Peak-hour API load
- Slower UX (2-3 second wait)
- Same total cost but worse experience

## Troubleshooting

### Function times out
- Reduce `BATCH_SIZE` from 10 to 5
- Increase `DELAY_BETWEEN_BATCHES_MS` to 3000

### Too many rate limit errors
- Increase delay between batches
- Reduce batch size
- Check backend rate limits

### High costs
- Reduce cron frequency (every 12 hours instead of 6)
- Increase cache TTL to 12 hours
- Filter to only highly active users (meals in last 12h)

## Future Improvements

1. **Smart scheduling**: Run more frequently during peak hours
2. **Priority users**: Premium users get more frequent updates
3. **Incremental updates**: Only analyze new meals since last cache
4. **Multi-timerange**: Pre-warm week, month, and year views
