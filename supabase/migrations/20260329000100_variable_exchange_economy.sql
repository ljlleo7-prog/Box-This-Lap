ALTER TABLE public.wallets
ADD COLUMN IF NOT EXISTS cash_balance BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.tcc_economy_config (
  championship_id UUID PRIMARY KEY REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  base_token_cash_rate NUMERIC NOT NULL DEFAULT 10000,
  seasonal_converted_cash_cap BIGINT NOT NULL DEFAULT 135000000,
  weekly_investment_cap_tkn NUMERIC NOT NULL DEFAULT 1200,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tcc_token_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  cash_per_token NUMERIC NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tcc_token_price_history_lookup
ON public.tcc_token_price_history(championship_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS public.tcc_economy_weekly_investments (
  championship_id UUID NOT NULL REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  token_spent NUMERIC NOT NULL DEFAULT 0,
  cash_received BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (championship_id, user_id, week_number)
);

CREATE TABLE IF NOT EXISTS public.tcc_economy_season_usage (
  championship_id UUID NOT NULL REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
  converted_cash_total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (championship_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tcc_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
  amount_cash BIGINT NOT NULL DEFAULT 0,
  amount_tkn NUMERIC NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('convert', 'spend', 'race_reward', 'achievement_reward', 'season_award')),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tcc_season_token_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  token_amount NUMERIC NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (championship_id, user_id)
);

ALTER TABLE public.tcc_economy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_token_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_economy_weekly_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_economy_season_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_season_token_awards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_economy_config' AND policyname = 'tcc_economy_config_select'
  ) THEN
    CREATE POLICY "tcc_economy_config_select" ON public.tcc_economy_config FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_token_price_history' AND policyname = 'tcc_token_price_history_select'
  ) THEN
    CREATE POLICY "tcc_token_price_history_select" ON public.tcc_token_price_history FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_economy_weekly_investments' AND policyname = 'tcc_weekly_investments_select'
  ) THEN
    CREATE POLICY "tcc_weekly_investments_select" ON public.tcc_economy_weekly_investments FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_economy_season_usage' AND policyname = 'tcc_season_usage_select'
  ) THEN
    CREATE POLICY "tcc_season_usage_select" ON public.tcc_economy_season_usage FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_cash_ledger' AND policyname = 'tcc_cash_ledger_select'
  ) THEN
    CREATE POLICY "tcc_cash_ledger_select" ON public.tcc_cash_ledger FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_season_token_awards' AND policyname = 'tcc_season_token_awards_select'
  ) THEN
    CREATE POLICY "tcc_season_token_awards_select" ON public.tcc_season_token_awards FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tcc_wallet_uid(p_wallet public.wallets)
RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(to_jsonb(p_wallet) ->> 'user_uid', '')::uuid,
    NULLIF(to_jsonb(p_wallet) ->> 'user_id', '')::uuid,
    NULLIF(to_jsonb(p_wallet) ->> 'id', '')::uuid
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.tcc_get_current_token_price(p_championship_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  SELECT cash_per_token INTO v_price
  FROM public.tcc_token_price_history
  WHERE championship_id = p_championship_id
    AND effective_at <= NOW()
  ORDER BY effective_at DESC
  LIMIT 1;

  IF v_price IS NULL THEN
    SELECT base_token_cash_rate INTO v_price
    FROM public.tcc_economy_config
    WHERE championship_id = p_championship_id;
  END IF;

  IF v_price IS NULL THEN
    v_price := 10000;
  END IF;

  RETURN v_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_get_championship_week(p_championship_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_week INTEGER;
BEGIN
  SELECT COALESCE(MAX(round_number), 1) INTO v_week
  FROM public.tcc_weekends
  WHERE championship_id = p_championship_id
    AND status <> 'cancelled';
  RETURN GREATEST(1, COALESCE(v_week, 1));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_get_wallet_economy(p_championship_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_token NUMERIC := 0;
  v_cash BIGINT := 0;
  v_rate NUMERIC := 10000;
  v_week INTEGER;
  v_weekly_cap NUMERIC := 1200;
  v_weekly_used NUMERIC := 0;
  v_season_cap BIGINT := 135000000;
  v_season_used BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT COALESCE(w.token_balance, 0), COALESCE(w.cash_balance, 0)
  INTO v_token, v_cash
  FROM public.wallets w
  WHERE public.tcc_wallet_uid(w) = v_user_id
  LIMIT 1;

  SELECT COALESCE(weekly_investment_cap_tkn, 1200), COALESCE(seasonal_converted_cash_cap, 135000000)
  INTO v_weekly_cap, v_season_cap
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  v_rate := public.tcc_get_current_token_price(p_championship_id);
  v_week := public.tcc_get_championship_week(p_championship_id);

  SELECT COALESCE(token_spent, 0)
  INTO v_weekly_used
  FROM public.tcc_economy_weekly_investments
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
    AND week_number = v_week;

  SELECT COALESCE(converted_cash_total, 0)
  INTO v_season_used
  FROM public.tcc_economy_season_usage
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'wallet', jsonb_build_object(
      'token_balance', COALESCE(v_token, 0),
      'cash_balance', COALESCE(v_cash, 0)
    ),
    'pricing', jsonb_build_object(
      'cash_per_token', v_rate
    ),
    'caps', jsonb_build_object(
      'current_week', v_week,
      'weekly_investment_cap_tkn', v_weekly_cap,
      'weekly_investment_used_tkn', v_weekly_used,
      'weekly_investment_remaining_tkn', GREATEST(0, v_weekly_cap - v_weekly_used),
      'seasonal_converted_cash_cap', v_season_cap,
      'seasonal_converted_cash_used', v_season_used,
      'seasonal_converted_cash_remaining', GREATEST(0, v_season_cap - v_season_used)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_upsert_token_price(p_championship_id UUID, p_cash_per_token NUMERIC)
RETURNS JSONB AS $$
BEGIN
  IF p_cash_per_token <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid price');
  END IF;

  INSERT INTO public.tcc_token_price_history(championship_id, cash_per_token, effective_at)
  VALUES (p_championship_id, p_cash_per_token, NOW());

  RETURN jsonb_build_object('success', true, 'cash_per_token', p_cash_per_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_convert_token_to_cash(
  p_championship_id UUID,
  p_token_amount NUMERIC,
  p_week_number INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_token_balance NUMERIC;
  v_cash_balance BIGINT;
  v_cash_per_token NUMERIC;
  v_cash_gain BIGINT;
  v_week INTEGER;
  v_weekly_cap NUMERIC := 1200;
  v_weekly_used NUMERIC := 0;
  v_season_cap BIGINT := 135000000;
  v_season_used BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_token_amount IS NULL OR p_token_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token amount must be greater than zero');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tcc_championship_members
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a championship member');
  END IF;

  SELECT COALESCE(w.token_balance, 0), COALESCE(w.cash_balance, 0)
  INTO v_token_balance, v_cash_balance
  FROM public.wallets w
  WHERE public.tcc_wallet_uid(w) = v_user_id
  LIMIT 1
  FOR UPDATE;

  IF v_token_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
  END IF;

  IF v_token_balance < p_token_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient token balance');
  END IF;

  SELECT COALESCE(weekly_investment_cap_tkn, 1200), COALESCE(seasonal_converted_cash_cap, 135000000)
  INTO v_weekly_cap, v_season_cap
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  v_week := COALESCE(p_week_number, public.tcc_get_championship_week(p_championship_id));

  SELECT COALESCE(token_spent, 0)
  INTO v_weekly_used
  FROM public.tcc_economy_weekly_investments
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
    AND week_number = v_week;

  IF v_weekly_used + p_token_amount > v_weekly_cap THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Weekly investment cap exceeded',
      'weekly_remaining_tkn', GREATEST(0, v_weekly_cap - v_weekly_used)
    );
  END IF;

  SELECT COALESCE(converted_cash_total, 0)
  INTO v_season_used
  FROM public.tcc_economy_season_usage
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id;

  v_cash_per_token := public.tcc_get_current_token_price(p_championship_id);
  v_cash_gain := FLOOR(p_token_amount * v_cash_per_token)::BIGINT;

  IF v_season_used + v_cash_gain > v_season_cap THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Season converted cost cap exceeded',
      'season_remaining_cash', GREATEST(0, v_season_cap - v_season_used)
    );
  END IF;

  UPDATE public.wallets w
  SET token_balance = COALESCE(w.token_balance, 0) - p_token_amount,
      cash_balance = COALESCE(w.cash_balance, 0) + v_cash_gain,
      updated_at = NOW()
  WHERE public.tcc_wallet_uid(w) = v_user_id;

  INSERT INTO public.tcc_economy_weekly_investments(championship_id, user_id, week_number, token_spent, cash_received, updated_at)
  VALUES (p_championship_id, v_user_id, v_week, p_token_amount, v_cash_gain, NOW())
  ON CONFLICT (championship_id, user_id, week_number)
  DO UPDATE SET
    token_spent = public.tcc_economy_weekly_investments.token_spent + EXCLUDED.token_spent,
    cash_received = public.tcc_economy_weekly_investments.cash_received + EXCLUDED.cash_received,
    updated_at = NOW();

  INSERT INTO public.tcc_economy_season_usage(championship_id, user_id, converted_cash_total, updated_at)
  VALUES (p_championship_id, v_user_id, v_cash_gain, NOW())
  ON CONFLICT (championship_id, user_id)
  DO UPDATE SET
    converted_cash_total = public.tcc_economy_season_usage.converted_cash_total + EXCLUDED.converted_cash_total,
    updated_at = NOW();

  INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
  VALUES (
    p_championship_id,
    v_user_id,
    v_cash_gain,
    -p_token_amount,
    'convert',
    'Token converted to championship cash',
    jsonb_build_object('week_number', v_week, 'cash_per_token', v_cash_per_token)
  );

  RETURN jsonb_build_object(
    'success', true,
    'cash_received', v_cash_gain,
    'cash_per_token', v_cash_per_token,
    'token_spent', p_token_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_spend_cash(
  p_championship_id UUID,
  p_cash_amount BIGINT,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cash_balance BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_cash_amount IS NULL OR p_cash_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid cash amount');
  END IF;

  SELECT COALESCE(w.cash_balance, 0)
  INTO v_cash_balance
  FROM public.wallets w
  WHERE public.tcc_wallet_uid(w) = v_user_id
  LIMIT 1
  FOR UPDATE;

  IF v_cash_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
  END IF;

  IF v_cash_balance < p_cash_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient cash');
  END IF;

  UPDATE public.wallets w
  SET cash_balance = COALESCE(w.cash_balance, 0) - p_cash_amount,
      updated_at = NOW()
  WHERE public.tcc_wallet_uid(w) = v_user_id;

  INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
  VALUES (p_championship_id, v_user_id, -p_cash_amount, 0, 'spend', p_reason, COALESCE(p_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_reward_cash(
  p_championship_id UUID,
  p_user_id UUID,
  p_cash_amount BIGINT,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
BEGIN
  IF p_cash_amount IS NULL OR p_cash_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid cash amount');
  END IF;

  UPDATE public.wallets w
  SET cash_balance = COALESCE(w.cash_balance, 0) + p_cash_amount,
      updated_at = NOW()
  WHERE public.tcc_wallet_uid(w) = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
  END IF;

  INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
  VALUES (
    p_championship_id,
    p_user_id,
    p_cash_amount,
    0,
    CASE WHEN p_reason = 'race_position' THEN 'race_reward' ELSE 'achievement_reward' END,
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_award_season_tokens(p_championship_id UUID)
RETURNS JSONB AS $$
DECLARE
  rec RECORD;
  v_token_award NUMERIC;
  v_inserted_id UUID;
  v_awarded_count INTEGER := 0;
BEGIN
  FOR rec IN
    WITH team_points AS (
      SELECT
        (kv.key)::uuid AS team_id,
        SUM((kv.value)::INT) AS points
      FROM public.tcc_race_results rr
      JOIN public.tcc_weekends w ON w.id = rr.weekend_id
      CROSS JOIN LATERAL jsonb_each_text(rr.points_awarded) kv
      WHERE w.championship_id = p_championship_id
      GROUP BY kv.key
    ),
    ranked AS (
      SELECT
        tp.team_id,
        t.owner_id,
        tp.points,
        DENSE_RANK() OVER (ORDER BY tp.points DESC, tp.team_id) AS position
      FROM team_points tp
      JOIN public.tcc_teams t ON t.id = tp.team_id
      WHERE t.owner_id IS NOT NULL
    )
    SELECT * FROM ranked ORDER BY position, points DESC
  LOOP
    v_token_award := CASE rec.position
      WHEN 1 THEN 1200
      WHEN 2 THEN 900
      WHEN 3 THEN 700
      WHEN 4 THEN 500
      WHEN 5 THEN 350
      WHEN 6 THEN 250
      WHEN 7 THEN 180
      WHEN 8 THEN 130
      WHEN 9 THEN 90
      WHEN 10 THEN 60
      ELSE 0
    END;

    IF v_token_award <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.tcc_season_token_awards(championship_id, user_id, position, token_amount)
    VALUES (p_championship_id, rec.owner_id, rec.position, v_token_award)
    ON CONFLICT (championship_id, user_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.wallets w
    SET token_balance = COALESCE(w.token_balance, 0) + v_token_award,
        updated_at = NOW()
    WHERE public.tcc_wallet_uid(w) = rec.owner_id;

    INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
    VALUES (
      p_championship_id,
      rec.owner_id,
      0,
      v_token_award,
      'season_award',
      'Season leaderboard token award',
      jsonb_build_object('position', rec.position, 'points', rec.points)
    );

    v_awarded_count := v_awarded_count + 1;
    v_inserted_id := NULL;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'awarded_count', v_awarded_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.tcc_economy_config(championship_id, base_token_cash_rate, seasonal_converted_cash_cap, weekly_investment_cap_tkn)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 10000, 135000000, 1200)
ON CONFLICT (championship_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tcc_enqueue_facility_upgrade(p_team_id UUID, p_facility TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_levels JSONB;
  v_queue JSONB;
  v_current INTEGER;
  v_cost_cash BIGINT;
  v_duration_hours INTEGER;
  v_item JSONB;
  v_championship_id UUID;
  v_spend_result JSONB;
BEGIN
  v_user_id := auth.uid();
  SELECT championship_id INTO v_championship_id
  FROM public.tcc_teams
  WHERE id = p_team_id AND owner_id = v_user_id;

  IF v_championship_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not owner');
  END IF;

  INSERT INTO public.tcc_facilities(team_id) VALUES (p_team_id) ON CONFLICT (team_id) DO NOTHING;
  SELECT levels, upgrade_queue INTO v_levels, v_queue FROM public.tcc_facilities WHERE team_id = p_team_id;
  v_current := COALESCE((v_levels ->> p_facility)::int, 1);

  v_cost_cash := CASE p_facility
    WHEN 'factory' THEN 1200000
    WHEN 'aero' THEN 1500000
    WHEN 'powertrain' THEN 1450000
    WHEN 'simulator' THEN 1000000
    WHEN 'pit_crew' THEN 800000
    WHEN 'logistics' THEN 700000
    ELSE 1000000
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

  v_spend_result := public.tcc_spend_cash(
    v_championship_id,
    v_cost_cash,
    'facility_upgrade',
    jsonb_build_object('team_id', p_team_id, 'facility', p_facility, 'target_level', v_current + 1)
  );

  IF COALESCE((v_spend_result ->> 'success')::boolean, false) = false THEN
    RETURN v_spend_result;
  END IF;

  v_item := jsonb_build_object(
    'id', gen_random_uuid(),
    'facility', p_facility,
    'target_level', v_current + 1,
    'started_at', NOW(),
    'completes_at', NOW() + make_interval(hours => v_duration_hours),
    'cost_cash', v_cost_cash
  );

  UPDATE public.tcc_facilities
  SET upgrade_queue = COALESCE(upgrade_queue, '[]'::jsonb) || jsonb_build_array(v_item)
  WHERE team_id = p_team_id;

  RETURN jsonb_build_object('success', true, 'item', v_item);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT SELECT ON public.tcc_economy_config TO authenticated, anon;
GRANT SELECT ON public.tcc_token_price_history TO authenticated, anon;
GRANT SELECT ON public.tcc_economy_weekly_investments TO authenticated;
GRANT SELECT ON public.tcc_economy_season_usage TO authenticated;
GRANT SELECT ON public.tcc_cash_ledger TO authenticated;
GRANT SELECT ON public.tcc_season_token_awards TO authenticated;

GRANT EXECUTE ON FUNCTION public.tcc_get_current_token_price(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_get_championship_week(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_get_wallet_economy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_upsert_token_price(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_convert_token_to_cash(UUID, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_spend_cash(UUID, BIGINT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_reward_cash(UUID, UUID, BIGINT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_award_season_tokens(UUID) TO authenticated;
