CREATE OR REPLACE FUNCTION public.tcc_create_weekend(
  p_championship_id UUID,
  p_track_id TEXT,
  p_host_local_datetime TIMESTAMPTZ,
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
  v_scheduled_race_at_utc TIMESTAMPTZ;
  v_previous_scheduled_race_at_utc TIMESTAMPTZ;
  v_scheduled_practice_at_utc TIMESTAMPTZ;
  v_scheduled_quali_at_utc TIMESTAMPTZ;
  v_round_number INTEGER;
  v_resolved_practice_speed INTEGER;
  v_resolved_quali_speed INTEGER;
  v_resolved_race_speed INTEGER;
  v_weekend public.tcc_weekends%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_track_id IS NULL OR btrim(p_track_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Track is required');
  END IF;

  IF p_host_local_datetime IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Scheduled race time is required');
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

  v_scheduled_race_at_utc := p_host_local_datetime;

  SELECT scheduled_race_at_utc
  INTO v_previous_scheduled_race_at_utc
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id
    AND status <> 'cancelled'
  ORDER BY scheduled_race_at_utc DESC
  LIMIT 1;

  IF v_previous_scheduled_race_at_utc IS NOT NULL THEN
    IF ABS(EXTRACT(EPOCH FROM (v_scheduled_race_at_utc - v_previous_scheduled_race_at_utc))) < 86400 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Race weekends must have at least 24-hour gap from other races');
    END IF;
  END IF;

  v_scheduled_practice_at_utc := v_scheduled_race_at_utc - INTERVAL '2 hours';
  v_scheduled_quali_at_utc := v_scheduled_race_at_utc - INTERVAL '1 hour';

  SELECT COALESCE(MAX(round_number), 0) + 1
  INTO v_round_number
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id;

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
    v_scheduled_practice_at_utc,
    v_scheduled_quali_at_utc,
    v_scheduled_race_at_utc,
    v_round_number
  )
  RETURNING * INTO v_weekend;

  RETURN to_jsonb(v_weekend) || jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_create_weekend(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
