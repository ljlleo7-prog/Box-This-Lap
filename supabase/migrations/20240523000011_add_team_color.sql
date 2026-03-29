-- Add color to tcc_teams to support UI styling and seed data
ALTER TABLE public.tcc_teams ADD COLUMN IF NOT EXISTS color VARCHAR(10) DEFAULT '#333';

-- Optional: backfill a neutral color for existing rows without color
UPDATE public.tcc_teams SET color = COALESCE(color, '#333');
