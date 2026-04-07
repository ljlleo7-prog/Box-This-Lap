CREATE OR REPLACE FUNCTION public.tcc_save_weekend_plan_for_session(
  p_weekend_id UUID,
  p_team_id UUID,
  p_session_type TEXT,
  p_preset JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_team_owner UUID;
  v_weekend public.tcc_weekends%ROWTYPE;
  v_table_name TEXT;
  v_existing_preset JSONB := '{}'::jsonb;
  v_next_preset JSONB := COALESCE(p_preset, '{}'::jsonb);
  v_existing_parc_ferme JSONB := '{}'::jsonb;
  v_is_locked BOOLEAN := false;
  v_locked_mechanical JSONB := '{}'::jsonb;
  v_next_phase_setup JSONB := '{}'::jsonb;
  v_current_phase TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT owner_id INTO v_team_owner
  FROM public.tcc_teams
  WHERE id = p_team_id;

  IF v_team_owner IS NULL OR v_team_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  SELECT * INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = p_weekend_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  v_table_name := CASE p_session_type
    WHEN 'fp1' THEN 'tcc_plans_practice'
    WHEN 'fp2' THEN 'tcc_plans_practice'
    WHEN 'fp3' THEN 'tcc_plans_practice'
    WHEN 'q1' THEN 'tcc_plans_quali'
    WHEN 'q2' THEN 'tcc_plans_quali'
    WHEN 'q3' THEN 'tcc_plans_quali'
    WHEN 'race' THEN 'tcc_plans_race'
    ELSE NULL
  END;

  IF v_table_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unsupported session type');
  END IF;

  EXECUTE format('SELECT preset FROM public.%I WHERE weekend_id = $1 AND team_id = $2', v_table_name)
    INTO v_existing_preset
    USING p_weekend_id, p_team_id;

  v_existing_preset := COALESCE(v_existing_preset, '{}'::jsonb);
  v_next_preset := v_existing_preset || v_next_preset;
  v_existing_parc_ferme := COALESCE(v_existing_preset->'parcFerme', '{}'::jsonb);
  v_current_phase := COALESCE(v_weekend.status, 'scheduled');

  IF COALESCE((v_existing_parc_ferme->>'isActive')::BOOLEAN, false) OR p_session_type IN ('q1', 'q2', 'q3', 'race') THEN
    v_is_locked := true;
  END IF;

  IF NOT COALESCE((v_existing_parc_ferme->>'isActive')::BOOLEAN, false) AND p_session_type IN ('q1', 'q2', 'q3', 'race') THEN
    v_locked_mechanical := COALESCE(
      v_next_preset #> ARRAY['lastCommittedSetupByPhase', 'fp3'],
      v_next_preset #> ARRAY['setupByPhase', 'fp3'],
      '{}'::jsonb
    );

    v_next_preset := jsonb_set(
      v_next_preset,
      '{parcFerme}',
      jsonb_build_object(
        'isActive', true,
        'lockedFromPhase', 'q1',
        'activatedAt', NOW(),
        'referenceMechanicalSetupByDriver', v_locked_mechanical,
        'lockedRaceSetupByDriver', v_locked_mechanical
      ),
      true
    );

    v_existing_parc_ferme := v_next_preset->'parcFerme';
    v_is_locked := true;
  END IF;

  IF v_is_locked AND p_session_type IN ('q1', 'q2', 'q3', 'race') THEN
    v_locked_mechanical := COALESCE(
      v_existing_parc_ferme->'referenceMechanicalSetupByDriver',
      '{}'::jsonb
    );
    v_next_phase_setup := COALESCE(v_next_preset #> ARRAY['setupByPhase', p_session_type], '{}'::jsonb);

    IF v_locked_mechanical <> '{}'::jsonb THEN
      v_next_phase_setup := (
        SELECT jsonb_object_agg(
          key,
          jsonb_strip_nulls(
            COALESCE(v_next_phase_setup->key, '{}'::jsonb)
            || jsonb_build_object(
              'frontWingAngle', COALESCE(v_locked_mechanical->key->'frontWingAngle', (v_next_phase_setup->key)->'frontWingAngle'),
              'rearWingAngle', COALESCE(v_locked_mechanical->key->'rearWingAngle', (v_next_phase_setup->key)->'rearWingAngle'),
              'rideHeight', COALESCE(v_locked_mechanical->key->'rideHeight', (v_next_phase_setup->key)->'rideHeight'),
              'suspensionStiffness', COALESCE(v_locked_mechanical->key->'suspensionStiffness', (v_next_phase_setup->key)->'suspensionStiffness'),
              'toeOut', COALESCE(v_locked_mechanical->key->'toeOut', (v_next_phase_setup->key)->'toeOut'),
              'camber', COALESCE(v_locked_mechanical->key->'camber', (v_next_phase_setup->key)->'camber'),
              'gearboxSetting', COALESCE(v_locked_mechanical->key->'gearboxSetting', (v_next_phase_setup->key)->'gearboxSetting')
            )
          )
        )
        FROM jsonb_object_keys(v_next_phase_setup || v_locked_mechanical) AS key
      );

      v_next_preset := jsonb_set(v_next_preset, ARRAY['setupByPhase', p_session_type], COALESCE(v_next_phase_setup, '{}'::jsonb), true);

      IF p_session_type = 'race' THEN
        v_next_preset := jsonb_set(
          v_next_preset,
          '{parcFerme,lockedRaceSetupByDriver}',
          COALESCE(v_next_phase_setup, '{}'::jsonb),
          true
        );
      END IF;
    END IF;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (weekend_id, team_id, preset, submitted_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (weekend_id, team_id) DO UPDATE SET preset = EXCLUDED.preset, submitted_at = NOW() RETURNING preset',
    v_table_name
  )
    INTO v_next_preset
    USING p_weekend_id, p_team_id, v_next_preset;

  RETURN jsonb_build_object('success', true, 'preset', v_next_preset, 'session_type', p_session_type, 'weekend_status', v_current_phase);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_save_weekend_plan_for_session(UUID, UUID, TEXT, JSONB) TO authenticated;
