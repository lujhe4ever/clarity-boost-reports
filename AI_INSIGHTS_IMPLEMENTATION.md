# AI Insights Dashboard - Implementacao Local

## Ambiente seguro

- Copia isolada criada em um diretorio local de desenvolvimento.
- Origem obtida do repositorio Git configurado para a aplicacao.
- Objetivo remoto solicitado:
  - repositorio `dashboard-saas-ai-test`
  - branch `feature/ai-insights-dashboard`
- Status remoto atual:
  - nao foi possivel criar repositorio, branch, push ou PR porque o conector do GitHub expirou e o ambiente local esta sem `git` utilizavel

## Features criadas

### 1. Insights automaticos

- Arquivo:
  - `src/utils/insightsEngine.ts`
- O modulo compara `cpl`, `investimento`, `leads`, `clicks` e `views`.
- Quando existe periodo anterior comparavel, ele gera frases de variacao.
- Quando nao existe base anterior suficiente, ele gera um resumo seguro do recorte atual em vez de inventar comparacoes.

### 2. Tooltip explicativo

- Arquivos:
  - `src/components/TooltipInfo.tsx`
  - `src/utils/metricDescriptions.ts`
- Aplicacao:
  - principais cards do dashboard
- Objetivo:
  - explicar cada metrica para usuarios leigos

### 3. Resumo inteligente

- Arquivo:
  - `src/services/aiSummary.ts`
- Funcao principal:
  - `generateAISummary(dados)`
- Comportamento:
  - monta um prompt amigavel com os dados do dashboard
  - tenta usar um endpoint externo se configurado
  - usa fallback local se a IA nao estiver configurada ou falhar
- O extrator de resposta aceita formatos como:
  - `{ summary: "..." }`
  - `{ text: "..." }`
  - `{ output_text: "..." }`
  - payloads estilo chat/completions com `choices[0].message.content`

### 4. Card "Resumo do seu desempenho"

- Arquivo principal:
  - `src/routes/dashboard.tsx`
- Entregas:
  - card no topo do dashboard
  - resumo inteligente
  - lista de insights
  - chips com investimento, leads e CPL

### 5. Niveis de usuario

- Arquivos:
  - `src/lib/roles.ts`
  - `src/hooks/useAuth.tsx`
  - `src/components/AuthGuard.tsx`
  - `src/routes/login.tsx`
  - `src/routes/api/create-client.ts`
  - `src/routes/api/delete-client.ts`
  - `supabase/migrations/20260427110000_ai_insights_multiclient.sql`

#### Regras implementadas

- `master_admin`
  - acesso total
  - cria clientes
  - cria usuarios
  - gerencia dados de qualquer cliente
  - exclui clientes

- `admin_cliente`
  - gerencia apenas o proprio cliente
  - cria usuarios do tipo `user`
  - atualiza branding, mensagens e importa dados

- `user`
  - visualiza apenas o dashboard vinculado ao proprio `client_id`

### 6. Estrutura multi-cliente

- Foi adicionada a coluna:
  - `profiles.client_id`
- O dashboard passou a resolver o cliente nesta ordem:
  - `client_id` da URL
  - `client_id` do perfil do usuario
  - fallback legado por `clients.user_id`
- As politicas de RLS foram ajustadas para isolar acesso por cliente.

### 7. Customizacao por cliente

- Arquivo:
  - `src/config/clientConfig.ts`
- Campos aplicados dinamicamente:
  - nome
  - cor primaria
  - cor secundaria
  - logo
  - mensagem do dashboard

### 8. Importacao e periodo do dashboard

- Arquivo:
  - `src/routes/admin.tsx`
- Melhorias:
  - aceita CSV e XLSX de ate 5 MB e 10.000 linhas
  - rejeita XLS legado, MIME inesperado, ZIP64 e XLSX com expansao excessiva
  - tenta ler data diaria direta
  - aceita `inicio` e `fim` do relatorio apenas quando ambos forem o mesmo dia
  - parse numerico mais tolerante para valores de marketing

- Arquivo:
  - `src/routes/dashboard.tsx`
- Melhorias:
  - filtro padrao em `Todo o periodo`
  - recortes por data agora se ancoram na data mais recente do proprio dataset
  - resumo inteligente e insights foram alinhados ao periodo selecionado

## Arquivos novos ou principais alteracoes

- `src/lib/roles.ts`
- `src/config/clientConfig.ts`
- `src/utils/metricDescriptions.ts`
- `src/utils/insightsEngine.ts`
- `src/services/aiSummary.ts`
- `src/components/TooltipInfo.tsx`
- `src/hooks/useAuth.tsx`
- `src/components/AuthGuard.tsx`
- `src/routes/login.tsx`
- `src/routes/admin.tsx`
- `src/routes/dashboard.tsx`
- `src/routes/api/create-client.ts`
- `src/routes/api/delete-client.ts`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20260427110000_ai_insights_multiclient.sql`

## Como ativar a IA futuramente

### Recomendacao segura

Nao chame provedores de IA direto do browser com chave secreta. A aplicacao usa o endpoint autenticado `/api/ai-summary`, e qualquer credencial deve existir somente em variaveis server-side.

### Variaveis esperadas

- Frontend: `VITE_AI_SUMMARY_ENABLED`
- Backend: `AI_SUMMARY_ENDPOINT` e `AI_SUMMARY_API_KEY`

### Fluxo recomendado

1. Configurar o endpoint existente `/api/ai-summary`.
2. O endpoint autenticado recebe apenas os dados estruturados e monta o prompt no servidor.
3. O endpoint chama o provedor configurado no servidor com a chave secreta.
4. O endpoint devolve algo simples como:

```json
{
  "summary": "Seu custo por lead melhorou e o volume de leads cresceu no periodo."
}
```

### Exemplo de integracao com OpenAI no backend

O frontend envia:

```json
{
  "data": {
    "clientName": "...",
    "periodLabel": "...",
    "current": {},
    "previous": {},
    "insights": []
  }
}
```

No backend, voce pode transformar isso em uma chamada para Chat Completions ou Responses API da OpenAI e retornar apenas o texto final.

## Checklist sugerido para teste manual

1. Aplicar a migration nova no Supabase.
2. Entrar com um `master_admin`.
3. Criar um cliente com branding.
4. Criar um usuario `admin_cliente`.
5. Criar um usuario `user`.
6. Importar dados do cliente.
7. Abrir o dashboard pelo admin e pelo user.
8. Validar:
   - card de resumo inteligente
   - tooltips nos cards
   - isolamento por cliente
   - cores, logo e mensagem do dashboard
   - recortes de data

## Limitacoes desta rodada

- Nao foi possivel rodar build, lint ou testes automatizados neste ambiente.
- O runtime de dependencias do workspace falhou ao instalar.
- `node`, `npm` e `git` nao ficaram utilizaveis aqui.
- A validacao feita nesta rodada foi estrutural, por leitura de codigo e consistencia entre arquivos.

## Proximo passo quando o GitHub voltar

1. Reconectar o GitHub no Codex.
2. Criar o repositorio remoto `dashboard-saas-ai-test`.
3. Subir esta copia local intacta.
4. Criar a branch `feature/ai-insights-dashboard`.
5. Abrir uma PR com esta implementacao.
