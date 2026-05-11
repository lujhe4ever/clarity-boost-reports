export type InsightMetrics = {
  cpl: number;
  investment: number;
  leads: number;
  clicks?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  revenue?: number;
};

function hasMeaningfulBaseline(metrics: InsightMetrics) {
  return [
    metrics.cpl,
    metrics.investment,
    metrics.leads,
    metrics.clicks ?? 0,
    metrics.views ?? 0,
    metrics.impressions ?? 0,
    metrics.reach ?? 0,
    metrics.revenue ?? 0,
  ].some((value) => Math.abs(Number(value) || 0) > 0);
}

function getPercentDelta(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPercent(value: number) {
  return `${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function pushIfTruthy(list: string[], text: string | null) {
  if (text) list.push(text);
}

export function generateInsights(dadosAtuais: InsightMetrics, dadosAnteriores: InsightMetrics) {
  const insights: string[] = [];

  if (!hasMeaningfulBaseline(dadosAnteriores)) {
    if (dadosAtuais.leads > 0) {
      insights.push(
        `No recorte atual, voce gerou ${dadosAtuais.leads} leads com CPL medio de ${formatCurrency(dadosAtuais.cpl)}.`,
      );
    }

    if ((dadosAtuais.clicks ?? 0) > 0) {
      insights.push(
        `Os anuncios somaram ${dadosAtuais.clicks} cliques e ${dadosAtuais.views ?? 0} visualizacoes no periodo selecionado.`,
      );
    }

    if (insights.length === 0) {
      insights.push("Ainda nao ha periodo anterior suficiente para comparacao neste recorte.");
    }

    return insights;
  }

  const cplDelta = getPercentDelta(dadosAtuais.cpl, dadosAnteriores.cpl);
  if (cplDelta !== null) {
    pushIfTruthy(
      insights,
      cplDelta < 0
        ? `Seu custo por lead caiu ${formatPercent(cplDelta)} no comparativo recente.`
        : cplDelta > 0
          ? `Seu custo por lead subiu ${formatPercent(cplDelta)} no comparativo recente.`
          : null,
    );
  }

  const leadsDelta = getPercentDelta(dadosAtuais.leads, dadosAnteriores.leads);
  if (leadsDelta !== null) {
    pushIfTruthy(
      insights,
      leadsDelta > 0
        ? `Voce gerou ${formatPercent(leadsDelta)} mais leads neste periodo.`
        : leadsDelta < 0
          ? `A geracao de leads caiu ${formatPercent(leadsDelta)} neste periodo.`
          : null,
    );
  } else if (dadosAtuais.leads > dadosAnteriores.leads) {
    insights.push("Voce gerou mais leads neste periodo.");
  }

  const investmentDelta = getPercentDelta(dadosAtuais.investment, dadosAnteriores.investment);
  if (investmentDelta !== null) {
    pushIfTruthy(
      insights,
      investmentDelta > 0 && dadosAtuais.leads >= dadosAnteriores.leads
        ? `O investimento cresceu ${formatPercent(investmentDelta)} sem perder volume de leads.`
        : investmentDelta < 0 && dadosAtuais.leads >= dadosAnteriores.leads
          ? `Voce reduziu o investimento em ${formatPercent(investmentDelta)} mantendo a captacao.`
          : null,
    );
  }

  const clicksDelta = getPercentDelta(dadosAtuais.clicks ?? 0, dadosAnteriores.clicks ?? 0);
  if (clicksDelta !== null) {
    pushIfTruthy(
      insights,
      clicksDelta > 0
        ? `Os cliques cresceram ${formatPercent(clicksDelta)} no comparativo recente.`
        : clicksDelta < 0
          ? `Os cliques recuaram ${formatPercent(clicksDelta)} no comparativo recente.`
          : null,
    );
  }

  const viewsDelta = getPercentDelta(dadosAtuais.views ?? 0, dadosAnteriores.views ?? 0);
  if (viewsDelta !== null && viewsDelta > 0) {
    insights.push(`As visualizacoes subiram ${formatPercent(viewsDelta)} no periodo.`);
  }

  if (insights.length === 0) {
    insights.push("Seus indicadores estao estaveis em relacao ao periodo anterior.");
  }

  return insights;
}
