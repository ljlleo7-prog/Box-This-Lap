CREATE OR REPLACE FUNCTION public.tcc_award_season_tokens(p_championship_id UUID)
RETURNS JSONB AS $$
DECLARE
  rec RECORD;
  v_daily_cash_award BIGINT := 1000000;
  v_day_count INTEGER := 1;
  v_cash_award BIGINT;
  v_inserted_id UUID;
  v_awarded_count INTEGER := 0;
BEGIN
  SELECT GREATEST(
    1,
    CEIL(
      EXTRACT(
        EPOCH FROM (
          COALESCE(MAX(w.scheduled_race_at_utc), NOW()) - COALESCE(MIN(w.scheduled_race_at_utc), c.created_at)
        )
      ) / 86400.0
    )::INTEGER
  )
  INTO v_day_count
  FROM public.tcc_championships c
  LEFT JOIN public.tcc_weekends w
    ON w.championship_id = c.id
   AND w.status <> 'cancelled'
  WHERE c.id = p_championship_id
  GROUP BY c.id, c.created_at;

  v_cash_award := v_daily_cash_award * v_day_count;

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
    INSERT INTO public.tcc_season_token_awards(championship_id, user_id, position, token_amount)
    VALUES (p_championship_id, rec.owner_id, rec.position, 0)
    ON CONFLICT (championship_id, user_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.wallets w
    SET cash_balance = COALESCE(w.cash_balance, 0) + v_cash_award,
        updated_at = NOW()
    WHERE public.tcc_wallet_uid(w) = rec.owner_id;

    INSERT INTO public.tcc_cash_ledger(championship_id, user_id, amount_cash, amount_tkn, entry_type, description, metadata)
    VALUES (
      p_championship_id,
      rec.owner_id,
      v_cash_award,
      0,
      'season_award',
      'Season completion daily cash payout',
      jsonb_build_object(
        'position', rec.position,
        'points', rec.points,
        'daily_cash_award', v_daily_cash_award,
        'day_count', v_day_count,
        'cash_award', v_cash_award
      )
    );

    v_awarded_count := v_awarded_count + 1;
    v_inserted_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'awarded_count', v_awarded_count,
    'daily_cash_award', v_daily_cash_award,
    'day_count', v_day_count,
    'cash_per_team', v_cash_award,
    'token_awards_enabled', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.tcc_award_season_tokens(UUID) TO authenticated;
