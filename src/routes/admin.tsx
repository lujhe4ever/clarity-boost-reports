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
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          const records = rows
            .map((r) => ({
              client_id: client.id,
              date: r.data || r.date,
              platform: r.plataforma || r.platform || "Meta Ads",
              campaign_name: r.campanha || r.campaign_name || "Sem nome",
              investment: parseFloat(String(r.investimento || r.investment || "0").replace(",", ".")) || 0,
              leads: parseInt(String(r.leads || "0")) || 0,
              revenue: parseFloat(String(r.faturamento || r.revenue || "0").replace(",", ".")) || 0,
            }))
            .filter((r) => r.date);

          if (records.length === 0) {
            toast.error("Nenhuma linha válida no CSV");
            setImporting(false);
            return;
          }

          const { error } = await supabase.from("campaigns").insert(records);
          setImporting(false);
          if (error) return toast.error(error.message);
          toast.success(`${records.length} campanhas importadas!`);
        } catch (e: any) {
          setImporting(false);
          toast.error("Erro ao processar CSV: " + e.message);
        }
      },
    });
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
            Atualize a mensagem do gestor, observações e importe campanhas via CSV.
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
              <Upload className="h-4 w-4 text-primary" /> Importar campanhas (CSV)
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Colunas: <span className="font-mono">data, plataforma, campanha, investimento, leads, faturamento</span>
            </p>
            <input
              type="file"
              accept=".csv"
              className="mt-3 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCSV(f);
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
