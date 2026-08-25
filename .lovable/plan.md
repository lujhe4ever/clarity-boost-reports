# Correção do schema de produção (somente banco)

Nenhum arquivo da aplicação será alterado. Nenhum dado será apagado.

## Estado atual verificado

- `clients` ainda tem `notes` e `manager_message` (2 registros com conteúdo) e **não tem** `dashboard_message`, `primary_color`, `secondary_color`, `logo_url`.
- `profiles` **não tem** `client_id`.
- `client_internal_metadata` **não existe**.
- Enum `app_role` só tem `admin` e `client`; os papéis atuais em `user_roles` são exatamente esses.
- Dados atuais: 2 clientes, 362 campanhas, 4 perfis — todos preservados.

Conclusão: as duas migrations do repositório nunca foram aplicadas em produção.

## Como será aplicado

Em 3 migrations idempotentes, na ordem, respeitando o conteúdo das migrations existentes:

**Migration 1 — valores de enum**
Adiciona `master_admin`, `admin_cliente`, `user` ao tipo `app_role` (com guarda de existência).
Motivo de ficar isolada: o Postgres não permite usar um valor de enum recém-criado na mesma transação em que foi adicionado — rodar o arquivo original inteiro falharia no `UPDATE user_roles SET role='master_admin'`. Só o agrupamento muda; o efeito final é idêntico ao arquivo do repositório.

**Migration 2 — multi-tenant (`20260427110000_ai_insights_multiclient.sql`)**
- `profiles.client_id` (FK para `clients`, `ON DELETE SET NULL`) + índice.
- `clients`: `primary_color`, `secondary_color`, `logo_url`, `dashboard_message`.
- Migra papéis: `admin` → `master_admin`, `client` → `user`.
- Preenche `profiles.client_id` a partir de `clients.user_id`.
- Copia `manager_message` para `dashboard_message`.
- Cria `get_user_client_id()` e as policies dessa etapa.

**Migration 3 — hardening (`20260824230000_security_hardening.sql`)**
- Cria `client_internal_metadata` e **copia `notes` e `manager_message` antes** de removê-los de `clients`.
- Remove as colunas antigas de `clients` e adiciona os CHECKs de cor/logo/mensagem.
- Remove a policy vulnerável **"Users update own profile"** (nenhuma policy de UPDATE em `profiles` para não-master: `user` e `admin_cliente` deixam de conseguir alterar `client_id`).
- Recria todas as policies de `profiles`, `user_roles`, `clients`, `campaigns` com isolamento por tenant e `TO authenticated`.
- Endurece `has_role` e cria `get_current_user_client_id` com `search_path` fixo, `REVOKE` de `PUBLIC`/`anon` e `GRANT` apenas para `authenticated`/`service_role`.
- Trigger `enforce_client_update_columns` restringindo os campos que `admin_cliente` pode editar em `clients`.
- Remove `get_user_client_id(uuid)`.

**Complementos incluídos na migration 3**
- `GRANT` explícito nas tabelas do schema `public` (`authenticated` e `service_role`; sem `anon`), já que as policies exigem privilégios de tabela.
- `NOTIFY pgrst, 'reload schema'` ao final para recarregar o cache do PostgREST.

## Validação após aplicar

Consultas de verificação e relatório objetivo de:
- existência de `clients.dashboard_message`;
- existência de `client_internal_metadata` e se os 2 registros de notas/mensagens foram migrados;
- ausência da policy "Users update own profile";
- ausência de qualquer policy que permita `user`/`admin_cliente` fazer UPDATE em `profiles` (bloqueando `client_id`);
- teste real, com sessão simulada, de `admin_cliente` tentando inserir campanha em outro `client_id` (deve falhar com 42501, dentro de transação revertida);
- qualquer SQL que tenha falhado.

Sem dados de exemplo, sem alteração de credenciais.
