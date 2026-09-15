import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_REQUEST_BYTES = 5_000_000;
const MAX_ROWS = 10_000;

type ImportedMetric = {
  date: string;
  platform: string;
  campaign_name: string;
  investment: number;
  leads: number;
  revenue: number;
  impressions: number;
  clicks: number;
  reach: number;
  views: number;
};

function isImportedMetric(value: unknown): value is ImportedMetric {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.platform === "string" && row.platform.length <= 100 &&
    typeof row.campaign_name === "string" && row.campaign_name.length <= 500 &&
    ["investment", "leads", "revenue", "impressions", "clicks", "reach", "views"].every(
      (key) => typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] >= 0,
    )
  );
}

export const Route = createFileRoute("/api/sync-canonical-metrics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
          return Response.json({ error: "Request too large" }, { status: 413 });
        }

        const sourceUrl = process.env.SUPABASE_URL;
        const sourceKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const canonicalUrl = process.env.CANONICAL_SUPABASE_URL;
        const canonicalServiceKey = process.env.CANONICAL_SUPABASE_SERVICE_ROLE_KEY;
        if (!sourceUrl || !sourceKey || !canonicalUrl || !canonicalServiceKey) {
          return Response.json({ error: "Canonical metrics sync is not configured" }, { status: 503 });
        }

        const token = authHeader.slice(7);
        const source = createClient(sourceUrl, sourceKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData } = await source.auth.getUser();
        if (!userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: roles } = await source.from("user_roles").select("role").eq("user_id", userData.user.id);
        if (!roles?.some((entry) => entry.role === "master_admin")) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        let body: unknown;
        try {
          const text = await request.text();
          if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
            return Response.json({ error: "Request too large" }, { status: 413 });
          }
          body = JSON.parse(text);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const payload = body as { clientName?: unknown; records?: unknown };
        if (typeof payload.clientName !== "string" || !Array.isArray(payload.records) || payload.records.length > MAX_ROWS || !payload.records.every(isImportedMetric)) {
          return Response.json({ error: "Invalid metrics payload" }, { status: 400 });
        }

        const canonical = createClient(canonicalUrl, canonicalServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: client, error: clientError } = await canonical
          .from("clients")
          .select("id")
          .eq("name", payload.clientName)
          .maybeSingle();
        if (clientError || !client) return Response.json({ error: "Canonical client not found" }, { status: 422 });

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
          raw_data: { campaign_name: row.campaign_name, reach: Math.round(row.reach), views: Math.round(row.views) },
        }));
        const { error: syncError } = await canonical
          .from("traffic_metrics")
          .upsert(metrics, { onConflict: "client_id,platform,period_start,period_end,source,source_record_id" });
        if (syncError) return Response.json({ error: "Canonical sync failed" }, { status: 502 });

        return Response.json({ synced: metrics.length }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
