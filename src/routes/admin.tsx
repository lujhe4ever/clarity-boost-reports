import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  ExternalLink,
  Loader2,
  LogOut,
  MessageSquare,
  Palette,
  Plus,
  Shield,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";

import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRoleLabel, isMasterAdmin as checkMasterAdmin } from "@/lib/roles";

function parseNumberBR(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim();
  if (!s) return 0;

  s = s.replace(/[R$\s\u00A0"']/gi, "").replace(/%/g, "");
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (!s) return 0;

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

  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[_\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeKey(key);
    if (normalizedAliases.includes(normalizedKey)) {
      return row[key];
    }
  }
  return undefined;
}

const FIELD_ALIASES = {
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
  leads: ["leads", "resultados", "results", "conversoes", "conversions"],
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

const HEADER_CANDIDATE_ALIASES = [
  ...FIELD_ALIASES.date,
  ...FIELD_ALIASES.report_start,
  ...FIELD_ALIASES.report_end,
  ...FIELD_ALIASES.campaign_name,
  ...FIELD_ALIASES.platform,
  ...FIELD_ALIASES.investment,
  ...FIELD_ALIASES.leads,
  ...FIELD_ALIASES.revenue,
  ...FIELD_ALIASES.impressions,
  ...FIELD_ALIASES.reach,
  ...FIELD_ALIASES.views,
  ...FIELD_ALIASES.clicks,
];

const HEADER_DATE_ALIASES = [
  ...FIELD_ALIASES.date,
  ...FIELD_ALIASES.report_start,
  ...FIELD_ALIASES.report_end,
];

const HEADER_METRIC_ALIASES = [
  ...FIELD_ALIASES.campaign_name,
  ...FIELD_ALIASES.platform,
  ...FIELD_ALIASES.investment,
  ...FIELD_ALIASES.leads,
  ...FIELD_ALIASES.revenue,
  ...FIELD_ALIASES.impressions,
  ...FIELD_ALIASES.reach,
  ...FIELD_ALIASES.views,
  ...FIELD_ALIASES.clicks,
];

function countHeaderMatches(cells: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeKey));
  return cells.filter((cell) => normalizedAliases.has(cell)).length;
}

function findHeaderRowIndex(rows: unknown[][]) {
  for (let index = 0; index < rows.length; index += 1) {
    const normalizedCells = rows[index]
      .map((cell) => normalizeKey(String(cell ?? "")))
      .filter(Boolean);

    if (normalizedCells.length === 0) continue;

    const totalMatches = countHeaderMatches(normalizedCells, HEADER_CANDIDATE_ALIASES);
    const dateMatches = countHeaderMatches(normalizedCells, HEADER_DATE_ALIASES);
    const metricMatches = countHeaderMatches(normalizedCells, HEADER_METRIC_ALIASES);

    if (dateMatches >= 1 && metricMatches >= 1 && totalMatches >= 3) {
      return index;
    }
  }

  return rows.length > 0 ? 0 : -1;
}

function rowsToObjects(rows: unknown[][]): Record<string, unknown>[] {
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex].map((cell, index) => {
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

function parseDateToISO(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const [, d, m, yearRaw] = br;
    let y = yearRaw;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsedDate = Date.parse(s);
  if (!Number.isNaN(parsedDate)) {
    return new Date(parsedDate).toISOString().slice(0, 10);
  }

  return "";
}

function extractDateFromRow(row: Record<string, unknown>) {
  const directDate = parseDateToISO(pickField(row, [...FIELD_ALIASES.date]));
  if (directDate) return directDate;

  const reportStart = parseDateToISO(pickField(row, [...FIELD_ALIASES.report_start]));
  const reportEnd = parseDateToISO(pickField(row, [...FIELD_ALIASES.report_end]));

  if (reportStart && reportEnd && reportStart === reportEnd) {
    return reportStart;
  }

  return "";
}

function analyzeDateColumns(rows: Record<string, unknown>[]) {
  let directDailyDates = 0;
  let singleDayRanges = 0;
  let multiDayRanges = 0;
  let sampleRange = "";

  for (const row of rows) {
    const directDate = parseDateToISO(pickField(row, [...FIELD_ALIASES.date]));
    if (directDate) {
      directDailyDates += 1;
      continue;
    }

    const reportStart = parseDateToISO(pickField(row, [...FIELD_ALIASES.report_start]));
    const reportEnd = parseDateToISO(pickField(row, [...FIELD_ALIASES.report_end]));

    if (reportStart && reportEnd) {
      if (reportStart === reportEnd) {
        singleDayRanges += 1;
      } else {
        multiDayRanges += 1;
        if (!sampleRange) {
          sampleRange = `${reportStart} ate ${reportEnd}`;
        }
      }
    }
  }

  return {
    directDailyDates,
    singleDayRanges,
    multiDayRanges,
    sampleRange,
  };
}

async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array", cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    return rowsToObjects(rows);
  }

  return new Promise((resolve, reject) => {
    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => resolve(rowsToObjects(result.data as unknown[][])),
      error: (error) => reject(error),
    });
  });
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Painel Admin - Metrica" }],
  }),
  component: () => (
    <AuthGuard requireAdmin>
      <AdminPage />
    </AuthGuard>
  ),
});

type Client = {
  id: string;
  user_id: string | null;
  company_name: string;
  contact_name: string | null;
  manager_message: string | null;
  notes: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  dashboard_message: string | null;
};

function AdminPage() {
  const navigate = useNavigate();
  const { role, clientId, canManageClients } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const isMasterAdmin = checkMasterAdmin(role);

  async function loadClients() {
    if (!canManageClients) return;

    setLoading(true);
    let query = supabase.from("clients").select("*").order("created_at", {
      ascending: false,
    });

    if (!isMasterAdmin && clientId) {
      query = query.eq("id", clientId);
    }

    const { data } = await query;
    setClients(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageClients, isMasterAdmin, clientId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  async function handleDelete(client: Client) {
    const { data: sess } = await supabase.auth.getSession();
    const response = await fetch("/api/delete-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify({ client_id: client.id }),
    });
    const payload = await response.json();

    if (!response.ok) {
      toast.error(payload.error ?? "Falha ao excluir");
      return;
    }

    toast.success("Cliente excluido");
    loadClients();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/30 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Painel Admin</div>
              <div className="text-xs text-muted-foreground">{getRoleLabel(role)}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie acessos, branding e dashboards dos seus clientes.
            </p>
          </div>

          {isMasterAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 glow-primary">
                  <Plus className="h-4 w-4" /> Novo cliente
                </Button>
              </DialogTrigger>
              <CreateClientDialog
                onCreated={() => {
                  setCreateOpen(false);
                  loadClients();
                }}
              />
            </Dialog>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading && (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && clients.length === 0 && (
            <div className="col-span-full rounded-2xl border border-border bg-muted/30 p-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum cliente configurado ainda.
              </p>
            </div>
          )}

          {clients.map((client) => (
            <div key={client.id} className="glass-card rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-white"
                  style={{
                    background: `linear-gradient(135deg, ${client.primary_color}, ${client.secondary_color})`,
                  }}
                >
                  <Building2 className="h-5 w-5" />
                </div>

                {isMasterAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso remove o cliente, os usuarios vinculados e as campanhas importadas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(client)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              <h3 className="mt-4 text-lg font-semibold">{client.company_name}</h3>
              <p className="text-sm text-muted-foreground">
                {client.contact_name || "Sem contato principal"}
              </p>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setSelectedClient(client)}
                >
                  <Upload className="h-3.5 w-3.5" /> Gerenciar
                </Button>
                <Link to="/dashboard" search={{ client_id: client.id }}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ExternalLink className="h-3.5 w-3.5" /> Ver
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      {selectedClient && (
        <ManageClientDialog
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onSaved={() => {
            setSelectedClient(null);
            loadClients();
          }}
        />
      )}
    </div>
  );
}

function CreateClientDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    password: "",
    primary_color: "#0f766e",
    secondary_color: "#0891b2",
    logo_url: "",
    dashboard_message: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const { data: sess } = await supabase.auth.getSession();
    const response = await fetch("/api/create-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify({ ...form, mode: "create_client" }),
    });
    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      toast.error(payload.error ?? "Falha ao criar cliente");
      return;
    }

    toast.success("Cliente criado com sucesso");
    onCreated();
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription>
          Crie o cliente, o branding inicial e o primeiro acesso de administracao do cliente.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome da empresa</Label>
            <Input
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="Nome do cliente"
            />
          </div>

          <div className="space-y-2">
            <Label>Contato principal</Label>
            <Input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="Nome do responsavel"
            />
          </div>

          <div className="space-y-2">
            <Label>Email do admin cliente</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="cliente@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Senha provisoria</Label>
            <Input
              required
              type="text"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimo 6 caracteres"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5" /> Cor primaria
            </Label>
            <Input
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5" /> Cor secundaria
            </Label>
            <Input
              type="color"
              value={form.secondary_color}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo (URL)</Label>
          <Input
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2">
          <Label>Mensagem do dashboard</Label>
          <Textarea
            value={form.dashboard_message}
            onChange={(e) => setForm({ ...form, dashboard_message: e.target.value })}
            placeholder="Mensagem exibida no dashboard do cliente"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar cliente"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ManageClientDialog({
  client,
  onClose,
  onSaved,
}: {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { role } = useAuth();
  const isMasterAdmin = checkMasterAdmin(role);

  const [message, setMessage] = useState(client.manager_message ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [primaryColor, setPrimaryColor] = useState(client.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(client.secondary_color);
  const [logoUrl, setLogoUrl] = useState(client.logo_url ?? "");
  const [dashboardMessage, setDashboardMessage] = useState(client.dashboard_message ?? "");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    display_name: "",
    email: "",
    password: "",
    role: "user",
  });

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        manager_message: message,
        notes,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_url: logoUrl || null,
        dashboard_message: dashboardMessage || null,
      })
      .eq("id", client.id);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Configuracoes salvas");
    onSaved();
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreatingUser(true);

    const { data: sess } = await supabase.auth.getSession();
    const response = await fetch("/api/create-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify({
        mode: "create_user",
        client_id: client.id,
        ...userForm,
        role: isMasterAdmin ? userForm.role : "user",
      }),
    });
    const payload = await response.json();
    setCreatingUser(false);

    if (!response.ok) {
      toast.error(payload.error ?? "Falha ao criar usuario");
      return;
    }

    toast.success("Usuario criado com sucesso");
    setUserForm({
      display_name: "",
      email: "",
      password: "",
      role: "user",
    });
  }

  async function handleCSV(file: File) {
    setImporting(true);

    try {
      const rows = await readSpreadsheet(file);
      const totalRows = rows.length;
      const dateAnalysis = analyzeDateColumns(rows);

      const records = rows
        .map((row) => {
          const date = extractDateFromRow(row);
          const platformVal = pickField(row, [...FIELD_ALIASES.platform]);
          const campaignVal = pickField(row, [...FIELD_ALIASES.campaign_name]);

          return {
            client_id: client.id,
            date,
            platform: (platformVal ? String(platformVal).trim() : "") || "Meta Ads",
            campaign_name: (campaignVal ? String(campaignVal).trim() : "") || "Sem nome",
            investment: parseNumberBR(pickField(row, [...FIELD_ALIASES.investment])),
            leads: Math.round(parseNumberBR(pickField(row, [...FIELD_ALIASES.leads]))),
            revenue: parseNumberBR(pickField(row, [...FIELD_ALIASES.revenue])),
            impressions: Math.round(parseNumberBR(pickField(row, [...FIELD_ALIASES.impressions]))),
            reach: Math.round(parseNumberBR(pickField(row, [...FIELD_ALIASES.reach]))),
            views: Math.round(parseNumberBR(pickField(row, [...FIELD_ALIASES.views]))),
            clicks: Math.round(parseNumberBR(pickField(row, [...FIELD_ALIASES.clicks]))),
          };
        })
        .filter((record) => record.date);

      const ignored = totalRows - records.length;

      if (records.length === 0) {
        if (dateAnalysis.multiDayRanges > 0) {
          toast.error(
            `Esse arquivo veio consolidado por periodo (${dateAnalysis.sampleRange || "intervalo maior que um dia"}). Exporte do Meta com detalhamento por tempo em Dia para usar no dashboard diario.`,
          );
        } else {
          toast.error(
            "Nenhuma linha valida encontrada. Verifique se o arquivo tem uma coluna diaria ou uma linha com inicio e fim do relatorio no mesmo dia.",
          );
        }
        setImporting(false);
        return;
      }

      const { error } = await supabase.from("campaigns").insert(records);
      setImporting(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(
        `${records.length} linhas importadas${ignored > 0 ? ` (${ignored} ignoradas)` : ""}.`,
      );
    } catch (error: unknown) {
      setImporting(false);
      toast.error(
        `Erro ao processar arquivo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function handleClearCampaigns() {
    const { error } = await supabase.from("campaigns").delete().eq("client_id", client.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Campanhas removidas");
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{client.company_name}</DialogTitle>
          <DialogDescription>
            Atualize branding, recados, usuarios e importacoes deste cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" /> Recado interno
                </Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Resumo do mes, pendencias e proximos passos"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Observacoes internas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas da operacao"
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5" /> Cor primaria
                  </Label>
                  <Input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5" /> Cor secundaria
                  </Label>
                  <Input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Logo (URL)</Label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label>Mensagem do dashboard</Label>
                <Textarea
                  value={dashboardMessage}
                  onChange={(e) => setDashboardMessage(e.target.value)}
                  placeholder="Mensagem exibida para o cliente no dashboard"
                  rows={3}
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alteracoes"}
          </Button>

          <div className="grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={handleCreateUser}
              className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4 text-primary" /> Criar acesso
              </div>

              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  required
                  value={userForm.display_name}
                  onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })}
                  placeholder="Nome do usuario"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  required
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="usuario@cliente.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Senha provisoria</Label>
                <Input
                  required
                  type="text"
                  minLength={6}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Minimo 6 caracteres"
                />
              </div>

              {isMasterAdmin ? (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" /> Nivel de acesso
                  </Label>
                  <Select
                    value={userForm.role}
                    onValueChange={(value) => setUserForm({ ...userForm, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin_cliente">Admin Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  Novos acessos criados daqui entram como USER.
                </div>
              )}

              <Button type="submit" disabled={creatingUser} className="w-full">
                {creatingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar usuario"}
              </Button>
            </form>

            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-primary" /> Importar campanhas
              </div>

              <p className="text-xs text-muted-foreground">
                Aceita CSV, XLSX e XLS exportados do Meta Ads. O importador detecta data diaria,
                campanha, investimento, resultados, visualizacoes e cliques.
              </p>

              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCSV(file);
                  e.target.value = "";
                }}
              />

              <button
                type="button"
                onClick={handleClearCampaigns}
                className="text-xs text-destructive hover:underline"
              >
                Limpar campanhas deste cliente
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
