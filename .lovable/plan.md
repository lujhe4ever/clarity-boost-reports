## Diagnóstico

1. **Métricas faltantes no banco**: a tabela `campaigns` só tem `investment`, `leads`, `revenue`. Não tem `impressions`, `reach`, `views`, `clicks`. Sem armazenar essas colunas, não há como mostrá-las no dashboard.
2. **Dashboard atual mostra 5 KPIs diferentes do pedido**: Investimento, Faturamento, ROI, Resultados, Custo por resultado.
3. **Arredondamento que perde precisão**:
   - `fmtBRL` usa `maximumFractionDigits: 0` → `R$ 0,95` vira `R$ 1`. Centavos somem.
   - `Math.round(parseNumberBR(r.leads))` força inteiro nos resultados (OK para "Resultados" do Meta, que sempre vem inteiro, mas para impressões/alcance/views/cliques também é inteiro — ainda OK; só precisamos não arredondar valores monetários e percentuais).
   - O parser `parseNumberBR` já lê corretamente `0,32%`, `1.2`, `1,25` — o problema é só na exibição.

## Plano

### 1. Adicionar colunas no banco (migration)
Adicionar à tabela `campaigns` (todas com `default 0`, não-nulas, para não quebrar dados existentes):
- `impressions` integer
- `reach` integer
- `views` integer (visualizações de vídeo / thruplays)
- `clicks` integer

Mantém `investment`, `leads`, `revenue` como estão (continuam servindo "Valor usado" e cálculos existentes do banco).

### 2. Importador (admin.tsx) — ler as novas métricas do Meta
Adicionar aliases ao `FIELD_ALIASES`:
- **impressions**: `impressões`, `impressions`
- **reach**: `alcance`, `reach`, `pessoas alcançadas`
- **views**: `visualizações`, `visualizações de vídeo`, `thruplays`, `reproduções de vídeo de 3 segundos`, `video views`, `3-second video views`, `thruplays`
- **clicks**: `cliques`, `cliques no link`, `clicks`, `link clicks`, `cliques (todos)`

Inserir os 4 campos em cada `record` do `handleCSV` usando `Math.round(parseNumberBR(...))` (são inteiros no Meta).

### 3. Dashboard — substituir KPIs e ajustar exibição

**KPIs (em ordem, conforme pedido)**: Resultados, Valor usado, Impressões, Alcance, Visualizações, Cliques.

Layout em grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`. Remove: Faturamento, ROI, Custo por resultado dos KPIs principais (CPL fica como coluna na tabela).

**Formatação correta de números (sem arredondamento perdendo precisão)**:
- Helper `fmtBRL(v)` aceita parâmetro de casas decimais; padrão **2 casas** (`R$ 0,95` em vez de `R$ 1`).
- Helper novo `fmtInt(v)` para impressões/alcance/views/cliques/leads — `toLocaleString("pt-BR")` sem casas decimais (são inteiros por natureza).
- Helper novo `fmtPct(v, dec=2)` para percentuais (CTR etc.) — `0,32%` em vez de `0%`.
- Helper novo `fmtDec(v, dec=2)` para decimais soltos como frequência (1,25).

Aplicar em **todos** os pontos: KPIs, tooltips dos gráficos e tabela. O `CustomTooltip` ganha props `format` para escolher a formatação por dataKey.

**Tabela "Resumo por campanha"** — colunas atualizadas na ordem pedida:
Campanha | Resultados | Valor usado | Impressões | Alcance | Visualizações | Cliques | Custo/Resultado

(mantém Custo/Resultado como bônus útil — mas formatado com 2 casas).

**Gráficos**: mantenho os dois atuais (Investimento ao longo do tempo e Resultados por dia). O gráfico de investimento passa a usar formatação com centavos no tooltip; mantém escala em "k" no eixo Y para legibilidade.

### 4. Tipo `Campaign` no front
Adicionar `impressions`, `reach`, `views`, `clicks` ao tipo, ao `useMemo` de totals, ao chartData e ao campaignSummary.

### Arquivos
- **Migration SQL** — adicionar 4 colunas em `campaigns`
- `src/routes/admin.tsx` — aliases novos + parsing dos 4 campos
- `src/routes/dashboard.tsx` — KPIs reordenados, helpers de formatação corretos, tabela e tipos atualizados

### Fora de escopo (posso fazer depois)
- Reformular gráficos para mostrar Impressões/Alcance/Cliques como séries adicionais
- KPIs derivados (CTR = cliques/impressões, CPM = custo/impressões × 1000, frequência = impressões/alcance)
