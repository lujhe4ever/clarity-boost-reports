## Diagnóstico

Hoje o input em `src/routes/admin.tsx` (linhas 472–481) tem `accept=".csv"` e o `handleCSV` usa apenas `Papa.parse`, então:

1. Arquivos `.xlsx`/`.xls` baixados do Gerenciador de Anúncios do Meta nem são aceitos pelo seletor.
2. O parser só procura colunas com nomes em PT exato (`investimento`, `leads`, `faturamento`, `data`, `campanha`). Os exports nativos do Meta usam nomes como **"Valor usado (BRL)"**, **"Resultados"**, **"Nome da campanha"**, **"Início dos relatórios"** — então mesmo CSVs do Meta caem fora.

## Plano

Tornar o uploader único capaz de ler **CSV e Excel do Meta Ads**, com detecção automática de colunas (aliases), mantendo um arquivo por vez como hoje.

### 1. Aceitar Excel além de CSV
- Adicionar dependência `xlsx` (SheetJS) — funciona no browser, sem backend.
- Mudar `accept` do input para `.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Roteador de parsing por extensão/MIME:
  - `.csv` → Papa Parse (já temos)
  - `.xlsx` / `.xls` → `xlsx.read()` → `sheet_to_json` da primeira aba → mesmo pipeline de normalização.

### 2. Mapeamento robusto de colunas (Meta + genérico)
Criar função `pickField(row, aliases[])` que normaliza o nome da coluna (lowercase, sem acento, sem parênteses/unidades) e bate contra uma lista de aliases. Aliases iniciais:

- **date**: `data`, `date`, `dia`, `início dos relatórios`, `data de início`, `reporting starts`, `day`
- **campaign_name**: `campanha`, `nome da campanha`, `campaign name`, `campaign`
- **platform**: `plataforma`, `platform`, `veiculação`, `placement` (default "Meta Ads" se vazio)
- **investment**: `investimento`, `valor usado`, `valor usado (brl)`, `gasto`, `custo`, `amount spent`, `spend`, `cost`
- **leads**: `leads`, `resultados`, `results`, `conversões`, `conversions`
- **revenue**: `faturamento`, `receita`, `valor de conversão`, `purchase conversion value`, `revenue`, `purchases conversion value`

`parseNumberBR` permanece como está (já lida com `R$ 1.234,56`).

### 3. Tratamento de datas
Excel guarda datas como número serial. Quando vier número, converter via `XLSX.SSF.format("yyyy-mm-dd", n)` ou utilitário equivalente. Quando vier string `dd/mm/aaaa`, converter para ISO `yyyy-mm-dd` (Postgres `date` exige ISO). Linhas sem data continuam sendo ignoradas com contagem no toast.

### 4. UX no diálogo
- Atualizar a legenda de colunas para algo como: "Aceita CSV ou Excel exportado do Meta Ads. Detectamos automaticamente: data, campanha, valor usado, resultados, valor de conversão."
- Toast mantém o padrão atual: "X campanhas importadas (Y ignoradas sem data)".
- Console log da amostra parseada (já existe) continua para depuração.

### Arquivos
- `package.json` — adicionar `xlsx`
- `src/routes/admin.tsx` — único arquivo de código alterado (parser, mapeamento, UI do input)

### Fora de escopo
- Múltiplos arquivos por upload (você confirmou que não precisa agora).
- Suporte a Google Ads / TikTok (você confirmou só Meta agora — mas os aliases genéricos `cost`/`spend`/`conversions` que vou incluir já cobrem boa parte se um dia precisar).
- Coluna `cost_per_result` na tabela `campaigns` (continua sendo calculado).
