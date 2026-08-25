-- Client logo uploads. Files are publicly readable for dashboard branding, but
-- only trusted tenant administrators may write inside their client's folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-logos',
  'client-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Client logos are publicly readable" ON storage.objects;
CREATE POLICY "Client logos are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'client-logos');

DROP POLICY IF EXISTS "Tenant admins insert client logos" ON storage.objects;
CREATE POLICY "Tenant admins insert client logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND (
    public.has_role(auth.uid(), 'master_admin')
    OR (
      public.has_role(auth.uid(), 'admin_cliente')
      AND (storage.foldername(name))[1] = public.get_current_user_client_id()::text
    )
  )
);

DROP POLICY IF EXISTS "Tenant admins update client logos" ON storage.objects;
CREATE POLICY "Tenant admins update client logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND (
    public.has_role(auth.uid(), 'master_admin')
    OR (
      public.has_role(auth.uid(), 'admin_cliente')
      AND (storage.foldername(name))[1] = public.get_current_user_client_id()::text
    )
  )
)
WITH CHECK (
  bucket_id = 'client-logos'
  AND (
    public.has_role(auth.uid(), 'master_admin')
    OR (
      public.has_role(auth.uid(), 'admin_cliente')
      AND (storage.foldername(name))[1] = public.get_current_user_client_id()::text
    )
  )
);

DROP POLICY IF EXISTS "Tenant admins delete client logos" ON storage.objects;
CREATE POLICY "Tenant admins delete client logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-logos'
  AND (
    public.has_role(auth.uid(), 'master_admin')
    OR (
      public.has_role(auth.uid(), 'admin_cliente')
      AND (storage.foldername(name))[1] = public.get_current_user_client_id()::text
    )
  )
);

NOTIFY pgrst, 'reload schema';
