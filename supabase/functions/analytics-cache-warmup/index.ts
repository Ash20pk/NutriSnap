// Supabase Edge Function: analytics-cache-warmup
// Pre-warms analytics cache for active users to ensure instant load times
// Triggered by cron job via HTTP request

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const backendBaseUrl = Deno.env.get("BACKEND_BASE_URL") ?? "";
  const adminSyncKey = Deno.env.get("ADMIN_SYNC_KEY") ?? "";

  if (!backendBaseUrl) {
    return new Response(JSON.stringify({ error: "missing_BACKEND_BASE_URL" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!adminSyncKey) {
    return new Response(JSON.stringify({ error: "missing_ADMIN_SYNC_KEY" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // Get active users from backend (simpler, follows foods-sync-cron pattern)
    const activeUsersUrl = backendBaseUrl.replace(/\/$/, "") + "/api/admin/active-users";
    
    const activeUsersRes = await fetch(activeUsersUrl, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-admin-key": adminSyncKey,
      },
    });

    if (!activeUsersRes.ok) {
      const errorText = await activeUsersRes.text();
      throw new Error(`Failed to get active users: ${activeUsersRes.status} - ${errorText}`);
    }

    const { active_users } = await activeUsersRes.json();

    if (!active_users || active_users.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No active users found",
        processed: 0
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(active_users)];
    
    console.log(`Found ${uniqueUserIds.length} active users to warm cache for`);

    // Process users in batches to avoid overwhelming the backend
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 seconds between batches
    const results = {
      total: uniqueUserIds.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < uniqueUserIds.length; i += BATCH_SIZE) {
      const batch = uniqueUserIds.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (userId) => {
        try {
          // Refresh analytics for week view (most commonly used)
          const url = `${backendBaseUrl.replace(/\/$/, "")}/api/analytics/${userId}/refresh?time_range=week`;
          
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-admin-key": adminSyncKey,
            },
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errorText}`);
          }

          const data = await res.json();
          console.log(`✓ Warmed cache for user ${userId}: ${data.meals_analyzed} meals, ${data.tokens_used} tokens`);
          
          return { success: true, userId };
        } catch (error) {
          const errorMsg = `Failed for user ${userId}: ${(error as Error).message}`;
          console.error(`✗ ${errorMsg}`);
          return { success: false, userId, error: errorMsg };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Count successes and failures
      batchResults.forEach(result => {
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(result.error || 'Unknown error');
        }
      });

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < uniqueUserIds.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    console.log(`Cache warmup complete: ${results.success} success, ${results.failed} failed`);

    return new Response(JSON.stringify({
      message: "Cache warmup completed",
      results,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (error) {
    console.error("Cache warmup failed:", error);
    return new Response(
      JSON.stringify({ 
        error: "warmup_failed", 
        message: String(error),
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500, 
        headers: { "content-type": "application/json" } 
      },
    );
  }
});
