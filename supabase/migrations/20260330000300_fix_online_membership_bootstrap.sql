-- Ensure online championship creation and scheduling work for hosts/owners

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

  SELECT COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1), 'Player')
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

GRANT EXECUTE ON FUNCTION public.ensure_player_profile() TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'leave_championship'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.leave_championship(UUID) TO authenticated;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'purchase_team'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.purchase_team(UUID) TO authenticated;
  END IF;
END;
$$;
