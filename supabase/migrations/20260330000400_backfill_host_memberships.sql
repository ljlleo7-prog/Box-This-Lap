-- Backfill missing host memberships for championships created before membership bootstrap

INSERT INTO public.tcc_championship_members (championship_id, user_id, role)
SELECT c.id, c.created_by, 'host'
FROM public.tcc_championships c
WHERE c.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tcc_championship_members m
    WHERE m.championship_id = c.id
      AND m.user_id = c.created_by
  )
ON CONFLICT (championship_id, user_id) DO NOTHING;
