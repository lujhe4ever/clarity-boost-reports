
## Diagnóstico

Confirmado pelos network logs e pelo código de `src/routes/dashboard.tsx`:

1. Admin loga corretamente → role `admin` retornada ✓
2. App redireciona para `/dashboard` (sem `?client_id=...`)
3. No `loadData()` (linha 98–103), como não há `search.client_id`, o código cai no `else` e tenta:
   ```
   .from("clients").select(...).eq("user_id", user.id).maybeSingle()
   ```
   buscando clientes onde o **dono** é o admin → retorna `[]`
4. `client = null` → mostra "Nenhum dashboard disponível para sua conta."

A rota `/dashboard` foi desenhada para **clientes** (cada cliente tem seu próprio dashboard). O **admin** não deveria cair nessa tela sem um `client_id` — ele deveria estar em `/admin` para escolher qual cliente visualizar.

Olhando `src/routes/login.tsx` (linha 49): o redirect já está correto — `roleData?.role === "admin" ? "/admin" : "/dashboard"`. Ou seja, ao logar como admin ele **já vai para `/admin`**.

O problema acontece quando o admin:
- Acessa `/dashboard` direto pela URL, OU
- É redirecionado para `/dashboard` pelo `AuthGuard`/`Navigate` em algum fluxo, OU
- Clica em "voltar" e cai em `/dashboard`

Pelo session replay, o usuário foi para `/dashboard` direto (provavelmente digitou a URL ou estava num estado salvo) e viu a mensagem vazia.

## Plano

### Fix em `src/routes/dashboard.tsx` (único arquivo)

**1. Se admin acessa `/dashboard` sem `client_id` → redirecionar para `/admin`**

No início do `DashboardPage`, após carregar `isAdmin`:
```tsx
useEffect(() => {
  if (!loading && isAdmin && !search.client_id) {
    navigate({ to: "/admin" });
  }
}, [isAdmin, search.client_id, loading]);
```

**2. Melhorar a tela vazia para admin**

Quando admin chega em `/dashboard` sem `client_id` (instante antes do redirect, ou se o redirect falhar), mostrar mensagem clara com botão "Ir para o painel admin" em vez de "Nenhum dashboard disponível".

**3. Melhorar a tela vazia para cliente**

Para clientes sem registro em `clients`, manter a mensagem atual ("Nenhum dashboard disponível para sua conta") + botão Sair.

### Fora de escopo (sugiro depois)
- Garantir que ao criar um admin pelo painel, ele NÃO seja inserido na tabela `clients` (já parece ser o caso — admin atual não tem registro lá).
- Adicionar um link "Voltar ao painel" no header quando admin estiver visualizando dashboard de cliente (já existe na linha 197–203 ✓).

### Arquivos
- `src/routes/dashboard.tsx` — único alterado
