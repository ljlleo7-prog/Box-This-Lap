CREATE OR REPLACE FUNCTION public.purchase_team(team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_championship_id UUID;
  v_team_budget BIGINT;
  v_existing_cash BIGINT := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tcc_players WHERE id = v_user_id) THEN
    INSERT INTO public.tcc_players (id, username) VALUES (v_user_id, NULL)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT championship_id, COALESCE(budget, 0)
  INTO v_championship_id, v_team_budget
  FROM public.tcc_teams
  WHERE id = team_id AND owner_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Team not available or already taken');
  END IF;

  UPDATE public.tcc_teams
  SET owner_id = v_user_id
  WHERE id = team_id;

  INSERT INTO public.tcc_championship_members (championship_id, user_id, role)
  VALUES (v_championship_id, v_user_id, 'player')
  ON CONFLICT (championship_id, user_id) DO NOTHING;

  INSERT INTO public.wallets (id, token_balance, cash_balance)
  VALUES (v_user_id, 1000, v_team_budget)
  ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(w.cash_balance, 0)
  INTO v_existing_cash
  FROM public.wallets w
  WHERE public.tcc_wallet_uid(w) = v_user_id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_cash <= 0 AND v_team_budget > 0 THEN
    UPDATE public.wallets w
    SET cash_balance = v_team_budget,
        updated_at = NOW()
    WHERE public.tcc_wallet_uid(w) = v_user_id;

    INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
    VALUES (
      v_championship_id,
      v_user_id,
      v_team_budget,
      0,
      'achievement_reward',
      'Initial team operating budget',
      jsonb_build_object('team_id', team_id, 'source', 'team_budget')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Team registered with initial cash budget',
    'cash_awarded', CASE WHEN v_existing_cash <= 0 THEN v_team_budget ELSE 0 END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
