DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'master_admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'master_admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin_cliente'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin_cliente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'user'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'user';
  END IF;
END
$$;