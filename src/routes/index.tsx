import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Shield, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";

import { CountUp } from "@/components/marketing/CountUp";
import { DataBackdrop } from "@/components/marketing/DataBackdrop";
import { Reveal } from "@/components/marketing/Reveal";
import { TrendLine } from "@/components/marketing/TrendLine";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: LandingPage });

const features = [
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
];

const metrics = [
  {
    icon: Wallet,
    label: "Investimento",
    value: 18420,
    prefix: "R$ ",
    suffix: "",
    decimals: 0,
    change: "+12,4% no período",
  },
  {
    icon: Target,
    label: "Resultados",
    value: 386,
    prefix: "",
    suffix: " leads",
    decimals: 0,
    change: "+28 resultados",
  },
  {
    icon: TrendingUp,
    label: "CPL",
    value: 47.72,
    prefix: "R$ ",
    suffix: "",
    decimals: 2,
    change: "-8,7% de custo",
  },
];

function LandingPage() {
  return (
    <div className="page-enter min-h-screen overflow-hidden">
      <nav
        className="container relative z-20 mx-auto flex items-center justify-between px-6 py-6"
        aria-label="Navegação principal"
      >
        <Link to="/" className="flex items-center gap-2" aria-label="Métrica — início">
          <div className="brand-mark">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold text-gradient">Métrica</span>
        </Link>
        <Link to="/login">
          <Button variant="ghost" className="hover:bg-primary/10 hover:text-primary">
            Entrar
          </Button>
        </Link>
      </nav>

      <section className="hero-grid relative">
        <DataBackdrop />
        <div className="container relative z-10 mx-auto px-6 pt-16 pb-24 text-center md:pt-28 md:pb-32">
          <div className="hero-eyebrow">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Plataforma de
            relatórios premium
          </div>
          <h1 className="hero-title mt-7 text-4xl font-bold tracking-[-0.04em] md:text-6xl lg:text-7xl">
            Clareza para investir.
            <br />
            <span className="text-gradient">Inteligência para crescer.</span>
          </h1>
          <p className="hero-subtitle mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Dashboards de tráfego pago que transformam dados complexos em decisões objetivas,
            rápidas e confiáveis.
          </p>
          <div className="hero-cta mt-10 flex justify-center">
            <Link to="/login">
              <Button size="lg" className="premium-cta gap-2 px-7">
                Acessar plataforma <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-24" aria-labelledby="advantages-title">
        <h2 id="advantages-title" className="sr-only">
          Vantagens da plataforma
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 90}>
              <article className="premium-card h-full p-6">
                <div className="icon-shell">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        className="relative border-y border-white/[0.06] bg-black/15 py-24"
        aria-labelledby="metrics-title"
      >
        <div className="data-section-glow" aria-hidden="true" />
        <div className="container relative mx-auto px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="section-kicker">Visão estratégica</p>
            <h2 id="metrics-title" className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
              Acompanhe o que realmente importa
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              Indicadores essenciais organizados para você entender desempenho e agir com confiança.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {metrics.map((metric, index) => (
              <Reveal key={metric.label} delay={index * 100}>
                <article className="metric-card">
                  <div className="flex items-center justify-between">
                    <div className="icon-shell">
                      <metric.icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="metric-dot" />
                  </div>
                  <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    {metric.label}
                  </p>
                  <div className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                    <CountUp
                      value={metric.value}
                      prefix={metric.prefix}
                      suffix={metric.suffix}
                      decimals={metric.decimals}
                    />
                  </div>
                  <p className="mt-2 text-xs text-success">{metric.change}</p>
                  <div className="mt-5">
                    <TrendLine variant={index === 1 ? "success" : "primary"} />
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <footer className="border-t border-border/70 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Métrica · Dashboards de tráfego pago
      </footer>
    </div>
  );
}
