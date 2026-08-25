CREATE TABLE IF NOT EXISTS public.client_internal_metadata (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  notes TEXT,
  manager_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_internal_metadata ENABLE ROW LEVEL SECURITY;

INSERT INTO public.client_internal_metadata (client_id, notes, manager_message)
SELECT
  id,
  to_jsonb(client_row) ->> 'notes',
  to_jsonb(client_row) ->> 'manager_message'
FROM public.clients AS client_row
ON CONFLICT (client_id) DO UPDATE
SET notes = COALESCE(public.client_internal_metadata.notes, EXCLUDED.notes),
    manager_message = COALESCE(
      public.client_internal_metadata.manager_message,
      EXCLUDED.manager_message
    );

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS manager_message;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_primary_color_format,
  DROP CONSTRAINT IF EXISTS clients_secondary_color_format,
  DROP CONSTRAINT IF EXISTS clients_logo_url_https,
  DROP CONSTRAINT IF EXISTS clients_dashboard_message_length;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_primary_color_format
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$') NOT VALID,
  ADD CONSTRAINT clients_secondary_color_format
    CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$') NOT VALID,
  ADD CONSTRAINT clients_logo_url_https
    CHECK (logo_url IS NULL OR logo_url ~ '^https://') NOT VALID,
  ADD CONSTRAINT clients_dashboard_message_length
    CHECK (dashboard_message IS NULL OR length(dashboard_message) <= 5000) NOT VALID;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Master admins manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Master admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

DROP POLICY IF EXISTS "Users view own client" ON public.clients;
DROP POLICY IF EXISTS "Client admins update own client" ON public.clients;
DROP POLICY IF EXISTS "Master admins manage clients" ON public.clients;
DROP POLICY IF EXISTS "Clients view own record" ON public.clients;
DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;

DROP POLICY IF EXISTS "Users view own campaigns by client" ON public.campaigns;
DROP POLICY IF EXISTS "Client admins manage own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Master admins manage campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Clients view own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins manage campaigns" ON public.campaigns;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN FALSE
    WHEN auth.role() = 'service_role' OR _user_id = auth.uid() THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    ELSE FALSE
  END
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_client_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT client_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_current_user_client_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_user_client_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_client_id() TO authenticated, service_role;

CREATE POLICY "Users view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'master_admin')
);

CREATE POLICY "Master admins manage profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Users view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'master_admin')
);

CREATE POLICY "Master admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Tenant members view own client"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'master_admin')
  OR id = public.get_current_user_client_id()
);

CREATE POLICY "Master admins manage clients"
ON public.clients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Client admins update allowed own-client fields"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_cliente')
  AND id = public.get_current_user_client_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin_cliente')
  AND id = public.get_current_user_client_id()
);

CREATE POLICY "Tenant members view own campaigns"
ON public.campaigns
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'master_admin')
  OR client_id = public.get_current_user_client_id()
);

CREATE POLICY "Master admins manage campaigns"
ON public.campaigns
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Client admins insert own campaigns"
ON public.campaigns
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin_cliente')
  AND client_id = public.get_current_user_client_id()
);

CREATE POLICY "Client admins update own campaigns"
ON public.campaigns
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_cliente')
  AND client_id = public.get_current_user_client_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin_cliente')
  AND client_id = public.get_current_user_client_id()
);

CREATE POLICY "Client admins delete own campaigns"
ON public.campaigns
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin_cliente')
  AND client_id = public.get_current_user_client_id()
);

CREATE POLICY "Master admins manage internal client metadata"
ON public.client_internal_metadata
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

REVOKE ALL ON TABLE public.client_internal_metadata FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_internal_metadata
TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_client_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR public.has_role(auth.uid(), 'master_admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin_cliente')
     AND OLD.id = public.get_current_user_client_id() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.contact_name IS DISTINCT FROM OLD.contact_name
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'admin_cliente cannot modify administrative client fields'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'client update is not authorized'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_client_update_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_client_update_columns() TO service_role;

DROP TRIGGER IF EXISTS enforce_client_update_columns ON public.clients;
CREATE TRIGGER enforce_client_update_columns
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_update_columns();

DROP TRIGGER IF EXISTS update_client_internal_metadata_updated_at
ON public.client_internal_metadata;
CREATE TRIGGER update_client_internal_metadata_updated_at
BEFORE UPDATE ON public.client_internal_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.get_user_client_id(UUID);

NOTIFY pgrst, 'reload schema';