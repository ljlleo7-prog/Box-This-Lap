ALTER TABLE public.tcc_weekends
ADD COLUMN IF NOT EXISTS current_phase TEXT NOT NULL DEFAULT 'pre_weekend'
  CHECK (current_phase IN ('pre_weekend', 'fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race', 'post_race')),
ADD COLUMN IF NOT EXISTS completed_sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS session_summaries JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.tcc_weekends
SET current_phase = CASE
      WHEN status = 'race_complete' THEN 'post_race'
      WHEN status = 'quali_complete' THEN 'race'
      WHEN status = 'practice_complete' THEN 'q1'
      ELSE 'pre_weekend'
    END,
    completed_sessions = CASE
      WHEN status = 'race_complete' THEN '["fp1","fp2","fp3","q1","q2","q3","race"]'::jsonb
      WHEN status = 'quali_complete' THEN '["fp1","fp2","fp3","q1","q2","q3"]'::jsonb
      WHEN status = 'practice_complete' THEN '["fp1","fp2","fp3"]'::jsonb
      ELSE '[]'::jsonb
    END
WHERE current_phase IS NULL
   OR completed_sessions IS NULL
   OR session_summaries IS NULL
   OR current_phase = 'pre_weekend';

CREATE OR REPLACE FUNCTION public.tcc_complete_interactive_session(
  p_weekend_id UUID,
  p_team_id UUID,
  p_session_type TEXT,
  p_summary JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_team_owner UUID;
  v_team_championship_id UUID;
  v_completed_sessions JSONB;
  v_session_summaries JSONB;
  v_next_phase TEXT;
  v_next_status TEXT;
  v_summary JSONB := COALESCE(p_summary, '{}'::jsonb);
  v_grid JSONB := '[]'::jsonb;
  v_pole_time DOUBLE PRECISION;
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

  IF p_session_type NOT IN ('fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unsupported session type');
  END IF;

  IF COALESCE((v_summary->>'completed')::BOOLEAN, false) = false THEN
    RETURN jsonb_build_object('success', false, 'message', 'Session summary must be completed');
  END IF;

  SELECT *
  INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = p_weekend_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  IF v_weekend.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cancelled weekends cannot run sessions');
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

  SELECT owner_id, championship_id
  INTO v_team_owner, v_team_championship_id
  FROM public.tcc_teams
  WHERE id = p_team_id;

  IF v_team_championship_id IS NULL OR v_team_championship_id <> v_weekend.championship_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid team for this championship');
  END IF;

  IF v_team_owner <> v_user_id AND v_created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  IF COALESCE(v_weekend.current_phase, 'pre_weekend') <> p_session_type THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Invalid current phase: %s. Expected %s.', COALESCE(v_weekend.current_phase, 'pre_weekend'), p_session_type)
    );
  END IF;

  IF p_session_type = 'race' AND v_weekend.status = 'race_complete' THEN
    RETURN jsonb_build_object(
      'success', true,
      'weekend', row_to_json(v_weekend),
      'seasonAward', NULL,
      'teamCashRewards', '{}'::jsonb
    );
  END IF;

  v_completed_sessions := COALESCE(v_weekend.completed_sessions, '[]'::jsonb);
  IF NOT (v_completed_sessions @> jsonb_build_array(p_session_type)) THEN
    v_completed_sessions := v_completed_sessions || jsonb_build_array(p_session_type);
  END IF;

  v_session_summaries := COALESCE(v_weekend.session_summaries, '{}'::jsonb) || jsonb_build_object(p_session_type, v_summary);

  v_next_phase := CASE p_session_type
    WHEN 'fp1' THEN 'fp2'
    WHEN 'fp2' THEN 'fp3'
    WHEN 'fp3' THEN 'q1'
    WHEN 'q1' THEN 'q2'
    WHEN 'q2' THEN 'q3'
    WHEN 'q3' THEN 'race'
    WHEN 'race' THEN 'post_race'
    ELSE COALESCE(v_weekend.current_phase, 'pre_weekend')
  END;

  v_next_status := CASE p_session_type
    WHEN 'fp3' THEN 'practice_complete'
    WHEN 'q3' THEN 'quali_complete'
    WHEN 'race' THEN 'race_complete'
    ELSE COALESCE(v_weekend.status, 'scheduled')
  END;

  IF p_session_type = 'q3' THEN
    SELECT MIN((entry ->> 'bestLapTime')::DOUBLE PRECISION)
    INTO v_pole_time
    FROM jsonb_array_elements(COALESCE(v_summary->'classification', '[]'::jsonb)) entry
    WHERE jsonb_typeof(entry) = 'object'
      AND entry ? 'bestLapTime'
      AND (entry ->> 'bestLapTime') IS NOT NULL;

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'position', ROW_NUMBER() OVER (ORDER BY (entry ->> 'position')::INTEGER ASC, entry ->> 'driverId' ASC),
        'teamId', t.id,
        'driverId', d.id,
        'driverName', d.name,
        'lapTime', CASE
          WHEN entry ? 'bestLapTime' AND (entry ->> 'bestLapTime') IS NOT NULL THEN (entry ->> 'bestLapTime')::DOUBLE PRECISION
          ELSE NULL
        END,
        'gapToPole', CASE
          WHEN v_pole_time IS NULL OR NOT (entry ? 'bestLapTime') OR (entry ->> 'bestLapTime') IS NULL THEN NULL
          ELSE ((entry ->> 'bestLapTime')::DOUBLE PRECISION - v_pole_time)
        END
      )
      ORDER BY (entry ->> 'position')::INTEGER ASC, entry ->> 'driverId' ASC
    ), '[]'::jsonb)
    INTO v_grid
    FROM jsonb_array_elements(COALESCE(v_summary->'classification', '[]'::jsonb)) entry
    JOIN public.tcc_drivers d ON d.id = (entry ->> 'driverId')::UUID
    JOIN public.tcc_teams t ON t.id = d.team_id;

    DELETE FROM public.tcc_quali_results
    WHERE weekend_id = p_weekend_id;

    INSERT INTO public.tcc_quali_results (weekend_id, grid)
    VALUES (p_weekend_id, COALESCE(v_grid, '[]'::jsonb));
  END IF;

  IF p_session_type = 'race' THEN
    SELECT COALESCE(disable_rewards, false)
    INTO v_rewards_disabled
    FROM public.tcc_economy_config
    WHERE championship_id = v_weekend.championship_id;

    WITH final_classification AS (
      SELECT
        ROW_NUMBER() OVER (ORDER BY (entry ->> 'position')::INTEGER ASC, entry ->> 'driverId' ASC) AS position,
        d.id AS driver_id,
        d.name AS driver_name,
        t.id AS team_id,
        t.name AS team_name,
        t.owner_id,
        COALESCE((entry ->> 'lapsCompleted')::INTEGER, v_weekend.round_number * 10 + 48) AS laps,
        COALESCE((entry ->> 'timeOrGap')::DOUBLE PRECISION, 0) AS total_time,
        'Finished'::TEXT AS status,
        CASE ROW_NUMBER() OVER (ORDER BY (entry ->> 'position')::INTEGER ASC, entry ->> 'driverId' ASC)
          WHEN 1 THEN 25 WHEN 2 THEN 18 WHEN 3 THEN 15 WHEN 4 THEN 12 WHEN 5 THEN 10
          WHEN 6 THEN 8 WHEN 7 THEN 6 WHEN 8 THEN 4 WHEN 9 THEN 2 WHEN 10 THEN 1
          ELSE 0
        END AS points,
        CASE
          WHEN v_rewards_disabled THEN 0
          ELSE CASE ROW_NUMBER() OVER (ORDER BY (entry ->> 'position')::INTEGER ASC, entry ->> 'driverId' ASC)
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
          WHEN v_rewards_disabled THEN 0
          ELSE 100000
        END AS finish_cash_reward,
        CASE
          WHEN entry ? 'bestLapTime' AND (entry ->> 'bestLapTime') IS NOT NULL THEN (entry ->> 'bestLapTime')::DOUBLE PRECISION
          ELSE NULL
        END AS best_lap_time
      FROM jsonb_array_elements(COALESCE(v_summary->'classification', '[]'::jsonb)) entry
      JOIN public.tcc_drivers d ON d.id = (entry ->> 'driverId')::UUID
      JOIN public.tcc_teams t ON t.id = d.team_id
    ), fastest_lap AS (
      SELECT driver_id
      FROM final_classification
      WHERE best_lap_time IS NOT NULL
      ORDER BY best_lap_time ASC, driver_id ASC
      LIMIT 1
    ), enriched AS (
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
      FROM final_classification c
      LEFT JOIN fastest_lap fl ON fl.driver_id = c.driver_id
    ), classification_json AS (
      SELECT COALESCE(jsonb_agg(
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
      ), '[]'::jsonb) AS payload
      FROM enriched
    ), team_rewards_json AS (
      SELECT COALESCE(jsonb_object_agg(team_id, total_reward), '{}'::jsonb) AS payload
      FROM (
        SELECT team_id, SUM(cash_reward)::BIGINT AS total_reward
        FROM enriched
        GROUP BY team_id
      ) rewards
    ), points_json AS (
      SELECT COALESCE(jsonb_object_agg(team_id, team_points), '{}'::jsonb) AS payload
      FROM (
        SELECT team_id, SUM(points)::INTEGER AS team_points
        FROM enriched
        GROUP BY team_id
      ) totals
    )
    SELECT classification_json.payload, team_rewards_json.payload, points_json.payload
    INTO v_classification, v_team_cash_rewards, v_points_awarded
    FROM classification_json, team_rewards_json, points_json;

    DELETE FROM public.tcc_race_results
    WHERE weekend_id = p_weekend_id;

    INSERT INTO public.tcc_race_results (
      weekend_id,
      classification,
      lap_summary,
      incidents,
      points_awarded
    )
    VALUES (
      p_weekend_id,
      COALESCE(v_classification, '[]'::jsonb),
      '{}'::jsonb,
      COALESCE(v_summary->'incidents', '[]'::jsonb),
      COALESCE(v_points_awarded, '{}'::jsonb)
    );

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
      AND id <> p_weekend_id
      AND status = 'race_complete';

    v_completed_rounds := v_completed_rounds + 1;

    IF v_total_rounds >= 3 AND v_total_rounds = v_completed_rounds THEN
      IF NOT v_rewards_disabled THEN
        SELECT public.tcc_award_season_tokens(v_weekend.championship_id)
        INTO v_season_award;
      END IF;

      UPDATE public.tcc_championships
      SET status = 'completed'
      WHERE id = v_weekend.championship_id;
    END IF;
  END IF;

  UPDATE public.tcc_weekends
  SET status = v_next_status,
      current_phase = v_next_phase,
      completed_sessions = v_completed_sessions,
      session_summaries = v_session_summaries
  WHERE id = p_weekend_id
  RETURNING * INTO v_weekend;

  RETURN jsonb_build_object(
    'success', true,
    'weekend', row_to_json(v_weekend),
    'seasonAward', v_season_award,
    'teamCashRewards', v_team_cash_rewards
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_complete_interactive_session(UUID, UUID, TEXT, JSONB) TO authenticated;
