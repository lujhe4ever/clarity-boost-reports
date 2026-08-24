import type { InsightMetrics } from "@/utils/insightsEngine";
import { supabase } from "@/integrations/supabase/client";
import type { AISummaryInput } from "@/services/aiSummaryPrompt";

export type { AISummaryInput } from "@/services/aiSummaryPrompt";

function hasMeaningfulBaseline(metrics: InsightMetrics) {
  return [
    metrics.cpl,
    metrics.investment,
    metrics.leads,
    metrics.clicks ?? 0,
    metrics.views ?? 0,
    metrics.impressions ?? 0,
    metrics.reach ?? 0,
    metrics.revenue ?? 0,
  ].some((value) => Math.abs(Number(value) || 0) > 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function generateFallbackSummary(data: AISummaryInput) {
  const hasPreviousPeriod = data.hasPreviousPeriod ?? hasMeaningfulBaseline(data.previous);

  if (!hasPreviousPeriod) {
    if (data.current.leads > 0) {
      return `No ${data.periodLabel.toLowerCase()}, voce gerou ${data.current.leads} leads com CPL medio de ${formatCurrency(data.current.cpl)}. ${data.insights[0] ?? ""}`.trim();
    }

    return `No ${data.periodLabel.toLowerCase()}, ainda nao ha um periodo anterior comparavel para leitura de tendencia.`;
  }

  const cplLine =
    data.current.cpl > 0
      ? `O custo medio por lead esta em ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
        }).format(data.current.cpl)}.`
      : "Ainda nao ha leads suficientes para calcular o custo por lead.";

  const performanceLine =
    data.current.leads > data.previous.leads
      ? "O periodo atual mostrou ganho de volume na captacao."
      : data.current.leads < data.previous.leads
        ? "O periodo atual trouxe menos captacao do que o periodo anterior."
        : "A captacao se manteve estavel em relacao ao periodo anterior.";

  const firstInsight = data.insights[0] ?? "Os principais indicadores estao consistentes.";

  return `${firstInsight} ${performanceLine} ${cplLine}`.trim();
}

type AISummaryResponse =
  | {
      summary?: string;
      text?: string;
      output_text?: string;
      choices?: Array<{
        text?: string;
        message?: { content?: string };
      }>;
      output?: Array<{
        content?: Array<{ text?: string }>;
      }>;
    }
  | null
  | undefined;

function extractSummaryFromResponse(payload: AISummaryResponse): string {
  if (typeof payload?.summary === "string") return payload.summary;
  if (typeof payload?.text === "string") return payload.text;
  if (typeof payload?.output_text === "string") return payload.output_text;

  const firstChoiceMessage = payload?.choices?.[0]?.message?.content;
  if (typeof firstChoiceMessage === "string") return firstChoiceMessage;

  const firstChoiceText = payload?.choices?.[0]?.text;
  if (typeof firstChoiceText === "string") return firstChoiceText;

  const responseText = payload?.output?.[0]?.content?.find(
    (item) => typeof item?.text === "string",
  )?.text;
  if (typeof responseText === "string") return responseText;

  return "";
}

export async function generateAISummary(data: AISummaryInput) {
  if (import.meta.env.VITE_AI_SUMMARY_ENABLED !== "true") {
    return generateFallbackSummary(data);
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return generateFallbackSummary(data);

    const response = await fetch("/api/ai-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      throw new Error(`AI summary request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const summary = extractSummaryFromResponse(payload);

    return summary.trim() || generateFallbackSummary(data);
  } catch {
    return generateFallbackSummary(data);
  }
}
