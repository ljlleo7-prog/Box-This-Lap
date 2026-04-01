-- Live online race coordination tables

CREATE TABLE public.tcc_live_presence (
    weekend_id UUID NOT NULL REFERENCES public.tcc_weekends(id) ON DELETE CASCADE,
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('race')),
    user_id UUID NOT NULL REFERENCES public.tcc_players(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.tcc_teams(id) ON DELETE SET NULL,
    is_running BOOLEAN NOT NULL DEFAULT false,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    streak_started_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (weekend_id, session_type, user_id)
);

CREATE TABLE public.tcc_live_snapshot_current (
    weekend_id UUID NOT NULL REFERENCES public.tcc_weekends(id) ON DELETE CASCADE,
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('race')),
    authority_user_id UUID REFERENCES public.tcc_players(id) ON DELETE SET NULL,
    authority_role VARCHAR(20) NOT NULL DEFAULT 'participant' CHECK (authority_role IN ('host', 'participant')),
    revision BIGINT NOT NULL DEFAULT 0,
    sim_time DOUBLE PRECISION NOT NULL DEFAULT 0,
    race_state JSONB NOT NULL,
    source_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (weekend_id, session_type)
);

CREATE INDEX tcc_live_presence_lookup_idx
    ON public.tcc_live_presence (weekend_id, session_type, last_seen_at DESC);

CREATE INDEX tcc_live_snapshot_authority_idx
    ON public.tcc_live_snapshot_current (authority_user_id, updated_at DESC);

ALTER TABLE public.tcc_live_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_live_snapshot_current ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.tcc_live_presence TO authenticated;
GRANT SELECT ON public.tcc_live_snapshot_current TO authenticated;
GRANT INSERT, UPDATE ON public.tcc_live_presence TO authenticated;
GRANT INSERT, UPDATE ON public.tcc_live_snapshot_current TO authenticated;

CREATE POLICY "Members can view live presence" ON public.tcc_live_presence
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.tcc_weekends w
            JOIN public.tcc_championship_members m ON m.championship_id = w.championship_id
            WHERE w.id = tcc_live_presence.weekend_id
              AND m.user_id = auth.uid()
        )
    );

CREATE POLICY "Members can view live snapshots" ON public.tcc_live_snapshot_current
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.tcc_weekends w
            JOIN public.tcc_championship_members m ON m.championship_id = w.championship_id
            WHERE w.id = tcc_live_snapshot_current.weekend_id
              AND m.user_id = auth.uid()
        )
    );
