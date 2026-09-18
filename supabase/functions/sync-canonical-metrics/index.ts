import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_REQUEST_BYTES = 5_000_000;
const MAX_ROWS = 10_000;
const ALLOWED_ORIGIN = "https://seu-gestor-dashboard.lovable.app";

type ImportedMetric = {
  date: string;
  platform: string;
  campaign_name: string;
  objective?: string;
  result_value?: number;
  investment: number;
  leads: number;
  revenue: number;
  impressions: number;
  clicks: number;
  reach: number;
  views: number;
};

function corsHeaders(request: Request) {
  return request.headers.get("origin") === ALLOWED_ORIGIN
    ? {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function response(body: Record<string, unknown>, status: number, request: Request) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}

function isImportedMetric(value: unknown): value is ImportedMetric {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.platform === "string" &&
    row.platform.length <= 100 &&
    typeof row.campaign_name === "string" &&
    row.campaign_name.length <= 500 &&
    (row.objective === undefined ||
      (typeof row.objective === "string" && row.objective.length <= 200)) &&
    (row.result_value === undefined ||
      (typeof row.result_value === "number" && Number.isFinite(row.result_value))) &&
    ["investment", "leads", "revenue", "impressions", "clicks", "reach", "views"].every(
      (key) => typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] >= 0,
    )
  );
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405, request);
  if (request.headers.get("origin") !== ALLOWED_ORIGIN) {
    return response({ error: "Forbidden origin" }, 403, request);
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return response({ error: "Unauthorized" }, 401, request);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return response({ error: "Request too large" }, 413, request);
  }

  const sourceUrl = Deno.env.get("SOURCE_SUPABASE_URL");
  const sourcePublishableKey = Deno.env.get("SOURCE_SUPABASE_PUBLISHABLE_KEY");
  const canonicalUrl = Deno.env.get("SUPABASE_URL");
  const canonicalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sourceUrl || !sourcePublishableKey || !canonicalUrl || !canonicalServiceKey) {
    return response({ error: "Canonical metrics sync is not configured" }, 503, request);
  }

  const token = authHeader.slice(7);
  const source = createClient(sourceUrl, sourcePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await source.auth.getUser(token);
  if (!userData.user) return response({ error: "Unauthorized" }, 401, request);

  const { data: roles, error: rolesError } = await source
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (rolesError || !roles?.some((entry) => entry.role === "master_admin")) {
    return response({ error: "Forbidden" }, 403, request);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      return response({ error: "Request too large" }, 413, request);
    }
    body = JSON.parse(text);
  } catch {
    return response({ error: "Invalid JSON" }, 400, request);
  }

  const payload = body as { clientName?: unknown; records?: unknown };
  if (
    typeof payload.clientName !== "string" ||
    !Array.isArray(payload.records) ||
    payload.records.length > MAX_ROWS ||
    !payload.records.every(isImportedMetric)
  ) {
    return response({ error: "Invalid metrics payload" }, 400, request);
  }

  const canonical = createClient(canonicalUrl, canonicalServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Resolve o cliente sem diferenciar maiusculas/minusculas para nao duplicar registros.
  const { data: clientMatches, error: clientError } = await canonical
    .from("clients")
    .select("id, name")
    .ilike("name", payload.clientName);
  const client = clientMatches?.find(
    (row) =>
      String(row.name).trim().toLowerCase() ===
      (payload.clientName as string).trim().toLowerCase(),
  );
  if (clientError || !client) return response({ error: "Canonical client not found" }, 422, request);

  const metrics = payload.records.map((row) => ({
    client_id: client.id,
    period_start: row.date,
    period_end: row.date,
    platform: row.platform,
    spend: row.investment,
    impressions: Math.round(row.impressions),
    clicks: Math.round(row.clicks),
    leads: Math.round(row.leads),
    revenue: row.revenue,
    source: "metrics_dashboard",
    source_record_id: `${row.date}:${row.platform}:${row.campaign_name}`,
    raw_data: {
      campaign_name: row.campaign_name,
      objective: row.objective ?? null,
      result_value: row.result_value ?? null,
      reach: Math.round(row.reach),
      views: Math.round(row.views),
    },
  }));
  const { error: syncError } = await canonical
    .from("traffic_metrics")
    .upsert(metrics, { onConflict: "client_id,platform,period_start,period_end,source,source_record_id" });
  if (syncError) return response({ error: "Canonical sync failed" }, 502, request);

  const { error: logError } = await canonical.from("activity_log").insert({
    client_id: client.id,
    user_id: userData.user.id,
    action: "metrics_import",
    details: {
      source: "metrics_dashboard",
      rows: metrics.length,
      client_name: payload.clientName,
    },
  });
  if (logError) console.error("activity_log insert failed", logError.message);

  return response({ synced: metrics.length }, 200, request);
});
