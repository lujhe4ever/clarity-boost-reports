import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { buildSummaryPrompt, type AISummaryInput } from "@/services/aiSummaryPrompt";

const MAX_REQUEST_BYTES = 32_000;
const MAX_RESPONSE_BYTES = 64_000;

function isSummaryInput(value: unknown): value is AISummaryInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<AISummaryInput>;

  return (
    typeof input.clientName === "string" &&
    input.clientName.length <= 200 &&
    typeof input.periodLabel === "string" &&
    input.periodLabel.length <= 200 &&
    Array.isArray(input.insights) &&
    input.insights.length <= 20 &&
    input.insights.every((item) => typeof item === "string" && item.length <= 500) &&
    !!input.current &&
    typeof input.current === "object" &&
    !!input.previous &&
    typeof input.previous === "object"
  );
}

function extractSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  for (const key of ["summary", "text", "output_text"]) {
    if (typeof value[key] === "string") return value[key].slice(0, 4_000);
  }
  return "";
}

export const Route = createFileRoute("/api/ai-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_REQUEST_BYTES) {
          return Response.json({ error: "Request too large" }, { status: 413 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !publishableKey) {
          return Response.json({ error: "Service unavailable" }, { status: 503 });
        }

        const token = authHeader.slice(7);
        const authClient = createClient(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData } = await authClient.auth.getUser();
        if (!userData.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          const bodyText = await request.text();
          if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
            return Response.json({ error: "Request too large" }, { status: 413 });
          }
          body = JSON.parse(bodyText);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const input = (body as { data?: unknown } | null)?.data;
        if (!isSummaryInput(input)) {
          return Response.json({ error: "Invalid summary input" }, { status: 400 });
        }

        const endpointValue = process.env.AI_SUMMARY_ENDPOINT;
        const apiKey = process.env.AI_SUMMARY_API_KEY;
        if (!endpointValue || !apiKey) {
          return Response.json({ error: "AI summary is not configured" }, { status: 503 });
        }

        let endpoint: URL;
        try {
          endpoint = new URL(endpointValue);
        } catch {
          return Response.json({ error: "AI summary is not configured" }, { status: 503 });
        }
        if (endpoint.protocol !== "https:") {
          return Response.json({ error: "AI summary is not configured" }, { status: 503 });
        }

        try {
          const providerResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ prompt: buildSummaryPrompt(input), data: input }),
            signal: AbortSignal.timeout(15_000),
          });

          if (!providerResponse.ok) {
            return Response.json({ error: "AI provider unavailable" }, { status: 502 });
          }

          const responseText = await providerResponse.text();
          if (responseText.length > MAX_RESPONSE_BYTES) {
            return Response.json({ error: "AI provider response too large" }, { status: 502 });
          }

          const summary = extractSummary(JSON.parse(responseText)).trim();
          if (!summary) {
            return Response.json({ error: "AI provider returned no summary" }, { status: 502 });
          }

          return Response.json({ summary }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return Response.json({ error: "AI provider unavailable" }, { status: 502 });
        }
      },
    },
  },
});
