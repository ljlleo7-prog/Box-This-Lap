CREATE OR REPLACE FUNCTION public.tcc_enqueue_facility_upgrade(p_team_id UUID, p_facility TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_levels JSONB;
  v_queue JSONB;
  v_current INTEGER;
  v_cost INTEGER;
  v_duration_hours INTEGER;
  v_balance NUMERIC;
  v_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM tcc_teams WHERE id = p_team_id AND owner_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not owner');
  END IF;
  INSERT INTO tcc_facilities(team_id) VALUES (p_team_id) ON CONFLICT (team_id) DO NOTHING;
  SELECT levels, upgrade_queue INTO v_levels, v_queue FROM tcc_facilities WHERE team_id = p_team_id;
  v_current := COALESCE((v_levels ->> p_facility)::int, 1);
  v_cost := CASE p_facility
    WHEN 'factory' THEN 100
    WHEN 'aero' THEN 150
    WHEN 'powertrain' THEN 150
    WHEN 'simulator' THEN 120
    WHEN 'pit_crew' THEN 80
    WHEN 'logistics' THEN 90
    ELSE 100
  END;
  v_duration_hours := CASE p_facility
    WHEN 'factory' THEN 8
    WHEN 'aero' THEN 12
    WHEN 'powertrain' THEN 12
    WHEN 'simulator' THEN 10
    WHEN 'pit_crew' THEN 6
    WHEN 'logistics' THEN 6
    ELSE 8
  END;
  SELECT token_balance INTO v_balance FROM public.wallets WHERE user_uid = v_user_id;
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
  END IF;
  IF v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient tokens');
  END IF;
  UPDATE public.wallets SET token_balance = token_balance - v_cost, updated_at = NOW() WHERE user_uid = v_user_id;
  v_item := jsonb_build_object(
    'id', gen_random_uuid(),
    'facility', p_facility,
    'target_level', v_current + 1,
    'started_at', NOW(),
    'completes_at', NOW() + make_interval(hours => v_duration_hours),
    'cost_tkn', v_cost
  );
  UPDATE tcc_facilities
  SET upgrade_queue = COALESCE(upgrade_queue, '[]'::jsonb) || jsonb_build_array(v_item)
  WHERE team_id = p_team_id;
  RETURN jsonb_build_object('success', true, 'item', v_item);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_complete_ready_upgrades(p_team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_levels JSONB;
  v_queue JSONB;
  v_ready JSONB;
BEGIN
  v_user_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM tcc_teams WHERE id = p_team_id AND owner_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not owner');
  END IF;
  SELECT levels, upgrade_queue INTO v_levels, v_queue FROM tcc_facilities WHERE team_id = p_team_id;
  v_ready := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(v_queue, '[]'::jsonb)) elem
    WHERE (elem ->> 'completes_at')::timestamptz <= NOW()
  );
  IF jsonb_array_length(v_ready) = 0 THEN
    RETURN jsonb_build_object('success', true, 'completed', '[]'::jsonb);
  END IF;
  FOR v_levels IN
    SELECT v_levels || jsonb_build_object(
      elem ->> 'facility',
      COALESCE((v_levels ->> (elem ->> 'facility'))::int, 1) + 1
    )
    FROM jsonb_array_elements(v_ready) elem
  LOOP
    NULL;
  END LOOP;
  UPDATE tcc_facilities
  SET levels = (
    SELECT v_levels || (
      SELECT jsonb_object_agg(key, val)
      FROM (
        SELECT elem ->> 'facility' AS key,
          (COALESCE((v_levels ->> (elem ->> 'facility'))::int, 1) + 1)::text::jsonb AS val
        FROM jsonb_array_elements(v_ready) elem
      ) s
    )
  ),
  upgrade_queue = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(v_queue, '[]'::jsonb)) elem
    WHERE (elem ->> 'completes_at')::timestamptz > NOW()
  )
  WHERE team_id = p_team_id;
  RETURN jsonb_build_object('success', true, 'completed', v_ready);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
