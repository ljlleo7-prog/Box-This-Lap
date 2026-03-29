-- Add round_number to tcc_weekends
ALTER TABLE tcc_weekends ADD COLUMN round_number INTEGER;

-- Backfill round_number for existing weekends
WITH computed_rounds AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY championship_id ORDER BY scheduled_race_at_utc) as rn
  FROM tcc_weekends
)
UPDATE tcc_weekends
SET round_number = computed_rounds.rn
FROM computed_rounds
WHERE tcc_weekends.id = computed_rounds.id;
