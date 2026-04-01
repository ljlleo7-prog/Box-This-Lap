ALTER TABLE public.tcc_economy_config
ADD COLUMN IF NOT EXISTS economy_mode TEXT NOT NULL DEFAULT 'legacy_variable_exchange'
  CHECK (economy_mode IN ('legacy_variable_exchange', 'beta_calendar_budget')),
ADD COLUMN IF NOT EXISTS is_beta BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS disable_token_transactions BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS disable_token_pricing BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS disable_rewards BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS daily_budget_cash BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_budget_cash BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget_timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS public.tcc_economy_calendar_usage (
  championship_id UUID NOT NULL REFERENCES public.tcc_championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
  budget_date DATE NOT NULL,
  iso_week_key TEXT NOT NULL,
  daily_spent_cash BIGINT NOT NULL DEFAULT 0,
  weekly_spent_cash BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (championship_id, user_id, budget_date)
);

ALTER TABLE public.tcc_economy_calendar_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tcc_economy_calendar_usage' AND policyname = 'tcc_calendar_usage_select'
  ) THEN
    CREATE POLICY "tcc_calendar_usage_select"
    ON public.tcc_economy_calendar_usage
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tcc_economy_calendar_usage_week_lookup
ON public.tcc_economy_calendar_usage(championship_id, user_id, iso_week_key);

ALTER TABLE public.tcc_weekends
ADD COLUMN IF NOT EXISTS practice_speed_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (practice_speed_multiplier IN (1, 2, 5, 10)),
ADD COLUMN IF NOT EXISTS quali_speed_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (quali_speed_multiplier IN (1, 2, 5, 10)),
ADD COLUMN IF NOT EXISTS race_speed_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (race_speed_multiplier IN (1, 2, 5, 10)),
ADD COLUMN IF NOT EXISTS practice_speed_locked_at_utc TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS quali_speed_locked_at_utc TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS race_speed_locked_at_utc TIMESTAMPTZ;

UPDATE public.tcc_weekends
SET practice_speed_multiplier = COALESCE(practice_speed_multiplier, speed_multiplier, 1),
    quali_speed_multiplier = COALESCE(quali_speed_multiplier, speed_multiplier, 1),
    race_speed_multiplier = COALESCE(race_speed_multiplier, speed_multiplier, 1)
WHERE practice_speed_multiplier IS DISTINCT FROM COALESCE(speed_multiplier, 1)
   OR quali_speed_multiplier IS DISTINCT FROM COALESCE(speed_multiplier, 1)
   OR race_speed_multiplier IS DISTINCT FROM COALESCE(speed_multiplier, 1);

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
  v_economy_mode TEXT := 'legacy_variable_exchange';
  v_is_beta BOOLEAN := false;
  v_disable_token_transactions BOOLEAN := false;
  v_disable_token_pricing BOOLEAN := false;
  v_disable_rewards BOOLEAN := false;
  v_daily_budget_cash BIGINT := 0;
  v_weekly_budget_cash BIGINT := 0;
  v_budget_timezone TEXT := 'UTC';
  v_budget_now TIMESTAMPTZ;
  v_budget_date DATE;
  v_iso_week_key TEXT;
  v_daily_used BIGINT := 0;
  v_weekly_budget_used BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT COALESCE(w.token_balance, 0), COALESCE(w.cash_balance, 0)
  INTO v_token, v_cash
  FROM public.wallets w
  WHERE public.tcc_wallet_uid(w) = v_user_id
  LIMIT 1;

  SELECT
    COALESCE(base_token_cash_rate, 10000),
    COALESCE(weekly_investment_cap_tkn, 1200),
    COALESCE(seasonal_converted_cash_cap, 135000000),
    COALESCE(economy_mode, 'legacy_variable_exchange'),
    COALESCE(is_beta, false),
    COALESCE(disable_token_transactions, false),
    COALESCE(disable_token_pricing, false),
    COALESCE(disable_rewards, false),
    COALESCE(daily_budget_cash, 0),
    COALESCE(weekly_budget_cash, 0),
    COALESCE(NULLIF(budget_timezone, ''), 'UTC')
  INTO
    v_rate,
    v_weekly_cap,
    v_season_cap,
    v_economy_mode,
    v_is_beta,
    v_disable_token_transactions,
    v_disable_token_pricing,
    v_disable_rewards,
    v_daily_budget_cash,
    v_weekly_budget_cash,
    v_budget_timezone
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

  v_budget_now := timezone(v_budget_timezone, NOW());
  v_budget_date := v_budget_now::date;
  v_iso_week_key := to_char(v_budget_now, 'IYYY-"W"IW');

  SELECT COALESCE(daily_spent_cash, 0)
  INTO v_daily_used
  FROM public.tcc_economy_calendar_usage
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
    AND budget_date = v_budget_date;

  SELECT COALESCE(SUM(daily_spent_cash), 0)
  INTO v_weekly_budget_used
  FROM public.tcc_economy_calendar_usage
  WHERE championship_id = p_championship_id
    AND user_id = v_user_id
    AND iso_week_key = v_iso_week_key;

  RETURN jsonb_build_object(
    'success', true,
    'wallet', jsonb_build_object(
      'token_balance', COALESCE(v_token, 0),
      'cash_balance', COALESCE(v_cash, 0)
    ),
    'economy', jsonb_build_object(
      'mode', v_economy_mode,
      'is_beta', v_is_beta,
      'disable_token_transactions', v_disable_token_transactions,
      'disable_token_pricing', v_disable_token_pricing,
      'disable_rewards', v_disable_rewards,
      'budget_timezone', v_budget_timezone,
      'budget_date', v_budget_date,
      'budget_week', v_iso_week_key
    ),
    'pricing', CASE
      WHEN v_disable_token_pricing OR v_economy_mode = 'beta_calendar_budget' THEN jsonb_build_object('cash_per_token', NULL)
      ELSE jsonb_build_object('cash_per_token', v_rate)
    END,
    'caps', jsonb_build_object(
      'current_week', v_week,
      'weekly_investment_cap_tkn', v_weekly_cap,
      'weekly_investment_used_tkn', v_weekly_used,
      'weekly_investment_remaining_tkn', GREATEST(0, v_weekly_cap - v_weekly_used),
      'seasonal_converted_cash_cap', v_season_cap,
      'seasonal_converted_cash_used', v_season_used,
      'seasonal_converted_cash_remaining', GREATEST(0, v_season_cap - v_season_used),
      'daily_budget_cash', v_daily_budget_cash,
      'daily_budget_used_cash', v_daily_used,
      'daily_budget_remaining_cash', CASE
        WHEN v_daily_budget_cash > 0 THEN GREATEST(0, v_daily_budget_cash - v_daily_used)
        ELSE NULL
      END,
      'weekly_budget_cash', v_weekly_budget_cash,
      'weekly_budget_used_cash', v_weekly_budget_used,
      'weekly_budget_remaining_cash', CASE
        WHEN v_weekly_budget_cash > 0 THEN GREATEST(0, v_weekly_budget_cash - v_weekly_budget_used)
        ELSE NULL
      END
    )
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
  v_economy_mode TEXT := 'legacy_variable_exchange';
  v_daily_budget_cash BIGINT := 0;
  v_weekly_budget_cash BIGINT := 0;
  v_budget_timezone TEXT := 'UTC';
  v_budget_now TIMESTAMPTZ;
  v_budget_date DATE;
  v_iso_week_key TEXT;
  v_daily_used BIGINT := 0;
  v_weekly_used BIGINT := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_cash_amount IS NULL OR p_cash_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid cash amount');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tcc_championship_members
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a championship member');
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

  SELECT
    COALESCE(economy_mode, 'legacy_variable_exchange'),
    COALESCE(daily_budget_cash, 0),
    COALESCE(weekly_budget_cash, 0),
    COALESCE(NULLIF(budget_timezone, ''), 'UTC')
  INTO v_economy_mode, v_daily_budget_cash, v_weekly_budget_cash, v_budget_timezone
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  IF v_economy_mode = 'beta_calendar_budget' THEN
    v_budget_now := timezone(v_budget_timezone, NOW());
    v_budget_date := v_budget_now::date;
    v_iso_week_key := to_char(v_budget_now, 'IYYY-"W"IW');

    SELECT COALESCE(daily_spent_cash, 0)
    INTO v_daily_used
    FROM public.tcc_economy_calendar_usage
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id
      AND budget_date = v_budget_date
    FOR UPDATE;

    SELECT COALESCE(SUM(daily_spent_cash), 0)
    INTO v_weekly_used
    FROM public.tcc_economy_calendar_usage
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id
      AND iso_week_key = v_iso_week_key;

    IF v_daily_budget_cash > 0 AND v_daily_used + p_cash_amount > v_daily_budget_cash THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Daily budget exceeded',
        'daily_budget_remaining_cash', GREATEST(0, v_daily_budget_cash - v_daily_used),
        'budget_date', v_budget_date,
        'budget_timezone', v_budget_timezone
      );
    END IF;

    IF v_weekly_budget_cash > 0 AND v_weekly_used + p_cash_amount > v_weekly_budget_cash THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Weekly budget exceeded',
        'weekly_budget_remaining_cash', GREATEST(0, v_weekly_budget_cash - v_weekly_used),
        'budget_week', v_iso_week_key,
        'budget_timezone', v_budget_timezone
      );
    END IF;
  END IF;

  UPDATE public.wallets w
  SET cash_balance = COALESCE(w.cash_balance, 0) - p_cash_amount,
      updated_at = NOW()
  WHERE public.tcc_wallet_uid(w) = v_user_id;

  IF v_economy_mode = 'beta_calendar_budget' THEN
    INSERT INTO public.tcc_economy_calendar_usage(
      championship_id,
      user_id,
      budget_date,
      iso_week_key,
      daily_spent_cash,
      weekly_spent_cash,
      updated_at
    )
    VALUES (
      p_championship_id,
      v_user_id,
      v_budget_date,
      v_iso_week_key,
      p_cash_amount,
      p_cash_amount,
      NOW()
    )
    ON CONFLICT (championship_id, user_id, budget_date)
    DO UPDATE SET
      daily_spent_cash = public.tcc_economy_calendar_usage.daily_spent_cash + EXCLUDED.daily_spent_cash,
      weekly_spent_cash = public.tcc_economy_calendar_usage.weekly_spent_cash + EXCLUDED.weekly_spent_cash,
      iso_week_key = EXCLUDED.iso_week_key,
      updated_at = NOW();
  END IF;

  INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
  VALUES (
    p_championship_id,
    v_user_id,
    -p_cash_amount,
    0,
    'spend',
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb) || CASE
      WHEN v_economy_mode = 'beta_calendar_budget' THEN jsonb_build_object(
        'budget_date', v_budget_date,
        'budget_week', v_iso_week_key,
        'budget_timezone', v_budget_timezone
      )
      ELSE '{}'::jsonb
    END
  );

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
DECLARE
  v_disable_rewards BOOLEAN := false;
BEGIN
  SELECT COALESCE(disable_rewards, false)
  INTO v_disable_rewards
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  IF v_disable_rewards THEN
    RETURN jsonb_build_object('success', false, 'message', 'Rewards are disabled for this championship');
  END IF;

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
  v_disable_rewards BOOLEAN := false;
BEGIN
  SELECT COALESCE(disable_rewards, false)
  INTO v_disable_rewards
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  IF v_disable_rewards THEN
    RETURN jsonb_build_object(
      'success', true,
      'awarded_count', 0,
      'token_awards_enabled', false,
      'message', 'Season rewards disabled for this championship'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'awarded_count', 0,
    'token_awards_enabled', false,
    'message', 'Legacy season awards are disabled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tcc_set_weekend_session_speed(
  p_weekend_id UUID,
  p_session_type TEXT,
  p_speed_multiplier INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_weekend RECORD;
  v_target_time TIMESTAMPTZ;
  v_is_host BOOLEAN := false;
  v_column_name TEXT;
  v_lock_column_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF p_session_type NOT IN ('practice', 'quali', 'race') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid session type');
  END IF;

  IF p_speed_multiplier NOT IN (1, 2, 5, 10) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid speed multiplier');
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

  IF p_session_type = 'practice' THEN
    v_target_time := v_weekend.scheduled_practice_at_utc;
    v_column_name := 'practice_speed_multiplier';
    v_lock_column_name := 'practice_speed_locked_at_utc';
    IF v_weekend.status <> 'scheduled' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Practice speed can only be changed before practice starts');
    END IF;
  ELSIF p_session_type = 'quali' THEN
    v_target_time := v_weekend.scheduled_quali_at_utc;
    v_column_name := 'quali_speed_multiplier';
    v_lock_column_name := 'quali_speed_locked_at_utc';
    IF v_weekend.status NOT IN ('scheduled', 'practice_complete') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Qualifying speed can only be changed before qualifying starts');
    END IF;
  ELSE
    v_target_time := v_weekend.scheduled_race_at_utc;
    v_column_name := 'race_speed_multiplier';
    v_lock_column_name := 'race_speed_locked_at_utc';
    IF v_weekend.status NOT IN ('scheduled', 'practice_complete', 'quali_complete') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Race speed can only be changed before race starts');
    END IF;
  END IF;

  IF v_target_time IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Scheduled session time missing');
  END IF;

  IF NOW() >= (v_target_time - INTERVAL '3 hours') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session speed locks 3 hours before the session start',
      'session_type', p_session_type,
      'scheduled_at_utc', v_target_time
    );
  END IF;

  EXECUTE format(
    'UPDATE public.tcc_weekends SET %I = $1, %I = NOW() WHERE id = $2',
    v_column_name,
    v_lock_column_name
  ) USING p_speed_multiplier, p_weekend_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_type', p_session_type,
    'speed_multiplier', p_speed_multiplier,
    'scheduled_at_utc', v_target_time,
    'locked_at_utc', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.tcc_convert_token_to_cash(UUID, NUMERIC, INTEGER)
RENAME TO tcc_convert_token_to_cash_legacy;

CREATE OR REPLACE FUNCTION public.tcc_convert_token_to_cash(
  p_championship_id UUID,
  p_token_amount NUMERIC,
  p_week_number INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_disable_token_transactions BOOLEAN := false;
  v_is_beta BOOLEAN := false;
BEGIN
  SELECT COALESCE(disable_token_transactions, false), COALESCE(is_beta, false)
  INTO v_disable_token_transactions, v_is_beta
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  IF v_disable_token_transactions OR v_is_beta THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Token transactions are disabled for this beta championship'
    );
  END IF;

  RETURN public.tcc_convert_token_to_cash_legacy(p_championship_id, p_token_amount, p_week_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.tcc_economy_config(
  championship_id,
  base_token_cash_rate,
  seasonal_converted_cash_cap,
  weekly_investment_cap_tkn,
  economy_mode,
  is_beta,
  disable_token_transactions,
  disable_token_pricing,
  disable_rewards,
  daily_budget_cash,
  weekly_budget_cash,
  budget_timezone
)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  10000,
  135000000,
  1200,
  'beta_calendar_budget',
  true,
  true,
  true,
  true,
  12000000,
  50000000,
  'UTC'
)
ON CONFLICT (championship_id) DO UPDATE SET
  economy_mode = EXCLUDED.economy_mode,
  is_beta = EXCLUDED.is_beta,
  disable_token_transactions = EXCLUDED.disable_token_transactions,
  disable_token_pricing = EXCLUDED.disable_token_pricing,
  disable_rewards = EXCLUDED.disable_rewards,
  daily_budget_cash = EXCLUDED.daily_budget_cash,
  weekly_budget_cash = EXCLUDED.weekly_budget_cash,
  budget_timezone = EXCLUDED.budget_timezone,
  updated_at = NOW();

GRANT SELECT ON public.tcc_economy_calendar_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_set_weekend_session_speed(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_convert_token_to_cash_legacy(UUID, NUMERIC, INTEGER) TO authenticated;
