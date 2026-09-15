export const META_ADS_HEADER_SCAN_LIMIT = 100;

export const FIELD_ALIASES = {
  date: ["data", "date", "dia", "day"],
  report_start: ["inicio dos relatorios", "reporting starts", "data inicial do relatorio"],
  report_end: ["encerramento dos relatorios", "reporting ends", "data final do relatorio"],
  campaign_name: ["campanha", "nome da campanha", "campaign name", "campaign"],
  campaign_id: ["id da campanha", "campaign id"],
  adset_name: ["conjunto de anuncios", "nome do conjunto de anuncios", "ad set name", "ad set"],
  ad_name: ["nome do anuncio", "ad name"],
  objective: ["objetivo", "campaign objective", "objetivo da campanha"],
  platform: ["plataforma", "platform", "veiculacao", "placement", "origem"],
  investment: [
    "investimento",
    "valor usado",
    "valor gasto",
    "gasto",
    "custo",
    "amount spent",
    "spend",
    "cost",
  ],
  results: ["resultados", "results"],
  leads: ["leads", "conversoes", "conversions"],
  revenue: [
    "faturamento",
    "receita",
    "valor de conversao",
    "valor de conversao das compras",
    "purchase conversion value",
    "purchases conversion value",
    "revenue",
  ],
  impressions: ["impressoes", "impressions"],
  reach: ["alcance", "reach", "pessoas alcancadas"],
  views: [
    "visualizacoes",
    "visualizacoes de video",
    "thruplays",
    "reproducoes de video de 3 segundos",
    "video views",
    "3 second video views",
    "3-second video views",
  ],
  clicks: ["cliques", "cliques no link", "clicks", "link clicks", "cliques todos", "all clicks"],
} as const;

export function normalizeMetaColumn(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[_\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickMetaField(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  const candidates = new Set(aliases.map(normalizeMetaColumn));
  return Object.entries(row).find(([key]) => candidates.has(normalizeMetaColumn(key)))?.[1];
}

const allAliases = Object.values(FIELD_ALIASES).flat();
const metricAliases = [
  ...FIELD_ALIASES.campaign_name,
  ...FIELD_ALIASES.investment,
  ...FIELD_ALIASES.results,
  ...FIELD_ALIASES.impressions,
  ...FIELD_ALIASES.reach,
  ...FIELD_ALIASES.clicks,
];

function matches(cells: string[], aliases: readonly string[]) {
  const aliasSet = new Set(aliases.map(normalizeMetaColumn));
  return cells.filter((cell) => aliasSet.has(cell)).length;
}

export function findMetaAdsHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, META_ADS_HEADER_SCAN_LIMIT); index += 1) {
    const cells = rows[index]
      .map((cell) => normalizeMetaColumn(String(cell ?? "")))
      .filter(Boolean);
    if (
      matches(cells, FIELD_ALIASES.campaign_name) >= 1 &&
      matches(cells, FIELD_ALIASES.date) >= 1 &&
      matches(cells, metricAliases) >= 2 &&
      matches(cells, allAliases) >= 4
    )
      return index;
  }
  return -1;
}

export function rowsToMetaAdsObjects(rows: unknown[][]): Record<string, unknown>[] {
  const headerIndex = findMetaAdsHeaderRow(rows);
  if (headerIndex < 0)
    throw new Error(
      "Nao foi possivel identificar o cabecalho do relatorio Meta Ads. Verifique se ele contem campanha, dia e metricas.",
    );
  const headers = rows[headerIndex].map(
    (cell, index) => String(cell ?? "").trim() || `coluna_${index + 1}`,
  );
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function parseMetaNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value)
    .trim()
    .replace(/[R$\s\u00A0"']/gi, "")
    .replace(/%/g, "");
  if (!raw) return null;
  const negative = raw.startsWith("-");
  if (negative) raw = raw.slice(1);
  const comma = raw.includes(",");
  const dot = raw.includes(".");
  if (comma && dot) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (comma) raw = raw.replace(",", ".");
  else if (dot && /^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

export function isAggregateMetaRow(row: Record<string, unknown>) {
  return (
    String(pickMetaField(row, FIELD_ALIASES.date) ?? "")
      .trim()
      .toLowerCase() === "all"
  );
}
