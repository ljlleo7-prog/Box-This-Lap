-- Ensure player profile exists and allow leaving championship

CREATE OR REPLACE FUNCTION public.ensure_player_profile()
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No auth uid');
  END IF;

  SELECT COALESCE(raw_user_meta_data->>'username', 'Player')
  INTO v_username
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.tcc_players (id, username)
  VALUES (v_user_id, v_username)
  ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(EXCLUDED.username, tcc_players.username);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.leave_championship(p_championship_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_released_team UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No auth uid');
  END IF;

  DELETE FROM public.tcc_championship_members
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id;

  UPDATE public.tcc_teams
  SET owner_id = NULL
  WHERE championship_id = p_championship_id
    AND owner_id = v_user_id
  RETURNING id INTO v_released_team;

  RETURN jsonb_build_object('success', true, 'team_released', v_released_team IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
