CREATE OR REPLACE FUNCTION public.purchase_team(team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_championship_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM tcc_players WHERE id = v_user_id) THEN
    INSERT INTO tcc_players (id, username) VALUES (v_user_id, NULL);
  END IF;
  
  SELECT championship_id INTO v_championship_id
  FROM tcc_teams
  WHERE id = team_id AND owner_id IS NULL;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Team not available or already taken');
  END IF;
  
  UPDATE tcc_teams
  SET owner_id = v_user_id
  WHERE id = team_id;
  
  INSERT INTO tcc_championship_members (championship_id, user_id, role)
  VALUES (v_championship_id, v_user_id, 'player')
  ON CONFLICT (championship_id, user_id) DO NOTHING;
  
  RETURN jsonb_build_object('success', true, 'message', 'Team registered without billing (test mode)');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
