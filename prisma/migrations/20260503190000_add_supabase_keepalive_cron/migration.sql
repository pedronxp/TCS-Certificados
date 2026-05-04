-- Supabase keepalive job.
-- Runs weekly inside Supabase Cron/pg_cron and touches a singleton row so the
-- database has periodic activity even when the app has low traffic.

CREATE TABLE IF NOT EXISTS public.system_keepalive (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT system_keepalive_singleton CHECK (id = 1)
);

INSERT INTO public.system_keepalive (id, last_ping_at, run_count, updated_at)
VALUES (1, now(), 0, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_system_keepalive()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_cron'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  ELSE
    RAISE NOTICE 'pg_cron is not available in this PostgreSQL instance. Supabase will enable the keepalive cron when this migration runs there.';
  END IF;
END;
$$;

DO $$
DECLARE
  keepalive_job_name TEXT := 'tcs-system-keepalive-weekly';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = keepalive_job_name
    ) THEN
      EXECUTE 'SELECT cron.unschedule($1)' USING keepalive_job_name;
    END IF;

    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
    USING
      keepalive_job_name,
      '0 9 * * 1',
      'SELECT public.run_system_keepalive();';
  ELSE
    RAISE NOTICE 'Supabase keepalive cron was not scheduled because pg_cron is not enabled.';
  END IF;
END;
$$;
