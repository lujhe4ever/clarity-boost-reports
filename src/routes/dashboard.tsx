import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  DollarSign,
  Loader2,
  LogOut,
  MessageSquare,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type SearchParams = { client_id?: string };

export const Route = createFileRoute("/dashboard")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    client_id: typeof s.client_id === "string" ? s.client_id : undefined,
  }),
  head: () => ({
    meta: [{ title: "Dashboard — Métrica" }],
  }),
  component: () => (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  ),
});

type Campaign = {
  id: string;
  date: string;
  platform: string;
  campaign_name: string;
  investment: number;
  leads: number;
  revenue: number;
};

type Client = {
  id: string;
  company_name: string;
  manager_message: string | null;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const search = Route.useSearch();
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, [user, search.client_id]);

  async function loadData() {
    if (!user) return;
    setLoading(true);

    let clientQuery = supabase.from("clients").select("id, company_name, manager_message");
    if (isAdmin && search.client_id) {
      clientQuery = clientQuery.eq("id", search.client_id);
    } else {
      clientQuery = clientQuery.eq("user_id", user.id);
    }

    const { data: clients } = await clientQuery.maybeSingle();
    setClient(clients);

    if (clients) {
      const { data: camps } = await supabase
        .from("campaigns")
        .select("*")
        .eq("client_id", clients.id)
        .order("date", { ascending: true });
      setCampaigns((camps ?? []) as Campaign[]);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const filtered = useMemo(() => {
    if (period === "all") return campaigns;
    const days = parseInt(period);
    const cutoff = subDays(new Date(), days);
    return campaigns.filter((c) => parseISO(c.date) >= cutoff);
  }, [campaigns, period]);

  const totals = useMemo(() => {
    const investment = filtered.reduce((s, c) => s + Number(c.investment), 0);
    const leads = filtered.reduce((s, c) => s + c.leads, 0);
    const revenue = filtered.reduce((s, c) => s + Number(c.revenue), 0);
    const roi = investment > 0 ? ((revenue - investment) / investment) * 100 : 0;
    const cpl = leads > 0 ? investment / leads : 0;
    return { investment, leads, revenue, roi, cpl };
  }, [filtered]);

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; investment: number; leads: number; revenue: number }>();
    filtered.forEach((c) => {
      const d = c.date;
      const existing = map.get(d) ?? { date: d, investment: 0, leads: 0, revenue: 0 };
      existing.investment += Number(c.investment);
      existing.leads += c.leads;
      existing.revenue += Number(c.revenue);
      map.set(d, existing);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: format(parseISO(d.date), "dd/MM", { locale: ptBR }),
      }));
  }, [filtered]);

  const campaignSummary = useMemo(() => {
    const map = new Map<string, { name: string; investment: number; leads: number; revenue: number }>();
    filtered.forEach((c) => {
      const key = c.campaign_name;
      const ex = map.get(key) ?? { name: key, investment: 0, leads: 0, revenue: 0 };
      ex.investment += Number(c.investment);
      ex.leads += c.leads;
      ex.revenue += Number(c.revenue);
      map.set(key, ex);
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
        <div className="text-center">
          <p className="text-muted-foreground">Nenhum dashboard disponível para sua conta.</p>
          <Button variant="ghost" onClick={handleLogout} className="mt-4 gap-2">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/30 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">{client.company_name}</div>
              <div className="text-xs text-muted-foreground">Dashboard de tráfego</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-6">
        {client.manager_message && (
          <div className="glass-card rounded-2xl p-5 border-l-4 border-l-primary">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-primary uppercase tracking-wider">
                  Recado do seu gestor
                </div>
                <p className="mt-1 text-sm leading-relaxed">{client.manager_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Investimento"
            value={fmtBRL(totals.investment)}
            icon={Wallet}
            tone="primary"
          />
          <KpiCard
            label="Faturamento"
            value={fmtBRL(totals.revenue)}
            icon={DollarSign}
            tone="success"
          />
          <KpiCard
            label="Retorno (ROI)"
            value={`${totals.roi.toFixed(1)}%`}
            icon={TrendingUp}
            tone={totals.roi >= 0 ? "success" : "destructive"}
          />
          <KpiCard
            label="Resultados"
            value={totals.leads.toLocaleString("pt-BR")}
            icon={Users}
            tone="primary"
          />
          <KpiCard
            label="Custo por resultado"
            value={fmtBRL(totals.cpl)}
            icon={Target}
            tone="primary"
          />
        </div>

        {chartData.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda não há dados para o período selecionado.
            </p>
          </div>
        ) : (
          <>
            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Investimento ao longo do tempo">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="grad-inv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.68 0.20 245)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="oklch(0.68 0.20 245)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="oklch(0.28 0.025 250)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="oklch(0.65 0.02 250)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="oklch(0.65 0.02 250)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip prefix="R$ " />} />
                    <Area type="monotone" dataKey="investment" stroke="oklch(0.68 0.20 245)" strokeWidth={2} fill="url(#grad-inv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Resultados (leads) por dia">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="oklch(0.28 0.025 250)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="oklch(0.65 0.02 250)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="oklch(0.65 0.02 250)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="leads" stroke="oklch(0.70 0.18 155)" strokeWidth={2.5} dot={{ r: 3, fill: "oklch(0.70 0.18 155)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Campaign table */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold mb-4">Resumo por campanha</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead className="text-right">Investido</TableHead>
                      <TableHead className="text-right">Resultados</TableHead>
                      <TableHead className="text-right">Custo/Resultado</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignSummary.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular">{fmtBRL(c.investment)}</TableCell>
                        <TableCell className="text-right tabular">{c.leads.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular">{fmtBRL(c.leads > 0 ? c.investment / c.leads : 0)}</TableCell>
                        <TableCell className="text-right tabular text-success">{fmtBRL(c.revenue)}</TableCell>
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

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
  }[tone];

  return (
    <div className="glass-card rounded-xl p-4 md:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-3 text-xl md:text-2xl font-bold tabular tracking-tight">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label, prefix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg px-3 py-2 text-xs">
      <div className="font-medium">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="tabular text-muted-foreground">
          {prefix}
          {Number(p.value).toLocaleString("pt-BR")}
        </div>
      ))}
    </div>
  );
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}
