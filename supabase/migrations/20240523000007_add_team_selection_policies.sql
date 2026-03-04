-- Allow authenticated users to view available (unowned) teams for selection
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'tcc_teams' AND policyname = 'tcc_view_unowned_teams'
) THEN
  CREATE POLICY "tcc_view_unowned_teams" ON public.tcc_teams FOR SELECT USING (owner_id IS NULL);
END IF;
END $$;

-- Allow viewing drivers belonging to unowned teams
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'tcc_drivers' AND policyname = 'tcc_view_unowned_team_drivers'
) THEN
  CREATE POLICY "tcc_view_unowned_team_drivers" ON public.tcc_drivers FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tcc_teams
      WHERE public.tcc_teams.id = public.tcc_drivers.team_id
        AND public.tcc_teams.owner_id IS NULL
    )
  );
END IF;
END $$;

-- Allow viewing facilities belonging to unowned teams
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'tcc_facilities' AND policyname = 'tcc_view_unowned_team_facilities'
) THEN
  CREATE POLICY "tcc_view_unowned_team_facilities" ON public.tcc_facilities FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tcc_teams
      WHERE public.tcc_teams.id = public.tcc_facilities.team_id
        AND public.tcc_teams.owner_id IS NULL
    )
  );
END IF;
END $$;
