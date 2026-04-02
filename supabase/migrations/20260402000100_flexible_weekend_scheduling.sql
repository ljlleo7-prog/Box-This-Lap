ALTER TABLE public.tcc_weekends
  ADD COLUMN IF NOT EXISTS scheduled_fp1_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_fp2_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_fp3_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS practice_block_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS cancelled_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_end_of_season BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.tcc_weekends
SET
  scheduled_fp1_at_utc = COALESCE(scheduled_fp1_at_utc, scheduled_practice_at_utc),
  scheduled_fp2_at_utc = COALESCE(scheduled_fp2_at_utc, scheduled_practice_at_utc + INTERVAL '1 hour'),
  scheduled_fp3_at_utc = COALESCE(scheduled_fp3_at_utc, scheduled_practice_at_utc + INTERVAL '2 hours'),
  practice_block_duration_minutes = COALESCE(practice_block_duration_minutes, 180)
WHERE scheduled_practice_at_utc IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tcc_weekends_one_active_finale_per_championship
  ON public.tcc_weekends (championship_id)
  WHERE is_end_of_season = true AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.tcc_resequence_weekend_rounds(
  p_championship_id UUID
)
RETURNS VOID AS $$
BEGIN
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY scheduled_race_at_utc ASC, id ASC) AS next_round
    FROM public.tcc_weekends
    WHERE championship_id = p_championship_id
  )
  UPDATE public.tcc_weekends w
  SET round_number = ordered.next_round
  FROM ordered
  WHERE w.id = ordered.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.tcc_create_weekend(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.tcc_create_weekend(
  p_championship_id UUID,
  p_track_id TEXT,
  p_host_local_datetime TIMESTAMPTZ,
  p_fp1_local_datetime TIMESTAMPTZ,
  p_quali_local_datetime TIMESTAMPTZ,
  p_weather_mode TEXT,
  p_realism_preset TEXT,
  p_speed_multiplier INTEGER DEFAULT NULL,
  p_practice_speed_multiplier INTEGER DEFAULT NULL,
  p_quali_speed_multiplier INTEGER DEFAULT NULL,
  p_race_speed_multiplier INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_created_by UUID;
  v_member_role TEXT;
  v_scheduled_race_at_utc TIMESTAMPTZ := p_host_local_datetime;
  v_scheduled_fp1_at_utc TIMESTAMPTZ := p_fp1_local_datetime;
  v_scheduled_quali_at_utc TIMESTAMPTZ := p_quali_local_datetime;
  v_scheduled_fp2_at_utc TIMESTAMPTZ;
  v_scheduled_fp3_at_utc TIMESTAMPTZ;
  v_previous_race_at_utc TIMESTAMPTZ;
  v_next_race_at_utc TIMESTAMPTZ;
  v_practice_session_minutes INTEGER;
  v_practice_block_minutes INTEGER;
  v_practice_block_end TIMESTAMPTZ;
  v_round_number INTEGER;
  v_resolved_practice_speed INTEGER;
  v_resolved_quali_speed INTEGER;
  v_resolved_race_speed INTEGER;
  v_has_active_finale BOOLEAN := false;
  v_weekend public.tcc_weekends%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_track_id IS NULL OR btrim(p_track_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Track is required');
  END IF;

  IF v_scheduled_race_at_utc IS NULL OR v_scheduled_fp1_at_utc IS NULL OR v_scheduled_quali_at_utc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Race, FP1, and qualifying times are required');
  END IF;

  SELECT created_by
  INTO v_created_by
  FROM public.tcc_championships
  WHERE id = p_championship_id;

  IF v_created_by IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Championship not found');
  END IF;

  SELECT role
  INTO v_member_role
  FROM public.tcc_championship_members
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
  LIMIT 1;

  IF v_created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Only the championship host can schedule weekends');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tcc_weekends
    WHERE championship_id = p_championship_id
      AND is_end_of_season = true
      AND status <> 'cancelled'
  )
  INTO v_has_active_finale;

  IF v_has_active_finale THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot add more races after the end-of-season race unless it is cancelled');
  END IF;

  IF v_scheduled_race_at_utc < NOW() + INTERVAL '2 days' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Race must be scheduled at least 2 days in advance');
  END IF;

  IF EXTRACT(MINUTE FROM v_scheduled_race_at_utc) NOT IN (0, 30)
     OR EXTRACT(SECOND FROM v_scheduled_race_at_utc) <> 0
     OR EXTRACT(MINUTE FROM v_scheduled_fp1_at_utc) NOT IN (0, 30)
     OR EXTRACT(SECOND FROM v_scheduled_fp1_at_utc) <> 0
     OR EXTRACT(MINUTE FROM v_scheduled_quali_at_utc) NOT IN (0, 30)
     OR EXTRACT(SECOND FROM v_scheduled_quali_at_utc) <> 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'All session times must be on whole half-hours');
  END IF;

  IF v_scheduled_fp1_at_utc::date <> (v_scheduled_race_at_utc::date - 1)
     OR v_scheduled_quali_at_utc::date <> (v_scheduled_race_at_utc::date - 1) THEN
    RETURN jsonb_build_object('success', false, 'message', 'FP1 and qualifying must both be scheduled on the day before the race');
  END IF;

  v_resolved_practice_speed := CASE
    WHEN p_practice_speed_multiplier IN (1, 2, 5, 10) THEN p_practice_speed_multiplier
    WHEN p_speed_multiplier IN (1, 2, 5, 10) THEN p_speed_multiplier
    ELSE 1
  END;

  v_resolved_quali_speed := CASE
    WHEN p_quali_speed_multiplier IN (1, 2, 5, 10) THEN p_quali_speed_multiplier
    WHEN p_speed_multiplier IN (1, 2, 5, 10) THEN p_speed_multiplier
    ELSE 1
  END;

  v_resolved_race_speed := CASE
    WHEN p_race_speed_multiplier IN (1, 2, 5, 10) THEN p_race_speed_multiplier
    WHEN p_speed_multiplier IN (1, 2, 5, 10) THEN p_speed_multiplier
    ELSE 1
  END;

  v_practice_session_minutes := CEIL(60.0 / v_resolved_practice_speed)::INTEGER;
  v_practice_block_minutes := v_practice_session_minutes * 3;
  v_practice_block_end := v_scheduled_fp1_at_utc + make_interval(mins => v_practice_block_minutes);
  v_scheduled_fp2_at_utc := v_scheduled_fp1_at_utc + make_interval(mins => v_practice_session_minutes);
  v_scheduled_fp3_at_utc := v_scheduled_fp2_at_utc + make_interval(mins => v_practice_session_minutes);

  IF v_scheduled_quali_at_utc < v_practice_block_end + INTERVAL '30 minutes' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Qualifying must be at least 30 minutes after the end of the practice block');
  END IF;

  SELECT scheduled_race_at_utc
  INTO v_previous_race_at_utc
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id
    AND status <> 'cancelled'
    AND scheduled_race_at_utc < v_scheduled_race_at_utc
  ORDER BY scheduled_race_at_utc DESC
  LIMIT 1;

  IF v_previous_race_at_utc IS NOT NULL
     AND EXTRACT(EPOCH FROM (v_scheduled_race_at_utc - v_previous_race_at_utc)) < 86400 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Race weekends must have at least a 24-hour gap from the previous active race');
  END IF;

  SELECT scheduled_race_at_utc
  INTO v_next_race_at_utc
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id
    AND status <> 'cancelled'
    AND scheduled_race_at_utc > v_scheduled_race_at_utc
  ORDER BY scheduled_race_at_utc ASC
  LIMIT 1;

  IF v_next_race_at_utc IS NOT NULL
     AND EXTRACT(EPOCH FROM (v_next_race_at_utc - v_scheduled_race_at_utc)) < 86400 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Race weekends must have at least a 24-hour gap from the next active race');
  END IF;

  SELECT COALESCE(MAX(round_number), 0) + 1
  INTO v_round_number
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id;

  INSERT INTO public.tcc_weekends (
    championship_id,
    track_id,
    speed_multiplier,
    practice_speed_multiplier,
    quali_speed_multiplier,
    race_speed_multiplier,
    weather_mode,
    realism_preset,
    host_timezone,
    scheduled_practice_at_utc,
    scheduled_fp1_at_utc,
    scheduled_fp2_at_utc,
    scheduled_fp3_at_utc,
    practice_block_duration_minutes,
    scheduled_quali_at_utc,
    scheduled_race_at_utc,
    round_number
  )
  VALUES (
    p_championship_id,
    p_track_id,
    COALESCE(p_speed_multiplier, v_resolved_race_speed),
    v_resolved_practice_speed,
    v_resolved_quali_speed,
    v_resolved_race_speed,
    p_weather_mode,
    p_realism_preset,
    'UTC',
    v_scheduled_fp1_at_utc,
    v_scheduled_fp1_at_utc,
    v_scheduled_fp2_at_utc,
    v_scheduled_fp3_at_utc,
    v_practice_block_minutes,
    v_scheduled_quali_at_utc,
    v_scheduled_race_at_utc,
    v_round_number
  )
  RETURNING * INTO v_weekend;

  PERFORM public.tcc_resequence_weekend_rounds(p_championship_id);

  SELECT *
  INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = v_weekend.id;

  RETURN to_jsonb(v_weekend) || jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_cancel_weekend(
  p_weekend_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend RECORD;
  v_is_host BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT w.*, c.created_by,
    EXISTS (
      SELECT 1
      FROM public.tcc_championship_members m
      WHERE m.championship_id = w.championship_id
        AND m.user_id = v_user_id
        AND m.role IN ('host', 'developer')
    ) AS is_member_host
  INTO v_weekend
  FROM public.tcc_weekends w
  JOIN public.tcc_championships c ON c.id = w.championship_id
  WHERE w.id = p_weekend_id;

  IF v_weekend.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  v_is_host := v_weekend.created_by = v_user_id OR COALESCE(v_weekend.is_member_host, false);
  IF NOT v_is_host THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  IF v_weekend.status = 'race_complete' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Completed race weekends cannot be cancelled');
  END IF;

  UPDATE public.tcc_weekends
  SET status = 'cancelled',
      cancelled_at_utc = NOW(),
      is_end_of_season = false
  WHERE id = p_weekend_id;

  UPDATE public.tcc_championships
  SET status = 'active'
  WHERE id = v_weekend.championship_id
    AND status = 'completed';

  RETURN jsonb_build_object('success', true, 'weekend_id', p_weekend_id, 'status', 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_set_weekend_end_of_season(
  p_weekend_id UUID,
  p_is_end_of_season BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend RECORD;
  v_is_host BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT w.*, c.created_by,
    EXISTS (
      SELECT 1
      FROM public.tcc_championship_members m
      WHERE m.championship_id = w.championship_id
        AND m.user_id = v_user_id
        AND m.role IN ('host', 'developer')
    ) AS is_member_host
  INTO v_weekend
  FROM public.tcc_weekends w
  JOIN public.tcc_championships c ON c.id = w.championship_id
  WHERE w.id = p_weekend_id;

  IF v_weekend.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  v_is_host := v_weekend.created_by = v_user_id OR COALESCE(v_weekend.is_member_host, false);
  IF NOT v_is_host THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  IF v_weekend.status = 'cancelled' AND p_is_end_of_season THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cancelled weekends cannot be marked as end-of-season');
  END IF;

  IF p_is_end_of_season THEN
    UPDATE public.tcc_weekends
    SET is_end_of_season = false
    WHERE championship_id = v_weekend.championship_id
      AND id <> p_weekend_id;
  END IF;

  UPDATE public.tcc_weekends
  SET is_end_of_season = p_is_end_of_season
  WHERE id = p_weekend_id;

  RETURN jsonb_build_object('success', true, 'weekend_id', p_weekend_id, 'isEndOfSeason', p_is_end_of_season);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_run_race(
  p_weekend_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_rewards_disabled BOOLEAN := false;
  v_total_rounds INTEGER := 0;
  v_completed_rounds INTEGER := 0;
  v_season_award JSONB := NULL;
  v_points_awarded JSONB := '{}'::jsonb;
  v_classification JSONB := '[]'::jsonb;
  v_team_cash_rewards JSONB := '{}'::jsonb;
  v_team_reward RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT *
  INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = p_weekend_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  SELECT created_by
  INTO v_created_by
  FROM public.tcc_championships
  WHERE id = v_weekend.championship_id;

  SELECT role
  INTO v_member_role
  FROM public.tcc_championship_members
  WHERE championship_id = v_weekend.championship_id
    AND user_id = v_user_id
  LIMIT 1;

  IF v_created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Only the championship host can run sessions');
  END IF;

  IF v_weekend.status <> 'quali_complete' THEN
    RETURN jsonb_build_object('success', false, 'message', format('Invalid status: %s. Expected quali_complete.', v_weekend.status));
  END IF;

  SELECT COALESCE(disable_rewards, false)
  INTO v_rewards_disabled
  FROM public.tcc_economy_config
  WHERE championship_id = v_weekend.championship_id;

  WITH latest_grid AS (
    SELECT qr.grid
    FROM public.tcc_quali_results qr
    WHERE qr.weekend_id = p_weekend_id
    ORDER BY qr.created_at DESC, qr.id DESC
    LIMIT 1
  ), grid_entries AS (
    SELECT
      (entry ->> 'position')::INTEGER AS grid_position,
      entry ->> 'driverId' AS driver_id
    FROM latest_grid,
    LATERAL jsonb_array_elements(grid) entry
  ), driver_inputs AS (
    SELECT
      ge.grid_position,
      d.id AS driver_id,
      d.name AS driver_name,
      t.id AS team_id,
      t.name AS team_name,
      t.owner_id,
      COALESCE((d.skills ->> 'pace')::DOUBLE PRECISION, 50) AS pace_skill,
      COALESCE((d.skills ->> 'consistency')::DOUBLE PRECISION, 50) AS consistency,
      COALESCE((d.skills ->> 'racecraft')::DOUBLE PRECISION, 50) AS racecraft,
      COALESCE((d.adaptation_by_track ->> v_weekend.track_id)::DOUBLE PRECISION, 0) AS track_adaptation,
      COALESCE(d.morale, 50) AS morale,
      random() AS rng_seed
    FROM grid_entries ge
    JOIN public.tcc_drivers d ON d.id = ge.driver_id::UUID
    JOIN public.tcc_teams t ON t.id = d.team_id
  ), scored AS (
    SELECT
      driver_id,
      driver_name,
      team_id,
      team_name,
      owner_id,
      grid_position,
      (
        pace_skill * 0.45 +
        consistency * 0.2 +
        racecraft * 0.2 +
        (track_adaptation * 100) * 0.1 +
        morale * 0.05 +
        ((21 - grid_position) * 1.5) +
        ((rng_seed * 16) - 8)
      ) AS race_score
    FROM driver_inputs
  ), ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY race_score DESC, driver_id ASC) AS position,
      driver_id,
      driver_name,
      team_id,
      team_name,
      owner_id,
      race_score
    FROM scored
  ), classified AS (
    SELECT
      position,
      driver_id,
      driver_name,
      team_id,
      team_name,
      owner_id,
      v_weekend.round_number * 10 + 48 AS laps,
      GREATEST(3600.0, 5400.0 - (race_score * 8) + (position * 2.5)) AS total_time,
      CASE WHEN position <= 18 THEN 'Finished' ELSE 'DNF' END AS status,
      CASE position
        WHEN 1 THEN 25 WHEN 2 THEN 18 WHEN 3 THEN 15 WHEN 4 THEN 12 WHEN 5 THEN 10
        WHEN 6 THEN 8 WHEN 7 THEN 6 WHEN 8 THEN 4 WHEN 9 THEN 2 WHEN 10 THEN 1
        ELSE 0
      END AS points,
      CASE
        WHEN v_rewards_disabled OR position > 10 OR position > 18 THEN 0
        ELSE CASE position
          WHEN 1 THEN 2500000
          WHEN 2 THEN 1800000
          WHEN 3 THEN 1500000
          WHEN 4 THEN 1200000
          WHEN 5 THEN 1000000
          WHEN 6 THEN 800000
          WHEN 7 THEN 600000
          WHEN 8 THEN 400000
          WHEN 9 THEN 250000
          WHEN 10 THEN 150000
          ELSE 0
        END
      END AS position_cash_reward,
      CASE
        WHEN v_rewards_disabled OR position > 18 THEN 0
        ELSE 100000
      END AS finish_cash_reward
    FROM ranked
  ), fastest_lap AS (
    SELECT driver_id
    FROM classified
    WHERE status <> 'DNF'
    ORDER BY total_time ASC, driver_id ASC
    LIMIT 1
  ), final_classification AS (
    SELECT
      c.position,
      c.driver_id,
      c.driver_name,
      c.team_id,
      c.team_name,
      c.owner_id,
      c.laps,
      c.total_time,
      c.status,
      c.points,
      (
        c.position_cash_reward +
        c.finish_cash_reward +
        CASE WHEN NOT v_rewards_disabled AND fl.driver_id = c.driver_id THEN 200000 ELSE 0 END
      )::BIGINT AS cash_reward
    FROM classified c
    LEFT JOIN fastest_lap fl ON fl.driver_id = c.driver_id
  ), classification_json AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'position', position,
        'driverId', driver_id,
        'driver_name', driver_name,
        'teamId', team_id,
        'team_name', team_name,
        'laps', laps,
        'totalTime', total_time,
        'status', status,
        'points', points,
        'cashReward', cash_reward
      )
      ORDER BY position
    ) AS payload
    FROM final_classification
  ), team_rewards AS (
    SELECT team_id, SUM(cash_reward)::BIGINT AS total_reward
    FROM final_classification
    GROUP BY team_id
  ), team_rewards_json AS (
    SELECT COALESCE(jsonb_object_agg(team_id, total_reward), '{}'::jsonb) AS payload
    FROM team_rewards
  ), points_json AS (
    SELECT COALESCE(jsonb_object_agg(team_id, team_points), '{}'::jsonb) AS payload
    FROM (
      SELECT team_id, SUM(points)::INTEGER AS team_points
      FROM final_classification
      GROUP BY team_id
    ) team_totals
  )
  SELECT
    COALESCE(classification_json.payload, '[]'::jsonb),
    COALESCE(team_rewards_json.payload, '{}'::jsonb),
    COALESCE(points_json.payload, '{}'::jsonb)
  INTO v_classification, v_team_cash_rewards, v_points_awarded
  FROM classification_json, team_rewards_json, points_json;

  IF jsonb_array_length(v_classification) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Qualifying results not found');
  END IF;

  INSERT INTO public.tcc_race_results (
    weekend_id,
    classification,
    lap_summary,
    incidents,
    points_awarded
  )
  VALUES (
    p_weekend_id,
    v_classification,
    '{}'::jsonb,
    '[]'::jsonb,
    v_points_awarded
  );

  UPDATE public.tcc_weekends
  SET status = 'race_complete'
  WHERE id = p_weekend_id;

  IF NOT v_rewards_disabled THEN
    FOR v_team_reward IN
      SELECT t.id AS team_id, t.owner_id, (value)::BIGINT AS cash_amount
      FROM public.tcc_teams t
      JOIN LATERAL jsonb_each_text(v_team_cash_rewards) rewards(key, value) ON rewards.key::UUID = t.id
      WHERE t.championship_id = v_weekend.championship_id
        AND t.owner_id IS NOT NULL
    LOOP
      IF v_team_reward.cash_amount > 0 THEN
        PERFORM public.tcc_reward_cash(
          v_weekend.championship_id,
          v_team_reward.owner_id,
          v_team_reward.cash_amount,
          'race_position',
          jsonb_build_object(
            'weekend_id', p_weekend_id,
            'round_number', v_weekend.round_number,
            'team_id', v_team_reward.team_id
          )
        );
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(*)
  INTO v_total_rounds
  FROM public.tcc_weekends
  WHERE championship_id = v_weekend.championship_id
    AND status <> 'cancelled';

  SELECT COUNT(*)
  INTO v_completed_rounds
  FROM public.tcc_weekends
  WHERE championship_id = v_weekend.championship_id
    AND status = 'race_complete';

  IF v_total_rounds >= 3 AND v_total_rounds = v_completed_rounds THEN
    IF NOT v_rewards_disabled THEN
      SELECT public.tcc_award_season_tokens(v_weekend.championship_id)
      INTO v_season_award;
    END IF;

    UPDATE public.tcc_championships
    SET status = 'completed'
    WHERE id = v_weekend.championship_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'classification', v_classification,
    'teamCashRewards', v_team_cash_rewards,
    'seasonAward', v_season_award,
    'rewardsDisabled', v_rewards_disabled
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_resequence_weekend_rounds(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_create_weekend(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_cancel_weekend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_set_weekend_end_of_season(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_run_race(UUID) TO authenticated;
