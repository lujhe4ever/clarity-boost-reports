import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Shield, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent glow-primary">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-gradient">Métrica</span>
        </div>
        <Link to="/login">
          <Button variant="ghost">Entrar</Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-16 pb-24 md:pt-28 md:pb-32 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-primary" />
          Plataforma de relatórios premium
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
          Dashboards de tráfego pago
          <br />
          <span className="text-gradient">Diagnósticos Estratégicos</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
          Relatórios profissionais. Métricas claras, interface elegante, zero complicação.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/login">
            <Button size="lg" className="gap-2 glow-primary">
              Acessar plataforma <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: TrendingUp,
              title: "Métricas que importam",
              desc: "Investimento, leads, ROI e CPL em destaque.",
            },
            {
              icon: Shield,
              title: "Acesso seguro",
              desc: "Cada cliente vê apenas seu próprio dashboard. Multi-tenant nativo.",
            },
            {
              icon: BarChart3,
              title: "Visual premium",
              desc: "Design moderno que traz clareza e direcionamento.",
            },
          ].map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Métrica · Dashboards de tráfego pago
      </footer>
    </div>
  );
}
