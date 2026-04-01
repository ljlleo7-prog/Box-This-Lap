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

  IF v_economy_mode = 'beta_calendar_budget' OR v_is_beta THEN
    SELECT COALESCE(SUM(amount_cash), 0)
    INTO v_cash
    FROM public.tcc_cash_ledger
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id;

    v_token := 0;
  ELSE
    SELECT COALESCE(w.token_balance, 0), COALESCE(w.cash_balance, 0)
    INTO v_token, v_cash
    FROM public.wallets w
    WHERE public.tcc_wallet_uid(w) = v_user_id
    LIMIT 1;
  END IF;

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
  v_cash_balance BIGINT := 0;
  v_economy_mode TEXT := 'legacy_variable_exchange';
  v_is_beta BOOLEAN := false;
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

  SELECT
    COALESCE(economy_mode, 'legacy_variable_exchange'),
    COALESCE(is_beta, false),
    COALESCE(daily_budget_cash, 0),
    COALESCE(weekly_budget_cash, 0),
    COALESCE(NULLIF(budget_timezone, ''), 'UTC')
  INTO v_economy_mode, v_is_beta, v_daily_budget_cash, v_weekly_budget_cash, v_budget_timezone
  FROM public.tcc_economy_config
  WHERE championship_id = p_championship_id;

  IF v_economy_mode = 'beta_calendar_budget' OR v_is_beta THEN
    SELECT COALESCE(SUM(amount_cash), 0)
    INTO v_cash_balance
    FROM public.tcc_cash_ledger
    WHERE championship_id = p_championship_id
      AND user_id = v_user_id;
  ELSE
    SELECT COALESCE(w.cash_balance, 0)
    INTO v_cash_balance
    FROM public.wallets w
    WHERE public.tcc_wallet_uid(w) = v_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_cash_balance IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Wallet not found');
    END IF;
  END IF;

  IF v_cash_balance < p_cash_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient cash');
  END IF;

  IF v_economy_mode = 'beta_calendar_budget' OR v_is_beta THEN
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
  ELSE
    UPDATE public.wallets w
    SET cash_balance = COALESCE(w.cash_balance, 0) - p_cash_amount,
        updated_at = NOW()
    WHERE public.tcc_wallet_uid(w) = v_user_id;
  END IF;

  IF v_economy_mode = 'beta_calendar_budget' OR v_is_beta THEN
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
      WHEN v_economy_mode = 'beta_calendar_budget' OR v_is_beta THEN jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.purchase_team(team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_championship_id UUID;
  v_team_budget BIGINT;
  v_is_beta BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tcc_players WHERE id = v_user_id) THEN
    INSERT INTO public.tcc_players (id, username)
    VALUES (v_user_id, NULL)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT championship_id, COALESCE(budget, 0)
  INTO v_championship_id, v_team_budget
  FROM public.tcc_teams
  WHERE id = team_id AND owner_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Team not available or already taken');
  END IF;

  SELECT COALESCE(is_beta, false)
  INTO v_is_beta
  FROM public.tcc_economy_config
  WHERE championship_id = v_championship_id;

  UPDATE public.tcc_teams
  SET owner_id = v_user_id
  WHERE id = team_id;

  INSERT INTO public.tcc_championship_members (championship_id, user_id, role)
  VALUES (v_championship_id, v_user_id, 'player')
  ON CONFLICT (championship_id, user_id) DO NOTHING;

  IF v_is_beta THEN
    INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
    VALUES (
      v_championship_id,
      v_user_id,
      v_team_budget,
      0,
      'achievement_reward',
      'Initial team operating budget',
      jsonb_build_object('team_id', team_id, 'source', 'team_budget')
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Team registered with initial cash budget',
      'cash_awarded', v_team_budget
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Team purchased successfully',
    'cash_awarded', 0
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.purchase_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_get_wallet_economy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tcc_spend_cash(UUID, BIGINT, TEXT, JSONB) TO authenticated;
