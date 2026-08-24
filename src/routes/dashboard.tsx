import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  LogOut,
  MousePointerClick,
  PlayCircle,
  Target,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AuthGuard } from "@/components/AuthGuard";
import { TooltipInfo } from "@/components/TooltipInfo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { resolveClientConfig } from "@/config/clientConfig";
import { metricDescriptions } from "@/utils/metricDescriptions";
import { generateInsights, type InsightMetrics } from "@/utils/insightsEngine";
import { generateAISummary } from "@/services/aiSummary";

type SearchParams = { client_id?: string };
type DashboardPeriod = "7" | "30" | "90" | "all";

type Campaign = {
  id: string;
  date: string;
  platform: string;
  campaign_name: string;
  investment: number;
  leads: number;
  revenue: number;
  impressions: number;
  reach: number;
  views: number;
  clicks: number;
};

type Client = {
  id: string;
  company_name: string;
  dashboard_message: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
};

type LegacyClient = {
  id: string;
  company_name: string;
};

export const Route = createFileRoute("/dashboard")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    client_id: typeof s.client_id === "string" ? s.client_id : undefined,
  }),
  head: () => ({
    meta: [{ title: "Dashboard - Metrica" }],
  }),
  component: () => (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  ),
});

function DashboardPage() {
  const navigate = useNavigate();
  const { user, clientId, isMasterAdmin, canManageClients } = useAuth();
  const search = Route.useSearch();
  const requestedClientId =
    search.client_id ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("client_id") || undefined
      : undefined);
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("all");

  useEffect(() => {
    if (isMasterAdmin && !requestedClientId) {
      navigate({ to: "/admin" });
    }
  }, [isMasterAdmin, requestedClientId, navigate]);

  useEffect(() => {
    if (isMasterAdmin && !requestedClientId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, clientId, requestedClientId, isMasterAdmin]);

  async function loadData() {
    if (!user) return;
    setLoading(true);

    const getClientBaseQuery = (selectClause: string) => {
      let query = supabase.from("clients").select(selectClause);

      if (requestedClientId) {
        query = query.eq("id", requestedClientId);
      } else if (clientId) {
        query = query.eq("id", clientId);
      } else {
        query = query.eq("user_id", user.id);
      }

      return query;
    };

    const enhancedClientQuery = getClientBaseQuery(
      "id, company_name, dashboard_message, primary_color, secondary_color, logo_url",
    );

    const { data: enhancedClientData, error: enhancedClientError } =
      await enhancedClientQuery.maybeSingle();

    let clientData = enhancedClientData as Client | null;

    if (enhancedClientError) {
      const { data: legacyClientData } = await getClientBaseQuery("id, company_name").maybeSingle();

      const legacy = legacyClientData as LegacyClient | null;
      clientData = legacy
        ? {
            ...legacy,
            dashboard_message: null,
            primary_color: "#0f766e",
            secondary_color: "#0891b2",
            logo_url: null,
          }
        : null;
    }

    setClient(clientData);

    if (clientData) {
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("*")
        .eq("client_id", clientData.id)
        .order("date", { ascending: true });
      setCampaigns((campaignData ?? []) as Campaign[]);
    } else {
      setCampaigns([]);
    }

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const clientConfig = useMemo(() => resolveClientConfig(client), [client]);

  const filtered = useMemo(() => {
    return filterCampaignsByPeriod(campaigns, period);
  }, [campaigns, period]);

  const totals = useMemo(() => aggregateMetrics(filtered), [filtered]);

  const comparisonMetrics = useMemo(
    () => buildComparisonMetricsForPeriod(campaigns, period),
    [campaigns, period],
  );

  const insights = useMemo(
    () => generateInsights(comparisonMetrics.current, comparisonMetrics.previous),
    [comparisonMetrics],
  );

  const periodLabel = useMemo(() => {
    switch (period) {
      case "7":
        return "Ultimos 7 dias";
      case "30":
        return "Ultimos 30 dias";
      case "90":
        return "Ultimos 90 dias";
      default:
        return "Todo o periodo disponivel";
    }
  }, [period]);

  useEffect(() => {
    const summaryInput = {
      clientName: clientConfig.name,
      periodLabel,
      current: comparisonMetrics.current,
      previous: comparisonMetrics.previous,
      insights,
      hasPreviousPeriod: comparisonMetrics.hasPreviousPeriod,
    };

    let cancelled = false;
    setSummaryLoading(true);

    generateAISummary(summaryInput)
      .then((text) => {
        if (!cancelled) {
          setAiSummary(text);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientConfig.name, comparisonMetrics, insights, periodLabel]);

  const chartData = useMemo(() => {
    const map = new Map<
      string,
      { date: string; investment: number; leads: number; revenue: number }
    >();

    filtered.forEach((campaign) => {
      const key = campaign.date;
      const existing = map.get(key) ?? {
        date: key,
        investment: 0,
        leads: 0,
        revenue: 0,
      };

      existing.investment += Number(campaign.investment);
      existing.leads += Number(campaign.leads);
      existing.revenue += Number(campaign.revenue);
      map.set(key, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        label: format(parseISO(item.date), "dd/MM", { locale: ptBR }),
      }));
  }, [filtered]);

  const campaignSummary = useMemo(() => {
    type SummaryRow = {
      name: string;
      investment: number;
      leads: number;
      impressions: number;
      reach: number;
      views: number;
      clicks: number;
    };

    const map = new Map<string, SummaryRow>();
    filtered.forEach((campaign) => {
      const existing = map.get(campaign.campaign_name) ?? {
        name: campaign.campaign_name,
        investment: 0,
        leads: 0,
        impressions: 0,
        reach: 0,
        views: 0,
        clicks: 0,
      };

      existing.investment += Number(campaign.investment);
      existing.leads += Number(campaign.leads);
      existing.impressions += Number(campaign.impressions ?? 0);
      existing.reach += Number(campaign.reach ?? 0);
      existing.views += Number(campaign.views ?? 0);
      existing.clicks += Number(campaign.clicks ?? 0);
      map.set(campaign.campaign_name, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.investment - a.investment);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          {canManageClients ? (
            <>
              <p className="text-muted-foreground">
                Selecione um cliente no painel admin para visualizar o dashboard.
              </p>
              <Link to="/admin">
                <Button className="mt-4 gap-2">
                  <ArrowLeft className="h-4 w-4" /> Ir para o painel admin
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Nenhum dashboard disponivel para sua conta.</p>
              <Button variant="ghost" onClick={handleLogout} className="mt-4 gap-2">
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/30 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {canManageClients && (
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            )}

            {clientConfig.logo ? (
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                <img
                  src={clientConfig.logo}
                  alt={clientConfig.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${clientConfig.primaryColor}, ${clientConfig.secondaryColor})`,
                }}
              >
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
            )}

            <div>
              <div className="text-sm font-semibold">{client.company_name}</div>
              <div className="text-xs text-muted-foreground">Dashboard de trafego</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Ultimos 7 dias</SelectItem>
                <SelectItem value="30">Ultimos 30 dias</SelectItem>
                <SelectItem value="90">Ultimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o periodo</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-6 py-8">
        <section
          className="rounded-2xl border border-border bg-card/60 p-6"
          style={{
            boxShadow: `inset 4px 0 0 ${clientConfig.primaryColor}`,
          }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4" style={{ color: clientConfig.primaryColor }} />
                Resumo do seu desempenho
              </div>

              {clientConfig.messageDashboard && (
                <p className="text-sm text-muted-foreground">{clientConfig.messageDashboard}</p>
              )}

              <p className="text-sm leading-6 text-foreground">
                {summaryLoading
                  ? "Gerando resumo inteligente..."
                  : aiSummary || "Sem resumo disponivel no momento."}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <SummaryChip label="Investimento" value={fmtBRL(totals.investment)} />
                <SummaryChip label="Leads" value={fmtInt(totals.leads)} />
                <SummaryChip label="CPL" value={fmtBRL(totals.cpl)} />
              </div>
            </div>

            <div className="min-w-0 max-w-xl space-y-2">
              {insights.map((insight) => (
                <div
                  key={insight}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                >
                  {insight}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Resultados"
            metricKey="leads"
            value={fmtInt(totals.leads)}
            icon={Target}
            tone="success"
          />
          <KpiCard
            label="Valor usado"
            metricKey="investment"
            value={fmtBRL(totals.investment)}
            icon={Wallet}
            tone="primary"
          />
          <KpiCard
            label="Impressoes"
            metricKey="impressions"
            value={fmtInt(totals.impressions ?? 0)}
            icon={BarChart3}
            tone="primary"
          />
          <KpiCard
            label="Alcance"
            metricKey="reach"
            value={fmtInt(totals.reach ?? 0)}
            icon={Users}
            tone="primary"
          />
          <KpiCard
            label="Visualizacoes"
            metricKey="views"
            value={fmtInt(totals.views ?? 0)}
            icon={PlayCircle}
            tone="primary"
          />
          <KpiCard
            label="Cliques"
            metricKey="clicks"
            value={fmtInt(totals.clicks ?? 0)}
            icon={MousePointerClick}
            tone="primary"
          />
        </div>

        {chartData.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda nao ha dados para o periodo selecionado.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Valor usado ao longo do tempo">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="grad-investment" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={clientConfig.primaryColor}
                          stopOpacity={0.55}
                        />
                        <stop offset="100%" stopColor={clientConfig.primaryColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="oklch(0.28 0.025 250)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="oklch(0.65 0.02 250)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="oklch(0.65 0.02 250)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `R$${(value / 1000).toFixed(1)}k`}
                    />
                    <Tooltip content={<CustomTooltip formatType="currency" />} />
                    <Area
                      type="monotone"
                      dataKey="investment"
                      stroke={clientConfig.primaryColor}
                      strokeWidth={2}
                      fill="url(#grad-investment)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Resultados por dia">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      stroke="oklch(0.28 0.025 250)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      stroke="oklch(0.65 0.02 250)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="oklch(0.65 0.02 250)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip formatType="int" />} />
                    <Line
                      type="monotone"
                      dataKey="leads"
                      stroke={clientConfig.secondaryColor}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: clientConfig.secondaryColor }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="mb-4 text-lg font-semibold">Resumo por campanha</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead className="text-right">Resultados</TableHead>
                      <TableHead className="text-right">Valor usado</TableHead>
                      <TableHead className="text-right">Impressoes</TableHead>
                      <TableHead className="text-right">Alcance</TableHead>
                      <TableHead className="text-right">Visualizacoes</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">Custo/Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignSummary.map((campaign) => (
                      <TableRow key={campaign.name}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell className="text-right tabular">
                          {fmtInt(campaign.leads)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtBRL(campaign.investment)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtInt(campaign.impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtInt(campaign.reach)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtInt(campaign.views)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtInt(campaign.clicks)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmtBRL(campaign.leads > 0 ? campaign.investment / campaign.leads : 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span> {label}
    </div>
  );
}

function KpiCard({
  label,
  metricKey,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  metricKey: keyof typeof metricDescriptions;
  value: string;
  icon: LucideIcon;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
  }[tone];

  return (
    <div className="glass-card rounded-xl p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
          <TooltipInfo content={metricDescriptions[metricKey]} />
        </span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-3 text-xl font-bold tracking-tight md:text-2xl">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  formatType = "int",
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
  }>;
  label?: string;
  formatType?: "int" | "currency" | "decimal" | "percent";
}) {
  if (!active || !payload?.length) return null;

  const formatValue = (value: number) => {
    if (formatType === "currency") return fmtBRL(value);
    if (formatType === "decimal") return fmtDec(value);
    if (formatType === "percent") return fmtPct(value);
    return fmtInt(value);
  };

  return (
    <div className="glass-card rounded-lg px-3 py-2 text-xs">
      <div className="font-medium">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="text-muted-foreground">
          {formatValue(Number(item.value))}
        </div>
      ))}
    </div>
  );
}

function aggregateMetrics(campaigns: Campaign[]): InsightMetrics {
  const investment = campaigns.reduce((sum, campaign) => sum + Number(campaign.investment ?? 0), 0);
  const leads = campaigns.reduce((sum, campaign) => sum + Number(campaign.leads ?? 0), 0);

  return {
    investment,
    leads,
    cpl: leads > 0 ? investment / leads : 0,
    clicks: campaigns.reduce((sum, campaign) => sum + Number(campaign.clicks ?? 0), 0),
    views: campaigns.reduce((sum, campaign) => sum + Number(campaign.views ?? 0), 0),
    impressions: campaigns.reduce((sum, campaign) => sum + Number(campaign.impressions ?? 0), 0),
    reach: campaigns.reduce((sum, campaign) => sum + Number(campaign.reach ?? 0), 0),
    revenue: campaigns.reduce((sum, campaign) => sum + Number(campaign.revenue ?? 0), 0),
  };
}

function getPeriodWindow(campaigns: Campaign[], period: DashboardPeriod) {
  if (campaigns.length === 0) return null;

  const ordered = [...campaigns].sort((a, b) => a.date.localeCompare(b.date));
  const earliestDate = startOfDay(parseISO(ordered[0].date));
  const latestDate = startOfDay(parseISO(ordered[ordered.length - 1].date));

  if (period === "all") {
    return {
      start: earliestDate,
      end: latestDate,
      spanDays: Math.max(1, differenceInCalendarDays(latestDate, earliestDate) + 1),
    };
  }

  const spanDays = parseInt(period, 10);
  return {
    start: addDays(latestDate, -(spanDays - 1)),
    end: latestDate,
    spanDays,
  };
}

function filterCampaignsByPeriod(campaigns: Campaign[], period: DashboardPeriod) {
  const window = getPeriodWindow(campaigns, period);
  if (!window) return [];

  return campaigns.filter((campaign) => {
    const date = startOfDay(parseISO(campaign.date));
    return date >= window.start && date <= window.end;
  });
}

function buildComparisonMetricsForPeriod(campaigns: Campaign[], period: DashboardPeriod) {
  const window = getPeriodWindow(campaigns, period);
  if (!window) {
    return {
      current: aggregateMetrics([]),
      previous: aggregateMetrics([]),
      hasPreviousPeriod: false,
    };
  }

  const previousEnd = addDays(window.start, -1);
  const previousStart = addDays(previousEnd, -(window.spanDays - 1));

  const currentCampaigns = campaigns.filter((campaign) => {
    const date = startOfDay(parseISO(campaign.date));
    return date >= window.start && date <= window.end;
  });

  const previousCampaigns = campaigns.filter((campaign) => {
    const date = startOfDay(parseISO(campaign.date));
    return date >= previousStart && date <= previousEnd;
  });

  return {
    current: aggregateMetrics(currentCampaigns),
    previous: aggregateMetrics(previousCampaigns),
    hasPreviousPeriod: previousCampaigns.length > 0,
  };
}

function fmtBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function fmtInt(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value) || 0));
}

function fmtDec(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

function fmtPct(value: number, digits = 2) {
  return `${fmtDec(value, digits)}%`;
}
