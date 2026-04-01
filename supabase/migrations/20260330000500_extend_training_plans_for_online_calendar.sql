-- Extend online training plans to support championship-scoped calendar schedules

ALTER TABLE public.tcc_training_plans
  ADD COLUMN IF NOT EXISTS championship_id UUID REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.tcc_teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS round_number INTEGER,
  ADD COLUMN IF NOT EXISTS subject_type TEXT CHECK (subject_type IN ('driver', 'pit_crew')),
  ADD COLUMN IF NOT EXISTS subject_id TEXT,
  ADD COLUMN IF NOT EXISTS schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.tcc_training_plans tp
SET championship_id = teams.championship_id,
    team_id = drivers.team_id,
    subject_type = 'driver',
    subject_id = tp.driver_id::text,
    round_number = COALESCE(tp.round_number, 1),
    updated_at = NOW()
FROM public.tcc_drivers drivers
JOIN public.tcc_teams teams ON teams.id = drivers.team_id
WHERE tp.driver_id = drivers.id
  AND (tp.team_id IS NULL OR tp.championship_id IS NULL OR tp.subject_type IS NULL OR tp.subject_id IS NULL OR tp.round_number IS NULL);

ALTER TABLE public.tcc_training_plans
  ALTER COLUMN championship_id SET NOT NULL,
  ALTER COLUMN team_id SET NOT NULL,
  ALTER COLUMN round_number SET NOT NULL,
  ALTER COLUMN subject_type SET NOT NULL,
  ALTER COLUMN subject_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tcc_training_plans_context_unique_idx
  ON public.tcc_training_plans (championship_id, team_id, round_number, subject_type, subject_id);

DROP POLICY IF EXISTS "Players can manage their training plans" ON public.tcc_training_plans;

CREATE POLICY "Players can manage their training plans" ON public.tcc_training_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tcc_teams
      WHERE public.tcc_teams.id = public.tcc_training_plans.team_id
        AND public.tcc_teams.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tcc_teams
      WHERE public.tcc_teams.id = public.tcc_training_plans.team_id
        AND public.tcc_teams.owner_id = auth.uid()
        AND public.tcc_teams.championship_id = public.tcc_training_plans.championship_id
    )
  );
