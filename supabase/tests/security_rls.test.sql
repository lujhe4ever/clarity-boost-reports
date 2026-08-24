BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'master@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'admin-a@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'user-a@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'admin-b@example.test');

INSERT INTO public.clients (id, company_name)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('10000000-0000-0000-0000-000000000002', 'Cliente B');

UPDATE public.profiles
SET client_id = '10000000-0000-0000-0000-000000000001'
WHERE id IN (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

UPDATE public.profiles
SET client_id = '10000000-0000-0000-0000-000000000002'
WHERE id = '00000000-0000-0000-0000-000000000004';

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'master_admin'),
  ('00000000-0000-0000-0000-000000000002', 'admin_cliente'),
  ('00000000-0000-0000-0000-000000000003', 'user'),
  ('00000000-0000-0000-0000-000000000004', 'admin_cliente');

INSERT INTO public.campaigns (client_id, date, campaign_name)
VALUES
  ('10000000-0000-0000-0000-000000000001', CURRENT_DATE, 'Campanha A'),
  ('10000000-0000-0000-0000-000000000002', CURRENT_DATE, 'Campanha B');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.clients), 2::bigint, 'master_admin sees clients A and B');
SELECT is((SELECT count(*) FROM public.campaigns), 2::bigint, 'master_admin sees both campaigns');

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.clients), 1::bigint, 'admin A sees only client A');
SELECT is(
  (SELECT count(*) FROM public.clients WHERE id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'admin A cannot read client B'
);
SELECT throws_ok(
  $$
    INSERT INTO public.campaigns (client_id, date, campaign_name)
    VALUES ('10000000-0000-0000-0000-000000000002', CURRENT_DATE, 'Escape')
  $$,
  '42501',
  'new row violates row-level security policy for table "campaigns"',
  'admin A cannot insert a campaign for client B'
);
SELECT is(
  (
    WITH deleted AS (
      DELETE FROM public.campaigns
      WHERE client_id = '10000000-0000-0000-0000-000000000002'
      RETURNING 1
    )
    SELECT count(*) FROM deleted
  ),
  0::bigint,
  'admin A cannot delete client B campaigns'
);
SELECT throws_ok(
  $$
    UPDATE public.clients
    SET company_name = 'Alterado'
    WHERE id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'admin_cliente cannot modify administrative client fields',
  'admin A cannot modify administrative client fields'
);
SELECT lives_ok(
  $$
    UPDATE public.clients
    SET primary_color = '#112233', dashboard_message = 'Mensagem publica'
    WHERE id = '10000000-0000-0000-0000-000000000001'
  $$,
  'admin A can update approved branding fields'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.campaigns WHERE client_id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'user A sees client A campaigns'
);
SELECT is(
  (SELECT count(*) FROM public.campaigns WHERE client_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot see client B campaigns'
);
SELECT is(
  (
    WITH changed AS (
      UPDATE public.profiles
      SET client_id = '10000000-0000-0000-0000-000000000002'
      WHERE id = '00000000-0000-0000-0000-000000000003'
      RETURNING 1
    )
    SELECT count(*) FROM changed
  ),
  0::bigint,
  'user A cannot update profiles.client_id'
);
SELECT is(
  (SELECT count(*) FROM public.clients WHERE id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read client B'
);

SELECT * FROM finish();
ROLLBACK;
