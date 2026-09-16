export const FIELD_ALIASES = {
  date: ["data", "date", "dia", "day"],
  report_start: ["inicio dos relatorios", "reporting starts", "data inicial do relatorio"],
  report_end: ["encerramento dos relatorios", "reporting ends", "data final do relatorio"],
  campaign_name: [
    "campanha",
    "nome da campanha",
    "campaign name",
    "campaign",
    "conjunto de anuncios",
    "nome do conjunto de anuncios",
    "ad set name",
    "ad set",
    "nome do anuncio",
    "ad name",
  ],
  platform: [
    "plataforma",
    "platform",
    "veiculacao",
    "veiculacao do conjunto de anuncios",
    "placement",
    "origem",
  ],
  objective: [
    "objetivo",
    "objetivo da campanha",
    "objective",
    "campaign objective",
    "tipo de resultado",
    "indicador de resultados",
    "result indicator",
    "result type",
  ],
  investment: [
    "investimento",
    "valor usado",
    "valor gasto",
    "valor investido",
    "gasto",
    "custo",
    "amount spent",
    "spend",
    "cost",
  ],
  result_value: ["resultados", "results", "resultado"],
  leads: ["leads", "conversoes", "conversions", "cadastros", "lead"],
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

export const PREFERRED_SHEET_NAMES = ["raw data report", "raw data", "dados brutos"];

/** Valores agregados que o Meta usa para linhas totalizadoras. */
const AGGREGATE_TOKENS = new Set(["all", "todos", "todas", "total", "geral"]);

const LEAD_KEYWORDS = [
  "lead",
  "cadastro",
  "formulario",
  "conversa",
  "mensagem",
  "messaging",
  "contato",
  "whatsapp",
  "inscricao",
  "registration",
  "sign up",
  "signup",
];

const NON_LEAD_KEYWORDS = [
  "alcance",
  "reach",
  "impress",
  "trafego",
  "traffic",
  "clique",
  "click",
  "video",
  "visualiza",
  "engajamento",
  "engagement",
  "reconhecimento",
  "awareness",
  "seguidor",
  "curtida",
  "like",
];

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[_\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickField(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const key of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeKey(key))) return row[key];
  }
  return undefined;
}

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Converte numeros brasileiros ("1.234,56", "R$ 1.234,56", "12%").
 * Retorna null quando o texto nao representa um numero.
 */
export function parseNumberStrict(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return null;

  let s = String(value).trim();
  if (!s) return null;

  s = s.replace(/[R$\s\u00A0"']/gi, "").replace(/%/g, "");
  const negative = s.startsWith("-") || (s.startsWith("(") && s.endsWith(")"));
  s = s.replace(/^[-(]/, "").replace(/\)$/, "");
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (parts.length === 2 && last.length === 3 && parts[0].length <= 3)) {
      s = s.replace(/\./g, "");
    }
  }

  const parsed = Number.parseFloat(s);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function parseNumberBR(value: unknown): number {
  return parseNumberStrict(value) ?? 0;
}

const HEADER_DATE_ALIASES = [
  ...FIELD_ALIASES.date,
  ...FIELD_ALIASES.report_start,
  ...FIELD_ALIASES.report_end,
];

const HEADER_METRIC_ALIASES = [
  ...FIELD_ALIASES.campaign_name,
  ...FIELD_ALIASES.platform,
  ...FIELD_ALIASES.objective,
  ...FIELD_ALIASES.investment,
  ...FIELD_ALIASES.result_value,
  ...FIELD_ALIASES.leads,
  ...FIELD_ALIASES.revenue,
  ...FIELD_ALIASES.impressions,
  ...FIELD_ALIASES.reach,
  ...FIELD_ALIASES.views,
  ...FIELD_ALIASES.clicks,
];

const HEADER_CANDIDATE_ALIASES = [...HEADER_DATE_ALIASES, ...HEADER_METRIC_ALIASES];

function countMatches(cells: string[], aliases: string[]) {
  const set = new Set(aliases.map(normalizeKey));
  return cells.filter((cell) => set.has(cell)).length;
}

/** Procura dinamicamente a linha de cabecalho, ignorando linhas de apresentacao. */
export function findHeaderRowIndex(rows: unknown[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const cells = (rows[index] ?? []).map((cell) => normalizeKey(String(cell ?? ""))).filter(Boolean);
    if (cells.length === 0) continue;

    const total = countMatches(cells, HEADER_CANDIDATE_ALIASES);
    const dates = countMatches(cells, HEADER_DATE_ALIASES);
    const metrics = countMatches(cells, HEADER_METRIC_ALIASES);

    if (dates >= 1 && metrics >= 1 && total >= 3) return index;
  }
  return -1;
}

export function rowsToObjects(rows: unknown[][]): Record<string, unknown>[] {
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    throw new Error(
      "Nao foi possivel identificar o cabecalho da planilha. Exporte o relatorio do Meta Ads com as colunas de data e metricas.",
    );
  }

  const headers = (rows[headerRowIndex] ?? []).map((cell, index) => {
    const text = String(cell ?? "").trim();
    return text || `coluna_${index + 1}`;
  });

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });
}

export function parseDateToISO(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.floor(value) * 86_400_000);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const [, d, m, yearRaw] = br;
    const y = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);

  return "";
}

export function extractDateFromRow(row: Record<string, unknown>): string {
  const direct = parseDateToISO(pickField(row, FIELD_ALIASES.date));
  if (direct) return direct;

  const start = parseDateToISO(pickField(row, FIELD_ALIASES.report_start));
  const end = parseDateToISO(pickField(row, FIELD_ALIASES.report_end));
  if (start && end && start === end) return start;

  return "";
}

/** Linhas consolidadas do Meta, como "Dia = All". */
export function isAggregateRow(row: Record<string, unknown>): boolean {
  const candidates = [
    pickField(row, FIELD_ALIASES.date),
    pickField(row, FIELD_ALIASES.report_start),
    pickField(row, FIELD_ALIASES.report_end),
  ];
  return candidates.some(
    (value) => !isBlank(value) && AGGREGATE_TOKENS.has(normalizeKey(String(value))),
  );
}

export function isLeadObjective(objective: unknown): boolean {
  if (isBlank(objective)) return false;
  const text = normalizeKey(String(objective));
  if (NON_LEAD_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  return LEAD_KEYWORDS.some((keyword) => text.includes(keyword));
}

export type ParsedCampaignRow = {
  date: string;
  platform: string;
  campaign_name: string;
  objective: string;
  investment: number;
  leads: number;
  result_value: number;
  revenue: number;
  impressions: number;
  reach: number;
  views: number;
  clicks: number;
};

export type ParseResult = {
  records: ParsedCampaignRow[];
  totalRows: number;
  ignoredAggregate: number;
  ignoredNoDate: number;
};

function requireNumber(value: unknown, label: string, rowNumber: number): number {
  if (isBlank(value)) return 0;
  const parsed = parseNumberStrict(value);
  if (parsed === null || parsed < 0) {
    throw new Error(
      `Valor invalido de ${label} na linha ${rowNumber}: "${String(value).trim()}". Corrija a planilha e envie novamente.`,
    );
  }
  return parsed;
}

export function parseCampaignRows(rows: Record<string, unknown>[]): ParseResult {
  const records: ParsedCampaignRow[] = [];
  let ignoredAggregate = 0;
  let ignoredNoDate = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (isAggregateRow(row)) {
      ignoredAggregate += 1;
      return;
    }

    const date = extractDateFromRow(row);
    if (!date) {
      ignoredNoDate += 1;
      return;
    }

    const investment = requireNumber(pickField(row, FIELD_ALIASES.investment), "investimento", rowNumber);
    const impressions = requireNumber(pickField(row, FIELD_ALIASES.impressions), "impressoes", rowNumber);

    const objectiveRaw = pickField(row, FIELD_ALIASES.objective);
    const objective = isBlank(objectiveRaw) ? "" : String(objectiveRaw).trim();

    const directLeads = parseNumberStrict(pickField(row, FIELD_ALIASES.leads));
    const resultValue = parseNumberStrict(pickField(row, FIELD_ALIASES.result_value)) ?? 0;
    const leads =
      directLeads !== null && directLeads >= 0
        ? Math.round(directLeads)
        : isLeadObjective(objective)
          ? Math.round(resultValue)
          : 0;

    const platformRaw = pickField(row, FIELD_ALIASES.platform);
    const campaignRaw = pickField(row, FIELD_ALIASES.campaign_name);

    records.push({
      date,
      platform: (isBlank(platformRaw) ? "" : String(platformRaw).trim()) || "Meta Ads",
      campaign_name: (isBlank(campaignRaw) ? "" : String(campaignRaw).trim()) || "Sem nome",
      objective,
      investment,
      leads,
      result_value: resultValue,
      revenue: parseNumberBR(pickField(row, FIELD_ALIASES.revenue)),
      impressions: Math.round(impressions),
      reach: Math.round(parseNumberBR(pickField(row, FIELD_ALIASES.reach))),
      views: Math.round(parseNumberBR(pickField(row, FIELD_ALIASES.views))),
      clicks: Math.round(parseNumberBR(pickField(row, FIELD_ALIASES.clicks))),
    });
  });

  return { records, totalRows: rows.length, ignoredAggregate, ignoredNoDate };
}

export function analyzeDateColumns(rows: Record<string, unknown>[]) {
  let directDailyDates = 0;
  let singleDayRanges = 0;
  let multiDayRanges = 0;
  let sampleRange = "";

  for (const row of rows) {
    if (isAggregateRow(row)) continue;
    if (parseDateToISO(pickField(row, FIELD_ALIASES.date))) {
      directDailyDates += 1;
      continue;
    }
    const start = parseDateToISO(pickField(row, FIELD_ALIASES.report_start));
    const end = parseDateToISO(pickField(row, FIELD_ALIASES.report_end));
    if (start && end) {
      if (start === end) singleDayRanges += 1;
      else {
        multiDayRanges += 1;
        if (!sampleRange) sampleRange = `${start} ate ${end}`;
      }
    }
  }

  return { directDailyDates, singleDayRanges, multiDayRanges, sampleRange };
}
