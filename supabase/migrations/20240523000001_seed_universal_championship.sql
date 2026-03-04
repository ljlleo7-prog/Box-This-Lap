-- Seed the Universal Championship
-- This ensures there is always a default championship available

INSERT INTO tcc_championships (id, name, created_by, status)
SELECT 
    '00000000-0000-0000-0000-000000000000', -- Fixed UUID for the Universal Championship
    'Official Supabase Championship',
    NULL, -- System owned
    'active'
WHERE NOT EXISTS (
    SELECT 1 FROM tcc_championships WHERE id = '00000000-0000-0000-0000-000000000000'
);

-- Ensure we have at least one season/year for it? 
-- The current schema doesn't have "seasons" explicit separate table, just championships.
-- So this IS the championship.

-- Maybe add a default track schedule (Season 1) if empty?
-- For now, let's just create the container.
