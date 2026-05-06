CREATE OR REPLACE FUNCTION public.run_system_keepalive()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pinged_at TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.system_keepalive (id, last_ping_at, run_count, updated_at)
  VALUES (1, pinged_at, 1, pinged_at)
  ON CONFLICT (id) DO UPDATE
  SET
    last_ping_at = EXCLUDED.last_ping_at,
    run_count = public.system_keepalive.run_count + 1,
    updated_at = EXCLUDED.updated_at;

  RETURN pinged_at;
END;
$$;

REVOKE ALL ON FUNCTION public.run_system_keepalive() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.run_system_keepalive() TO service_role;
  END IF;
END;
$$;
