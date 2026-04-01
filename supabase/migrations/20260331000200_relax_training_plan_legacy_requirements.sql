-- Allow championship-scoped calendar schedule rows without legacy timed-training fields

ALTER TABLE public.tcc_training_plans
  ALTER COLUMN duration_hours_effective DROP NOT NULL,
  ALTER COLUMN completes_at DROP NOT NULL;
