import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, BarChart3, LockKeyhole, TrendingUp } from "lucide-react";
import { canManageClients, resolveHighestRole } from "@/lib/roles";
import { setAuthPersistence } from "@/integrations/supabase/previewAuthStorage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Métrica" },
      { name: "description", content: "Acesse seu dashboard de tráfego pago." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={canManageClients(role) ? "/admin" : "/dashboard"} />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAuthPersistence(rememberLogin);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Email ou senha incorretos");
      return;
    }
    // Get role to redirect
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      navigate({
        to: canManageClients(resolveHighestRole((roleRows ?? []).map((row) => row.role)))
          ? "/admin"
          : "/dashboard",
      });
    }
  }

  return (
    <main className="page-enter grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="login-visual relative hidden min-h-screen overflow-hidden border-r border-white/[0.06] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="login-visual-grid" aria-hidden="true" />
        <Link
          to="/"
          className="relative z-10 flex items-center gap-2"
          aria-label="Métrica — início"
        >
          <div className="brand-mark">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold text-gradient">Métrica</span>
        </Link>
        <div className="relative z-10 max-w-xl">
          <div className="login-signal" aria-hidden="true">
            <TrendingUp className="h-5 w-5" />
            <span>Performance em foco</span>
          </div>
          <h1 className="mt-7 text-5xl font-bold leading-[1.05] tracking-[-0.04em] xl:text-6xl">
            Dados claros.
            <br />
            <span className="text-gradient">Decisões melhores.</span>
          </h1>
          <p className="mt-6 text-base text-muted-foreground">
            Acesso exclusivo para clientes O Seu Gestor.
          </p>
          <svg
            viewBox="0 0 560 150"
            className="login-chart mt-12 w-full"
            role="img"
            aria-label="Linha demonstrativa de crescimento"
          >
            <path className="login-chart-grid" d="M0 125H560M0 75H560M0 25H560" />
            <path
              className="login-chart-line"
              d="M4 126 C70 120 92 105 140 110 S230 77 280 84 S365 51 410 57 S492 22 556 18"
            />
          </svg>
        </div>
        <p className="relative z-10 text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Estratégia · Clareza · Crescimento
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 flex items-center gap-2 lg:hidden">
            <div className="brand-mark">
              <BarChart3 className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-gradient">Métrica</span>
          </Link>
          <div className="login-card rounded-2xl p-7 sm:p-9">
            <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="section-kicker">Área do cliente</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Bem-vindo de volta</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Acesse seu dashboard com email e senha.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="remember-login"
                  checked={rememberLogin}
                  onCheckedChange={(checked) => setRememberLogin(checked === true)}
                  aria-describedby="remember-description"
                />
                <div className="grid gap-1 leading-none">
                  <Label htmlFor="remember-login" className="cursor-pointer text-sm font-medium">
                    Manter login
                  </Label>
                  <p id="remember-description" className="text-xs leading-5 text-muted-foreground">
                    Mantém o acesso neste dispositivo. Sua senha não é armazenada.
                  </p>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Não tem acesso? Solicite ao seu gestor.
          </p>
        </div>
      </section>
    </main>
  );
}
