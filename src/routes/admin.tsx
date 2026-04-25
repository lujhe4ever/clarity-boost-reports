import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import {
  BarChart3,
  LogOut,
  Plus,
  Trash2,
  Upload,
  ExternalLink,
  Building2,
  Loader2,
  MessageSquare,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * Faz parse de números em formato BR (1.234,56), US (1234.56) ou misto.
 * Remove R$, %, espaços, NBSP e aspas. Retorna 0 para inválidos.
 */
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

/** Normaliza nome de coluna: lowercase, sem acento, sem parênteses/unidades, sem espaços extras. */
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

/** Procura no objeto a primeira chave cujo nome normalizado bate com algum alias. */
function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const key of Object.keys(row)) {
    const nk = normalizeKey(key);
    if (normalizedAliases.includes(nk)) return row[key];
  }
  return undefined;
}

const FIELD_ALIASES = {
  date: ["data", "date", "dia", "day"],
  campaign_name: ["campanha", "nome da campanha", "campaign name", "campaign"],
  platform: ["plataforma", "platform", "veiculacao", "placement"],
  investment: ["investimento", "valor usado", "valor gasto", "gasto", "custo", "amount spent", "spend", "cost"],
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

/** Converte vários formatos de data para ISO yyyy-mm-dd. Retorna "" se inválido. */
function parseDateToISO(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  // Excel serial number
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

  // Já em ISO yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  // BR: dd/mm/yyyy ou dd-mm-yyyy
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Fallback: Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "";
}

/** Lê arquivo CSV ou Excel e devolve array de objetos (linhas). */
async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: true,
    });
  }

  // CSV via Papa Parse
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Painel Admin — Métrica" }],
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
};

function AdminPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  async function loadClients() {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    setClients(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  async function handleDelete(client: Client) {
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/delete-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify({ client_id: client.id }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Falha ao excluir");
      return;
    }
    toast.success("Cliente excluído");
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
              <div className="text-xs text-muted-foreground">Métrica</div>
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
              Gerencie acessos e dashboards dos seus clientes.
            </p>
          </div>
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
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading && (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {!loading && clients.length === 0 && (
            <div className="col-span-full glass-card rounded-2xl p-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum cliente ainda. Crie o primeiro!
              </p>
            </div>
          )}
          {clients.map((c) => (
            <div key={c.id} className="glass-card rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isto removerá {c.company_name}, seu login e todas as campanhas. Não pode ser desfeito.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(c)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{c.company_name}</h3>
              {c.contact_name && (
                <p className="text-sm text-muted-foreground">{c.contact_name}</p>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setSelectedClient(c)}
                >
                  <Upload className="h-3.5 w-3.5" /> Gerenciar
                </Button>
                <Link to="/dashboard" search={{ client_id: c.id }}>
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
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/create-client", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token}`,
      },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(json.error ?? "Falha ao criar cliente");
      return;
    }
    toast.success("Cliente criado!");
    onCreated();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription>
          Crie a empresa e o login de acesso. O cliente verá apenas o próprio dashboard.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome da empresa</Label>
          <Input
            required
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="Acme Ltda"
          />
        </div>
        <div className="space-y-2">
          <Label>Nome do contato (opcional)</Label>
          <Input
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            placeholder="João Silva"
          />
        </div>
        <div className="space-y-2">
          <Label>Email de acesso</Label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="cliente@empresa.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Senha provisória</Label>
          <Input
            required
            type="text"
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Mínimo 6 caracteres"
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
  const [message, setMessage] = useState(client.manager_message ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({ manager_message: message, notes })
      .eq("id", client.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo!");
    onSaved();
  }

  async function handleCSV(file: File) {
    setImporting(true);
    try {
      const rows = await readSpreadsheet(file);
      const totalRows = rows.length;

      const records = rows
        .map((r) => {
          const rawDate = pickField(r, [...FIELD_ALIASES.date]);
          const date = parseDateToISO(rawDate);
          const platformVal = pickField(r, [...FIELD_ALIASES.platform]);
          const campaignVal = pickField(r, [...FIELD_ALIASES.campaign_name]);
          return {
            client_id: client.id,
            date,
            platform: (platformVal ? String(platformVal).trim() : "") || "Meta Ads",
            campaign_name: (campaignVal ? String(campaignVal).trim() : "") || "Sem nome",
            investment: parseNumberBR(pickField(r, [...FIELD_ALIASES.investment])),
            leads: Math.round(parseNumberBR(pickField(r, [...FIELD_ALIASES.leads]))),
            revenue: parseNumberBR(pickField(r, [...FIELD_ALIASES.revenue])),
            impressions: Math.round(parseNumberBR(pickField(r, [...FIELD_ALIASES.impressions]))),
            reach: Math.round(parseNumberBR(pickField(r, [...FIELD_ALIASES.reach]))),
            views: Math.round(parseNumberBR(pickField(r, [...FIELD_ALIASES.views]))),
            clicks: Math.round(parseNumberBR(pickField(r, [...FIELD_ALIASES.clicks]))),
          };
        })
        .filter((r) => r.date);

      const ignored = totalRows - records.length;
      console.log("[Import] Colunas detectadas:", rows[0] ? Object.keys(rows[0]) : []);
      console.log("[Import] Amostra parseada:", records.slice(0, 3));

      if (records.length === 0) {
        toast.error(
          "Nenhuma linha válida encontrada. Verifique se o arquivo tem coluna de data diária (data, date, dia ou day)."
        );
        setImporting(false);
        return;
      }

      const { error } = await supabase.from("campaigns").insert(records);
      setImporting(false);
      if (error) return toast.error(error.message);
      toast.success(
        `${records.length} campanhas importadas!${ignored > 0 ? ` (${ignored} ignoradas sem data)` : ""}`
      );
    } catch (e: any) {
      setImporting(false);
      toast.error("Erro ao processar arquivo: " + (e?.message ?? String(e)));
    }
  }

  async function handleClearCampaigns() {
    const { error } = await supabase.from("campaigns").delete().eq("client_id", client.id);
    if (error) return toast.error(error.message);
    toast.success("Campanhas removidas");
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{client.company_name}</DialogTitle>
          <DialogDescription>
            Atualize a mensagem do gestor, observações e importe campanhas via CSV ou Excel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" /> Recado para o cliente
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Resumo do mês, próximos passos..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Observações internas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas que apenas você vê"
              rows={2}
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}
          </Button>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Upload className="h-4 w-4 text-primary" /> Importar campanhas (CSV ou Excel)
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Aceita <span className="font-mono">.csv</span>, <span className="font-mono">.xlsx</span> e{" "}
              <span className="font-mono">.xls</span> exportados do Meta Ads. Detectamos automaticamente:
              data, campanha, valor usado, resultados e valor de conversão.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-3 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCSV(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={handleClearCampaigns}
              className="mt-2 text-xs text-destructive hover:underline"
            >
              Limpar todas as campanhas deste cliente
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
