import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Workbook } from "exceljs";
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
import { validateClientLogoFile } from "@/utils/clientLogo";
import {
  MAX_IMPORT_ROWS,
  assertSafeXlsxArchive,
  validateSpreadsheetFile,
  validateSpreadsheetRow,
} from "@/utils/spreadsheetSecurity";
import {
  PREFERRED_SHEET_NAMES,
  analyzeDateColumns,
  normalizeKey,
  parseCampaignRows,
  rowsToObjects,
} from "@/utils/metaAdsParser";

async function saveClientLogo(clientId: string, file: File | null, remove = false) {
  if (file) validateClientLogoFile(file);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) throw new Error("Sessao expirada");

  const formData = new FormData();
  formData.set("client_id", clientId);
  formData.set("action", remove ? "remove" : "upload");
  if (file) formData.set("file", file);

  const response = await fetch("/api/client-logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Falha ao salvar logo");
  return (payload.logo_url as string | null) ?? null;
}

function normalizeSpreadsheetCell(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value !== "object") return String(value);

  const cell = value as {
    result?: unknown;
    text?: unknown;
    richText?: Array<{ text?: string }>;
  };
  if (cell.result !== undefined) return normalizeSpreadsheetCell(cell.result);
  if (typeof cell.text === "string") return cell.text;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part) => part.text ?? "").join("");
  }
  return "";
}

async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const extension = validateSpreadsheetFile(file);

  if (extension === ".xlsx") {
    const buf = await file.arrayBuffer();
    assertSafeXlsxArchive(buf);
    const workbook = new Workbook();
    await workbook.xlsx.load(buf);
    const preferredSheet = workbook.worksheets.find((sheet) =>
      PREFERRED_SHEET_NAMES.includes(normalizeKey(sheet.name ?? "")),
    );
    const sheet = preferredSheet ?? workbook.worksheets[0];
    if (!sheet) throw new Error("O arquivo XLSX nao contem planilhas.");

    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (worksheetRow, rowNumber) => {
      if (rows.length >= MAX_IMPORT_ROWS + 1) {
        throw new Error(`O arquivo excede o limite de ${MAX_IMPORT_ROWS} linhas de dados.`);
      }
      const rawValues = Array.isArray(worksheetRow.values) ? worksheetRow.values.slice(1) : [];
      const values = rawValues.map(normalizeSpreadsheetCell);
      validateSpreadsheetRow(values, rowNumber);
      rows.push(values);
    });

    return rowsToObjects(rows);
  }

  return new Promise((resolve, reject) => {
    const rows: unknown[][] = [];
    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: true,
      step: (result, parser) => {
        try {
          if (rows.length >= MAX_IMPORT_ROWS + 1) {
            parser.abort();
            reject(new Error(`O arquivo excede o limite de ${MAX_IMPORT_ROWS} linhas de dados.`));
            return;
          }
          const row = result.data as unknown[];
          validateSpreadsheetRow(row, rows.length + 1);
          rows.push(row);
        } catch (error) {
          parser.abort();
          reject(error);
        }
      },
      complete: (result) => {
        if (!result.meta.aborted) resolve(rowsToObjects(rows));
      },
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
    const visibleClients = (data ?? []).map((client) => ({
      ...client,
      manager_message: null,
      notes: null,
    }));

    if (isMasterAdmin && visibleClients.length > 0) {
      const { data: internalRows } = await supabase
        .from("client_internal_metadata")
        .select("client_id, manager_message, notes")
        .in(
          "client_id",
          visibleClients.map((client) => client.id),
        );
      const internalByClient = new Map((internalRows ?? []).map((row) => [row.client_id, row]));
      setClients(
        visibleClients.map((client) => ({
          ...client,
          manager_message: internalByClient.get(client.id)?.manager_message ?? null,
          notes: internalByClient.get(client.id)?.notes ?? null,
        })),
      );
    } else {
      setClients(visibleClients);
    }
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
    dashboard_message: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
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

    if (logoFile && payload.client?.id) {
      try {
        await saveClientLogo(payload.client.id, logoFile);
      } catch (error) {
        toast.warning(
          `Cliente criado, mas a logo nao foi salva: ${error instanceof Error ? error.message : "falha no upload"}`,
        );
        onCreated();
        return;
      }
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
              type="password"
              minLength={12}
              maxLength={128}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimo 12 caracteres"
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
          <Label htmlFor="new-client-logo">Logo do cliente</Label>
          <Input
            id="new-client-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              try {
                if (file) validateClientLogoFile(file);
                setLogoFile(file);
              } catch (error) {
                event.target.value = "";
                setLogoFile(null);
                toast.error(error instanceof Error ? error.message : "Logo invalida");
              }
            }}
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP, no maximo 2 MB.</p>
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
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

    try {
      const { error: clientError } = await supabase
        .from("clients")
        .update({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          dashboard_message: dashboardMessage || null,
        })
        .eq("id", client.id);

      if (clientError) {
        throw clientError;
      }

      if (isMasterAdmin) {
        const { error: internalError } = await supabase.from("client_internal_metadata").upsert({
          client_id: client.id,
          manager_message: message || null,
          notes: notes || null,
        });
        if (internalError) {
          throw internalError;
        }
      }

      let nextLogoUrl = logoUrl || null;
      if (logoFile || removeLogo) {
        nextLogoUrl = await saveClientLogo(client.id, logoFile, removeLogo);
      }

      setLogoUrl(nextLogoUrl ?? "");
      setLogoFile(null);
      setRemoveLogo(false);
      setSaving(false);

      toast.success("Configuracoes salvas");
      onSaved();
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuracoes");
    }
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
      const dateAnalysis = analyzeDateColumns(rows);
      const parsed = parseCampaignRows(rows);

      const ignored = parsed.ignoredAggregate + parsed.ignoredNoDate;

      if (parsed.records.length === 0) {
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

      const syncRecords = parsed.records.map((record) => ({
        date: record.date,
        platform: record.platform,
        campaign_name: record.campaign_name,
        objective: record.objective,
        result_value: record.result_value,
        investment: record.investment,
        leads: record.leads,
        revenue: record.revenue,
        impressions: record.impressions,
        reach: record.reach,
        views: record.views,
        clicks: record.clicks,
      }));

      const campaignRecords = parsed.records.map((record) => ({
        client_id: client.id,
        date: record.date,
        platform: record.platform,
        campaign_name: record.campaign_name,
        investment: record.investment,
        leads: record.leads,
        revenue: record.revenue,
        impressions: record.impressions,
        reach: record.reach,
        views: record.views,
        clicks: record.clicks,
      }));

      const { data: sessionData } = await supabase.auth.getSession();
      const syncResponse = await fetch(
        "https://gvuggswkvsysaqtlsrdc.supabase.co/functions/v1/sync-canonical-metrics",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ clientName: client.company_name, records: syncRecords }),
        },
      );
      if (!syncResponse.ok) {
        setImporting(false);
        toast.error(
          "Os dados não foram gravados na base oficial. Nenhuma importação foi concluída.",
        );
        return;
      }

      const { error } = await supabase.from("campaigns").insert(campaignRecords);
      setImporting(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(
        `${campaignRecords.length} linhas importadas${ignored > 0 ? ` (${ignored} ignoradas)` : ""}.`,
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
            {isMasterAdmin && (
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
            )}

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
                <Label htmlFor={`client-logo-${client.id}`}>Logo do cliente</Label>
                <Input
                  id={`client-logo-${client.id}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    try {
                      if (file) validateClientLogoFile(file);
                      setLogoFile(file);
                      if (file) setRemoveLogo(false);
                    } catch (error) {
                      event.target.value = "";
                      setLogoFile(null);
                      toast.error(error instanceof Error ? error.message : "Logo invalida");
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP, no maximo 2 MB.</p>
                {(logoUrl || logoFile) && !removeLogo && (
                  <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                    {logoUrl && !logoFile && (
                      <img
                        src={logoUrl}
                        alt={`Logo atual de ${client.company_name}`}
                        className="h-12 w-20 rounded object-contain"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {logoFile ? logoFile.name : "Logo atual"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogoFile(null);
                        setRemoveLogo(true);
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                )}
                {removeLogo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveLogo(false)}
                  >
                    Manter logo atual
                  </Button>
                )}
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
                  type="password"
                  minLength={12}
                  maxLength={128}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Minimo 12 caracteres"
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
                Aceita CSV e XLSX de ate 5 MB e 10.000 linhas. O formato XLS legado nao e aceito. O
                importador detecta data diaria, campanha, investimento, resultados, visualizacoes e
                cliques.
              </p>

              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
