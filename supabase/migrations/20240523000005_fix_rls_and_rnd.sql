-- Fix RLS for wallets
-- Allow users to insert their own wallet (needed for lazy initialization)
-- Note: 'tcc_' prefix as requested
DROP POLICY IF EXISTS "tcc_insert_own_wallet" ON public.wallets;
CREATE POLICY "tcc_insert_own_wallet" ON public.wallets
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Ensure users can read profiles (tcc_players) to display usernames
-- Check if policy exists or create new one with tcc_ prefix
DROP POLICY IF EXISTS "tcc_read_profiles" ON public.tcc_players;
CREATE POLICY "tcc_read_profiles" ON public.tcc_players
    FOR SELECT USING (true); -- Publicly readable profiles for username display

-- R&D Data Structure Update
-- Add detailed performance metrics to tcc_teams
-- We use a new column 'specs' to store the detailed technical data
ALTER TABLE tcc_teams ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{
    "acceleration": 50,
    "braking": 50,
    "drag_reduction": 50,
    "cornering_low": 50,
    "cornering_mid": 50,
    "cornering_high": 50,
    "ers_efficiency": 50,
    "cooling": 50,
    "lifespan": 100,
    "drs_efficiency": 50
}'::jsonb;

-- Also ensure update policy for wallets is correct (re-applying to be safe, with tcc_ prefix if needed, but keeping existing one is fine as per instruction "do not drop existing")
-- But we can add a specific one if the previous one was insufficient, though 'update own wallet' usually covers it.
-- Let's verify the existing one in previous migration was:
-- CREATE POLICY "Users can update their own wallet" ON public.wallets FOR UPDATE USING (auth.uid() = id);
-- That should be sufficient for updates.

-- Add RLS for tcc_teams to allow owners to update their team specs (if not already present)
-- Assuming owners need to update their team data
DROP POLICY IF EXISTS "tcc_update_own_team" ON public.tcc_teams;
CREATE POLICY "tcc_update_own_team" ON public.tcc_teams
    FOR UPDATE USING (auth.uid() = owner_id);

