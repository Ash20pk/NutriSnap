// Supabase Edge Function: foods-sync-cron
// Calls backend admin sync endpoint on a schedule.

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

  const url = backendBaseUrl.replace(/\/$/, "") + "/api/admin/foods/sync";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": adminSyncKey,
      },
      body: JSON.stringify({}),
    });

    const text = await res.text();
    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        body: text,
      }),
      {
        status: res.ok ? 200 : 500,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "fetch_failed", message: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
