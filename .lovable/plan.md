
## Diagnóstico

O CSV importado contém números no padrão brasileiro (ex: `R$ 1.234,56` ou `12,5`), mas o parser atual em `src/routes/admin.tsx` faz apenas:

```js
parseFloat(String(r.investimento || "0").replace(",", ".")) || 0
```

Isso quebra porque:
1. `.replace(",", ".")` só troca a **primeira** vírgula → `1.234,56` vira `1.234.56` → `parseFloat` corta em `1.234`.
2. Não remove separador de milhar (`.`).
3. Não remove `R$`, `%`, espaços ou NBSP.
4. Resultado: valores decimais (custo por resultado, CPL, faturamento com centavos) chegam zerados ou truncados.

Hoje a tabela `campaigns` tem só `investment`, `leads`, `revenue`. "Custo por resultado" é **calculado** no dashboard como `investimento ÷ leads` — então se o investimento vem truncado, o custo por resultado também sai errado.

## Plano

### 1. Helper de parsing numérico BR/US robusto
Em `src/routes/admin.tsx`, adicionar `parseNumberBR(value)`:
- Remove `R$`, `%`, espaços, NBSP, aspas
- Detecta formato:
  - Tem `,` e `.` → BR (`.` = milhar, `,` = decimal) → remove `.`, troca `,` por `.`
  - Só `,` → decimal BR → troca `,` por `.`
  - Só `.` (com 1 ou 2 casas após) → decimal US → mantém
  - Só `.` como milhar (3 dígitos após) → remove
- Retorna `0` para vazio/inválido

### 2. Aplicar no `handleCSV`
Trocar os três `parseFloat(...replace...)` pelo novo helper. Para `leads` (inteiro), usar `Math.round(parseNumberBR(...))`.

### 3. Feedback de importação melhor
- Mostrar quantas linhas foram ignoradas por falta de data
- Mostrar amostra dos primeiros valores parseados no console para depuração

### Arquivos
- `src/routes/admin.tsx` — único arquivo alterado

### Fora do escopo (posso fazer depois se quiser)
- Adicionar coluna `cost_per_result` na tabela `campaigns` para importar valor exato do Meta/Google Ads em vez de calcular
- Suporte a delimitador `;` (CSVs do Excel BR usam ponto-e-vírgula) — Papa Parse já autodetecta, mas posso forçar se precisar
