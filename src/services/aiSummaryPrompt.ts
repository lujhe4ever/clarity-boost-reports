import type { InsightMetrics } from "@/utils/insightsEngine";

export type AISummaryInput = {
  clientName: string;
  periodLabel: string;
  current: InsightMetrics;
  previous: InsightMetrics;
  insights: string[];
  hasPreviousPeriod?: boolean;
};

export function buildSummaryPrompt(data: AISummaryInput) {
  return [
    "Resuma o desempenho de marketing em ate 3 frases curtas.",
    `Cliente: ${data.clientName}`,
    `Periodo atual: ${data.periodLabel}`,
    `Investimento: ${data.current.investment}`,
    `Leads: ${data.current.leads}`,
    `CPL: ${data.current.cpl}`,
    `Ha periodo anterior comparavel: ${data.hasPreviousPeriod ? "sim" : "nao"}`,
    `Investimento periodo anterior: ${data.previous.investment}`,
    `Leads periodo anterior: ${data.previous.leads}`,
    `CPL periodo anterior: ${data.previous.cpl}`,
    `Insights ja calculados: ${data.insights.join(" | ")}`,
  ].join("\n");
}
