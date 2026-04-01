CREATE OR REPLACE FUNCTION public.tcc_run_practice(
  p_weekend_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_driver RECORD;
  v_plan TEXT;
  v_adaptation_gain DOUBLE PRECISION;
  v_morale_delta DOUBLE PRECISION := 0.5;
  v_old_adaptation DOUBLE PRECISION;
  v_new_adaptation DOUBLE PRECISION;
  v_new_morale DOUBLE PRECISION;
  v_results JSONB := '[]'::jsonb;
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

  IF v_weekend.status <> 'scheduled' THEN
    RETURN jsonb_build_object('success', false, 'message', format('Invalid status: %s. Expected scheduled.', v_weekend.status));
  END IF;

  FOR v_driver IN
    SELECT
      d.id,
      d.morale,
      d.adaptation_by_track,
      p.preset,
      t.id AS team_id
    FROM public.tcc_teams t
    JOIN public.tcc_drivers d ON d.team_id = t.id
    LEFT JOIN public.tcc_plans_practice p
      ON p.weekend_id = p_weekend_id
     AND p.team_id = t.id
    WHERE t.championship_id = v_weekend.championship_id
  LOOP
    v_plan := COALESCE(v_driver.preset->>'plan', 'balanced');
    v_adaptation_gain := CASE
      WHEN v_plan = 'long_run' THEN 0.2
      WHEN v_plan = 'short_run' THEN 0.05
      ELSE 0.1
    END;
    v_adaptation_gain := v_adaptation_gain * (0.8 + random() * 0.4);

    v_old_adaptation := COALESCE((v_driver.adaptation_by_track ->> v_weekend.track_id)::DOUBLE PRECISION, 0);
    v_new_adaptation := LEAST(1.0, v_old_adaptation + v_adaptation_gain);
    v_new_morale := LEAST(100.0, COALESCE(v_driver.morale, 75) + v_morale_delta);

    UPDATE public.tcc_drivers
    SET adaptation_by_track = COALESCE(adaptation_by_track, '{}'::jsonb) || jsonb_build_object(v_weekend.track_id, v_new_adaptation),
        morale = v_new_morale
    WHERE id = v_driver.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'driverId', v_driver.id,
      'adaptationDelta', v_adaptation_gain,
      'moraleDelta', v_morale_delta
    ));
  END LOOP;

  UPDATE public.tcc_weekends
  SET status = 'practice_complete'
  WHERE id = p_weekend_id;

  RETURN jsonb_build_object('success', true, 'results', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_run_quali(
  p_weekend_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_track_distance DOUBLE PRECISION;
  v_base_lap_time DOUBLE PRECISION;
  v_driver RECORD;
  v_pace_skill DOUBLE PRECISION;
  v_car_perf DOUBLE PRECISION;
  v_adaptation_bonus DOUBLE PRECISION;
  v_morale_effect DOUBLE PRECISION;
  v_consistency DOUBLE PRECISION;
  v_variance DOUBLE PRECISION;
  v_rng DOUBLE PRECISION;
  v_final_lap_time DOUBLE PRECISION;
  v_grid JSONB;
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

  IF v_weekend.status NOT IN ('practice_complete', 'scheduled') THEN
    RETURN jsonb_build_object('success', false, 'message', format('Invalid status: %s.', v_weekend.status));
  END IF;

  v_base_lap_time := 90.0;

  WITH driver_inputs AS (
    SELECT
      t.id AS team_id,
      d.id AS driver_id,
      d.name AS driver_name,
      COALESCE((d.skills ->> 'pace')::DOUBLE PRECISION, 50) AS pace_skill,
      COALESCE((d.skills ->> 'consistency')::DOUBLE PRECISION, 50) AS consistency,
      COALESCE((d.adaptation_by_track ->> v_weekend.track_id)::DOUBLE PRECISION, 0) AS track_adaptation,
      COALESCE(d.morale, 50) AS morale,
      COALESCE((
        SELECT SUM(COALESCE((cp.perf_stats ->> 'pace_bonus')::DOUBLE PRECISION, 0))
        FROM public.tcc_car_parts cp
        WHERE cp.team_id = t.id
      ), 0) AS car_perf,
      random() AS rng_seed
    FROM public.tcc_teams t
    JOIN public.tcc_drivers d ON d.team_id = t.id
    WHERE t.championship_id = v_weekend.championship_id
  ), lap_times AS (
    SELECT
      team_id,
      driver_id,
      driver_name,
      v_base_lap_time
        + ((pace_skill - 50) * -0.02)
        - car_perf
        + (track_adaptation * -0.5)
        + ((morale - 50) * -0.005)
        + (((rng_seed * (((100 - consistency) * 0.01) * 2)) - ((100 - consistency) * 0.01))) AS lap_time
    FROM driver_inputs
  ), ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY lap_time ASC, driver_id ASC) AS position,
      team_id,
      driver_id,
      driver_name,
      lap_time,
      FIRST_VALUE(lap_time) OVER (ORDER BY lap_time ASC, driver_id ASC) AS pole_time
    FROM lap_times
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'position', position,
      'teamId', team_id,
      'driverId', driver_id,
      'driverName', driver_name,
      'lapTime', lap_time,
      'gapToPole', lap_time - pole_time
    )
    ORDER BY position
  )
  INTO v_grid
  FROM ranked;

  INSERT INTO public.tcc_quali_results (weekend_id, grid)
  VALUES (p_weekend_id, COALESCE(v_grid, '[]'::jsonb));

  UPDATE public.tcc_weekends
  SET status = 'quali_complete'
  WHERE id = p_weekend_id;

  RETURN jsonb_build_object('success', true, 'grid', COALESCE(v_grid, '[]'::jsonb));
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
  v_entry RECORD;
  v_cash_reward BIGINT;
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

  IF NOT v_rewards_disabled AND v_total_rounds > 0 AND v_total_rounds = v_completed_rounds THEN
    SELECT public.tcc_award_season_tokens(v_weekend.championship_id)
    INTO v_season_award;

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

GRANT EXECUTE ON FUNCTION public.tcc_run_practice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_run_quali(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_run_race(UUID) TO authenticated;
