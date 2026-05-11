export const metricDescriptions = {
  leads: "Total de contatos ou oportunidades geradas no periodo.",
  investment: "Valor investido nas campanhas durante o periodo selecionado.",
  cpl: "Custo medio para gerar um lead.",
  roi: "Retorno estimado sobre o valor investido.",
  revenue: "Receita ou valor de conversao atribuida ao periodo.",
  impressions: "Quantidade de vezes que seus anuncios foram exibidos.",
  reach: "Numero de pessoas unicas impactadas pelos anuncios.",
  views: "Quantidade total de visualizacoes registradas.",
  clicks: "Total de cliques registrados nas campanhas.",
} as const;

export type MetricDescriptionKey = keyof typeof metricDescriptions;
