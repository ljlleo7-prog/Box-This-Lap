CREATE OR REPLACE FUNCTION public.tcc_get_race_live(
  p_weekend_id UUID,
  p_session_type TEXT DEFAULT 'race'
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_authority_user_id UUID;
  v_authority_team_id UUID;
  v_authority_role TEXT := 'participant';
  v_snapshot RECORD;
  v_snapshot_json JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF COALESCE(p_session_type, 'race') <> 'race' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unsupported session type');
  END IF;

  SELECT *
  INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = p_weekend_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  IF v_weekend.status NOT IN ('quali_complete', 'race_complete') THEN
    RETURN jsonb_build_object('success', false, 'message', format('Weekend is not ready for live race sync: %s', v_weekend.status));
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

  IF v_member_role IS NULL AND v_created_by <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Not a championship member');
  END IF;

  SELECT presence.user_id, presence.team_id, 'host'
  INTO v_authority_user_id, v_authority_team_id, v_authority_role
  FROM public.tcc_live_presence AS presence
  WHERE presence.weekend_id = p_weekend_id
    AND presence.session_type = 'race'
    AND presence.is_running = true
    AND presence.last_seen_at >= v_now - INTERVAL '6 seconds'
    AND v_created_by IS NOT NULL
    AND presence.user_id = v_created_by
  LIMIT 1;

  IF v_authority_user_id IS NULL THEN
    SELECT presence.user_id, presence.team_id, 'participant'
    INTO v_authority_user_id, v_authority_team_id, v_authority_role
    FROM public.tcc_live_presence AS presence
    WHERE presence.weekend_id = p_weekend_id
      AND presence.session_type = 'race'
      AND presence.is_running = true
      AND presence.last_seen_at >= v_now - INTERVAL '6 seconds'
    ORDER BY COALESCE(presence.streak_started_at, presence.last_seen_at) ASC, presence.user_id ASC
    LIMIT 1;
  END IF;

  SELECT
    snapshot.weekend_id,
    snapshot.session_type,
    snapshot.authority_user_id,
    snapshot.authority_role,
    snapshot.revision,
    snapshot.sim_time,
    snapshot.race_state,
    snapshot.source_updated_at,
    snapshot.updated_at
  INTO v_snapshot
  FROM public.tcc_live_snapshot_current AS snapshot
  WHERE snapshot.weekend_id = p_weekend_id
    AND snapshot.session_type = 'race';

  IF FOUND THEN
    v_snapshot_json := jsonb_build_object(
      'weekend_id', v_snapshot.weekend_id,
      'session_type', v_snapshot.session_type,
      'authority_user_id', v_snapshot.authority_user_id,
      'authority_role', v_snapshot.authority_role,
      'revision', v_snapshot.revision,
      'sim_time', v_snapshot.sim_time,
      'race_state', v_snapshot.race_state,
      'source_updated_at', v_snapshot.source_updated_at,
      'updated_at', v_snapshot.updated_at,
      'isFresh', v_snapshot.updated_at >= v_now - INTERVAL '6 seconds'
    );
  ELSE
    v_snapshot_json := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'weekendId', p_weekend_id,
    'sessionType', 'race',
    'authorityUserId', v_authority_user_id,
    'authorityRole', COALESCE(v_authority_role, 'participant'),
    'authorityTeamId', v_authority_team_id,
    'isRequesterAuthority', v_authority_user_id = v_user_id,
    'snapshot', v_snapshot_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_sync_race_live(
  p_weekend_id UUID,
  p_team_id UUID DEFAULT NULL,
  p_session_type TEXT DEFAULT 'race',
  p_is_running BOOLEAN DEFAULT false,
  p_sim_time DOUBLE PRECISION DEFAULT NULL,
  p_race_state JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend public.tcc_weekends%ROWTYPE;
  v_created_by UUID;
  v_member_role TEXT;
  v_normalized_team_id UUID := NULL;
  v_team_owner_id UUID;
  v_team_championship_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_previous_presence RECORD;
  v_streak_started_at TIMESTAMPTZ;
  v_authority_user_id UUID;
  v_authority_team_id UUID;
  v_authority_role TEXT := 'participant';
  v_current_snapshot RECORD;
  v_snapshot_json JSONB;
  v_next_revision BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF COALESCE(p_session_type, 'race') <> 'race' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unsupported session type');
  END IF;

  SELECT *
  INTO v_weekend
  FROM public.tcc_weekends
  WHERE id = p_weekend_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  IF v_weekend.status NOT IN ('quali_complete', 'race_complete') THEN
    RETURN jsonb_build_object('success', false, 'message', format('Weekend is not ready for live race sync: %s', v_weekend.status));
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

  IF v_member_role IS NULL AND v_created_by <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Not a championship member');
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT owner_id, championship_id
    INTO v_team_owner_id, v_team_championship_id
    FROM public.tcc_teams
    WHERE id = p_team_id;

    IF v_team_championship_id IS NULL OR v_team_championship_id <> v_weekend.championship_id THEN
      RETURN jsonb_build_object('success', false, 'message', 'Invalid team for this championship');
    END IF;

    IF v_team_owner_id <> v_user_id AND v_created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Team does not belong to the current user');
    END IF;

    v_normalized_team_id := p_team_id;
  END IF;

  SELECT
    presence.weekend_id,
    presence.session_type,
    presence.user_id,
    presence.team_id,
    presence.is_running,
    presence.last_seen_at,
    presence.streak_started_at,
    presence.updated_at
  INTO v_previous_presence
  FROM public.tcc_live_presence AS presence
  WHERE presence.weekend_id = p_weekend_id
    AND presence.session_type = 'race'
    AND presence.user_id = v_user_id;

  IF NOT COALESCE(p_is_running, false) THEN
    v_streak_started_at := NULL;
  ELSIF v_previous_presence.user_id IS NOT NULL
    AND v_previous_presence.is_running = true
    AND v_previous_presence.last_seen_at >= v_now - INTERVAL '6 seconds' THEN
    v_streak_started_at := COALESCE(v_previous_presence.streak_started_at, v_previous_presence.last_seen_at, v_now);
  ELSE
    v_streak_started_at := v_now;
  END IF;

  INSERT INTO public.tcc_live_presence (
    weekend_id,
    session_type,
    user_id,
    team_id,
    is_running,
    last_seen_at,
    streak_started_at,
    updated_at
  )
  VALUES (
    p_weekend_id,
    'race',
    v_user_id,
    v_normalized_team_id,
    COALESCE(p_is_running, false),
    v_now,
    v_streak_started_at,
    v_now
  )
  ON CONFLICT (weekend_id, session_type, user_id)
  DO UPDATE SET
    team_id = EXCLUDED.team_id,
    is_running = EXCLUDED.is_running,
    last_seen_at = EXCLUDED.last_seen_at,
    streak_started_at = EXCLUDED.streak_started_at,
    updated_at = EXCLUDED.updated_at;

  SELECT presence.user_id, presence.team_id, 'host'
  INTO v_authority_user_id, v_authority_team_id, v_authority_role
  FROM public.tcc_live_presence AS presence
  WHERE presence.weekend_id = p_weekend_id
    AND presence.session_type = 'race'
    AND presence.is_running = true
    AND presence.last_seen_at >= v_now - INTERVAL '6 seconds'
    AND v_created_by IS NOT NULL
    AND presence.user_id = v_created_by
  LIMIT 1;

  IF v_authority_user_id IS NULL THEN
    SELECT presence.user_id, presence.team_id, 'participant'
    INTO v_authority_user_id, v_authority_team_id, v_authority_role
    FROM public.tcc_live_presence AS presence
    WHERE presence.weekend_id = p_weekend_id
      AND presence.session_type = 'race'
      AND presence.is_running = true
      AND presence.last_seen_at >= v_now - INTERVAL '6 seconds'
    ORDER BY COALESCE(presence.streak_started_at, presence.last_seen_at) ASC, presence.user_id ASC
    LIMIT 1;
  END IF;

  SELECT
    snapshot.weekend_id,
    snapshot.session_type,
    snapshot.authority_user_id,
    snapshot.authority_role,
    snapshot.revision,
    snapshot.sim_time,
    snapshot.race_state,
    snapshot.source_updated_at,
    snapshot.updated_at
  INTO v_current_snapshot
  FROM public.tcc_live_snapshot_current AS snapshot
  WHERE snapshot.weekend_id = p_weekend_id
    AND snapshot.session_type = 'race'
  FOR UPDATE;

  IF v_authority_user_id = v_user_id
    AND COALESCE(p_is_running, false)
    AND p_race_state IS NOT NULL
    AND p_sim_time IS NOT NULL THEN
    v_next_revision := COALESCE(v_current_snapshot.revision, 0) + 1;

    INSERT INTO public.tcc_live_snapshot_current (
      weekend_id,
      session_type,
      authority_user_id,
      authority_role,
      revision,
      sim_time,
      race_state,
      source_updated_at,
      updated_at
    )
    VALUES (
      p_weekend_id,
      'race',
      v_user_id,
      COALESCE(v_authority_role, 'participant'),
      v_next_revision,
      p_sim_time,
      p_race_state,
      v_now,
      v_now
    )
    ON CONFLICT (weekend_id, session_type)
    DO UPDATE SET
      authority_user_id = EXCLUDED.authority_user_id,
      authority_role = EXCLUDED.authority_role,
      revision = EXCLUDED.revision,
      sim_time = EXCLUDED.sim_time,
      race_state = EXCLUDED.race_state,
      source_updated_at = EXCLUDED.source_updated_at,
      updated_at = EXCLUDED.updated_at;

    SELECT jsonb_build_object(
      'weekend_id', snapshot.weekend_id,
      'session_type', snapshot.session_type,
      'authority_user_id', snapshot.authority_user_id,
      'authority_role', snapshot.authority_role,
      'revision', snapshot.revision,
      'sim_time', snapshot.sim_time,
      'race_state', snapshot.race_state,
      'source_updated_at', snapshot.source_updated_at,
      'updated_at', snapshot.updated_at,
      'isFresh', snapshot.updated_at >= v_now - INTERVAL '6 seconds'
    )
    INTO v_snapshot_json
    FROM public.tcc_live_snapshot_current AS snapshot
    WHERE snapshot.weekend_id = p_weekend_id
      AND snapshot.session_type = 'race';
  ELSIF v_current_snapshot.weekend_id IS NOT NULL THEN
    v_snapshot_json := jsonb_build_object(
      'weekend_id', v_current_snapshot.weekend_id,
      'session_type', v_current_snapshot.session_type,
      'authority_user_id', v_current_snapshot.authority_user_id,
      'authority_role', v_current_snapshot.authority_role,
      'revision', v_current_snapshot.revision,
      'sim_time', v_current_snapshot.sim_time,
      'race_state', v_current_snapshot.race_state,
      'source_updated_at', v_current_snapshot.source_updated_at,
      'updated_at', v_current_snapshot.updated_at,
      'isFresh', v_current_snapshot.updated_at >= v_now - INTERVAL '6 seconds'
    );
  ELSE
    v_snapshot_json := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'weekendId', p_weekend_id,
    'sessionType', 'race',
    'authorityUserId', v_authority_user_id,
    'authorityRole', COALESCE(v_authority_role, 'participant'),
    'authorityTeamId', v_authority_team_id,
    'isRequesterAuthority', v_authority_user_id = v_user_id,
    'snapshot', v_snapshot_json
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_get_race_live(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_sync_race_live(UUID, UUID, TEXT, BOOLEAN, DOUBLE PRECISION, JSONB) TO authenticated;
