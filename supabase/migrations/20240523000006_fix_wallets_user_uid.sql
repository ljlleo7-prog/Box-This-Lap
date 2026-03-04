-- RLS policies aligned with shared schema (wallets.user_uid)
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'wallets' AND policyname = 'tcc_wallet_select'
) THEN
  CREATE POLICY "tcc_wallet_select" ON public.wallets FOR SELECT USING (auth.uid() = user_uid);
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'wallets' AND policyname = 'tcc_wallet_update'
) THEN
  CREATE POLICY "tcc_wallet_update" ON public.wallets FOR UPDATE USING (auth.uid() = user_uid);
END IF;
END $$;

-- Purchase team uses wallets.user_uid instead of wallets.id
CREATE OR REPLACE FUNCTION public.purchase_team(team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_cost INTEGER;
  v_balance NUMERIC;
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
  
  -- Check balance (wallets.user_uid)
  SELECT token_balance INTO v_balance
  FROM public.wallets
  WHERE user_uid = v_user_id;
  
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
  END IF;
  
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient tokens');
  END IF;
  
  -- Deduct tokens
  UPDATE public.wallets
  SET token_balance = token_balance - v_cost,
      updated_at = NOW()
  WHERE user_uid = v_user_id;
  
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
