ALTER TABLE public.tcc_championships
  ADD COLUMN IF NOT EXISTS hero_background_url TEXT;

ALTER TABLE public.tcc_weekends
  ADD COLUMN IF NOT EXISTS hero_background_url TEXT;

CREATE OR REPLACE FUNCTION public.tcc_set_championship_background_image(
  p_championship_id UUID,
  p_background_image_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_championship RECORD;
  v_member_role TEXT;
  v_clean_url TEXT := NULLIF(btrim(COALESCE(p_background_image_url, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF v_clean_url IS NOT NULL AND v_clean_url !~* '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Background image must be an absolute http(s) URL');
  END IF;

  SELECT *
  INTO v_championship
  FROM public.tcc_championships
  WHERE id = p_championship_id;

  IF v_championship.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Championship not found');
  END IF;

  SELECT role
  INTO v_member_role
  FROM public.tcc_championship_members
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
  LIMIT 1;

  IF v_championship.created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  UPDATE public.tcc_championships
  SET hero_background_url = v_clean_url
  WHERE id = p_championship_id;

  RETURN jsonb_build_object('success', true, 'championship_id', p_championship_id, 'hero_background_url', v_clean_url);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_set_weekend_background_image(
  p_weekend_id UUID,
  p_background_image_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend RECORD;
  v_member_role TEXT;
  v_clean_url TEXT := NULLIF(btrim(COALESCE(p_background_image_url, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF v_clean_url IS NOT NULL AND v_clean_url !~* '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Background image must be an absolute http(s) URL');
  END IF;

  SELECT w.*, c.created_by
  INTO v_weekend
  FROM public.tcc_weekends w
  JOIN public.tcc_championships c ON c.id = w.championship_id
  WHERE w.id = p_weekend_id;

  IF v_weekend.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Weekend not found');
  END IF;

  SELECT role
  INTO v_member_role
  FROM public.tcc_championship_members
  WHERE championship_id = v_weekend.championship_id
    AND user_id = v_user_id
  LIMIT 1;

  IF v_weekend.created_by <> v_user_id AND COALESCE(v_member_role, '') NOT IN ('host', 'developer') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  UPDATE public.tcc_weekends
  SET hero_background_url = v_clean_url
  WHERE id = p_weekend_id;

  RETURN jsonb_build_object('success', true, 'weekend_id', p_weekend_id, 'hero_background_url', v_clean_url);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_set_championship_background_image(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_set_weekend_background_image(UUID, TEXT) TO authenticated;
