// Retired. Garmin sync runs locally (scripts/garmin-sync.mjs) because Garmin
// blocks datacenter IPs, and the app reads garmin_health_data directly via RLS.
// The old public /login endpoint accepted arbitrary credentials, so this stub
// replaces the whole function.
Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "Gone. Sync runs locally; the app reads garmin_health_data directly." }),
    { status: 410, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
  )
);
