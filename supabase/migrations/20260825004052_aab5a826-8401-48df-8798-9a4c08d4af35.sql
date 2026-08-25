ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#0f766e',
  ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#0891b2',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS dashboard_message TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON public.profiles(client_id);

UPDATE public.user_roles SET role = 'master_admin' WHERE role = 'admin';
UPDATE public.user_roles SET role = 'user' WHERE role = 'client';

UPDATE public.profiles p
SET client_id = c.id
FROM public.clients c
WHERE c.user_id = p.id
  AND p.client_id IS NULL;

UPDATE public.clients
SET dashboard_message = manager_message
WHERE dashboard_message IS NULL
  AND manager_message IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id
  FROM public.profiles
  WHERE id = _user_id
$$;

DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
CREATE POLICY "Master admins manage all profiles" ON public.profiles
  FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Master admins manage roles" ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

DROP POLICY IF EXISTS "Clients view own record" ON public.clients;
DROP POLICY IF EXISTS "Admins manage clients" ON public.clients;

CREATE POLICY "Master admins manage clients" ON public.clients
  FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Users view own client" ON public.clients
  FOR SELECT
  USING (id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Client admins update own client" ON public.clients
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin_cliente')
    AND id = public.get_user_client_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_cliente')
    AND id = public.get_user_client_id(auth.uid())
  );

DROP POLICY IF EXISTS "Clients view own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins manage campaigns" ON public.campaigns;

CREATE POLICY "Master admins manage campaigns" ON public.campaigns
  FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Users view own campaigns by client" ON public.campaigns
  FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Client admins manage own campaigns" ON public.campaigns
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin_cliente')
    AND client_id = public.get_user_client_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_cliente')
    AND client_id = public.get_user_client_id(auth.uid())
  );