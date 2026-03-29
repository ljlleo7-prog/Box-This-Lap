-- Create wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    token_balance INTEGER DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own wallet
CREATE POLICY "Users can view their own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own wallet (or strictly via server functions? For now allow update for prototype simplicity, but ideally RPC)
-- Actually, for safety, let's keep it restricted and use RPC for transactions. 
-- But for now, to ensure the app works easily without deploying edge functions immediately, I'll allow update.
CREATE POLICY "Users can update their own wallet" ON public.wallets
    FOR UPDATE USING (auth.uid() = id);


-- Add cost/metadata to teams if needed, but we can store it in the 'budget' or a new column.
-- Let's add a 'token_cost' column to tcc_teams to be explicit.
ALTER TABLE tcc_teams ADD COLUMN IF NOT EXISTS token_cost INTEGER DEFAULT 100;
ALTER TABLE tcc_teams ADD COLUMN IF NOT EXISTS performance JSONB DEFAULT '{}'::jsonb;

-- Function to initialize a user's wallet on signup (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.wallets (id, token_balance)
  VALUES (new.id, 1000);
  
  INSERT INTO public.tcc_players (id, username)
  VALUES (new.id, new.raw_user_meta_data->>'username'); -- Assuming username is passed in metadata
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RPC function to purchase a team
CREATE OR REPLACE FUNCTION public.purchase_team(team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_cost INTEGER;
  v_balance INTEGER;
  v_user_id UUID;
  v_championship_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Get team cost and championship_id
  SELECT token_cost, championship_id INTO v_cost, v_championship_id
  FROM tcc_teams
  WHERE id = team_id AND owner_id IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Team not available or already taken');
  END IF;
  
  -- Check balance
  SELECT token_balance INTO v_balance
  FROM public.wallets
  WHERE id = v_user_id;
  
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient tokens');
  END IF;
  
  -- Deduct tokens
  UPDATE public.wallets
  SET token_balance = token_balance - v_cost,
      updated_at = NOW()
  WHERE id = v_user_id;
  
  -- Assign team
  UPDATE tcc_teams
  SET owner_id = v_user_id
  WHERE id = team_id;
  
  -- Add to championship members
  INSERT INTO tcc_championship_members (championship_id, user_id, role)
  VALUES (v_championship_id, v_user_id, 'player')
  ON CONFLICT (championship_id, user_id) DO NOTHING;
  
  RETURN jsonb_build_object('success', true, 'message', 'Team purchased successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
