import { supabase } from './supabase';
import { DRIVERS } from '../data/initialData';
import type { ChampionshipStandingEntry, LiveRaceState, OfflineWeekend, OnlineWeekendGaragePlan, OnlineWeekendParcFermeState, OnlineWeekendPlanBundle, OnlineWeekendPlanRow, RaceState, SessionSetupState, SessionSummary, SessionType } from '../types';

export type LiveSessionType = 'practice' | 'quali' | 'race';

export type WalletEconomyResponse = {
  success: boolean;
  wallet?: {
    token_balance: number;
    cash_balance: number;
  };
  economy?: {
    mode: 'legacy_variable_exchange' | 'beta_calendar_budget';
    is_beta: boolean;
    disable_token_transactions: boolean;
    disable_token_pricing: boolean;
    disable_rewards: boolean;
    budget_timezone: string;
    budget_date: string;
    budget_week: string;
  };
  pricing?: {
    cash_per_token: number | null;
  };
  caps?: {
    current_week: number;
    weekly_investment_cap_tkn: number;
    weekly_investment_used_tkn: number;
    weekly_investment_remaining_tkn: number;
    seasonal_converted_cash_cap: number;
    seasonal_converted_cash_used: number;
    seasonal_converted_cash_remaining: number;
    daily_budget_cash: number | null;
    daily_budget_used_cash: number;
    daily_budget_remaining_cash: number | null;
    weekly_budget_cash: number | null;
    weekly_budget_used_cash: number;
    weekly_budget_remaining_cash: number | null;
  };
  message?: string;
};

export type LiveRaceSnapshot = {
  weekend_id: string;
  session_type: LiveSessionType;
  authority_user_id: string | null;
  authority_username?: string | null;
  authority_role: 'host' | 'participant';
  revision: number;
  sim_time: number;
  race_state: LiveRaceState;
  source_updated_at: string;
  updated_at: string;
  isFresh?: boolean;
};

export type RaceLiveResponse = {
  weekendId: string;
  sessionType: LiveSessionType;
  authorityUserId: string | null;
  authorityUsername?: string | null;
  authorityRole: 'host' | 'participant';
  authorityTeamId: string | null;
  isRequesterAuthority: boolean;
  snapshot: LiveRaceSnapshot | null;
};

export type LiveRaceSidebarDriverPosition = {
  driverId: string;
  position: number;
};

export type LiveRaceSidebarSummary = {
  championshipId: string;
  weekendId: string;
  championshipName: string | null;
  authorityUserId: string | null;
  authorityUsername: string | null;
  currentLap: number | null;
  lastSeenAt: string | null;
  playerDriverPositions: LiveRaceSidebarDriverPosition[];
  availableSessions: LiveSessionType[];
  defaultSession: LiveSessionType;
  hasLiveUsers: boolean;
  livePresenceCount: number;
  weekendStatus: string | null;
  roundNumber: number | null;
  trackId: string | null;
};

export type SaveWeekendPlanResponse = {
  success: boolean;
  preset: OnlineWeekendGaragePlan;
  session_type: SessionType;
  weekend_status?: string;
  message?: string;
};

export type CompleteInteractiveSessionResponse = {
  success: boolean;
  weekend: OfflineWeekend;
  seasonAward?: unknown;
  teamCashRewards?: Record<string, number>;
  message?: string;
};

export type ChampionshipStandingsResponse = {
  driverStandings: ChampionshipStandingEntry[];
  constructorStandings: ChampionshipStandingEntry[];
};

const normalizeStandingEntries = (snapshot: unknown): ChampionshipStandingEntry[] => {
  if (!Array.isArray(snapshot)) return [];

  return snapshot
    .map((entry): ChampionshipStandingEntry | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const entityId = record.entityId ?? record.entity_id ?? record.id ?? record.driver_id ?? record.team_id ?? record.constructor_id;
      const name = record.name ?? record.driver_name ?? record.team_name ?? record.constructor_name;
      const points = record.points;
      const wins = record.wins;
      const podiums = record.podiums;

      if (typeof entityId !== 'string' || typeof name !== 'string') return null;

      return {
        entityId,
        name,
        points: typeof points === 'number' ? points : Number(points ?? 0),
        wins: typeof wins === 'number' ? wins : Number(wins ?? 0),
        podiums: typeof podiums === 'number' ? podiums : Number(podiums ?? 0),
      };
    })
    .filter((entry): entry is ChampionshipStandingEntry => entry !== null);
};

const PLAN_TABLE_BY_SESSION: Record<SessionType, 'tcc_plans_practice' | 'tcc_plans_quali' | 'tcc_plans_race'> = {
  fp1: 'tcc_plans_practice',
  fp2: 'tcc_plans_practice',
  fp3: 'tcc_plans_practice',
  q1: 'tcc_plans_quali',
  q2: 'tcc_plans_quali',
  q3: 'tcc_plans_quali',
  race: 'tcc_plans_race',
};

const MECHANICAL_SETUP_KEYS = ['frontWingAngle', 'rearWingAngle', 'rideHeight', 'suspensionStiffness', 'toeOut', 'camber', 'gearboxSetting'] as const;

type MechanicalSetupKey = typeof MECHANICAL_SETUP_KEYS[number];

const pickMechanicalSetupFields = (setup: SessionSetupState | undefined): SessionSetupState => {
  if (!setup) return {};
  return Object.fromEntries(
    MECHANICAL_SETUP_KEYS
      .filter((key) => setup[key] !== undefined)
      .map((key) => [key, setup[key]])
  ) as SessionSetupState;
};

const normalizeParcFermeState = (value: unknown): OnlineWeekendParcFermeState | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;

  const normalizeDriverSetupMap = (input: unknown): Record<string, SessionSetupState> | undefined => {
    if (!input || typeof input !== 'object') return undefined;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([driverId, setup]) => [driverId, pickMechanicalSetupFields((setup ?? {}) as SessionSetupState)])
    );
  };

  return {
    isActive: Boolean(record.isActive),
    lockedFromPhase: record.lockedFromPhase === 'q1' ? 'q1' : null,
    activatedAt: typeof record.activatedAt === 'string' ? record.activatedAt : null,
    referenceMechanicalSetupByDriver: normalizeDriverSetupMap(record.referenceMechanicalSetupByDriver),
    lockedRaceSetupByDriver: normalizeDriverSetupMap(record.lockedRaceSetupByDriver),
  };
};

const normalizeWeekendGaragePlan = (preset: unknown): OnlineWeekendGaragePlan | null => {
  if (!preset || typeof preset !== 'object') return null;
  const plan = preset as OnlineWeekendGaragePlan & { parcFerme?: unknown };
  return {
    ...plan,
    parcFerme: normalizeParcFermeState(plan.parcFerme),
  };
};

const normalizeWeekendRecord = <T extends Record<string, any>>(weekend: T | null): T | null => {
  if (!weekend) return weekend;

  return {
    ...weekend,
    currentPhase: weekend.currentPhase ?? weekend.current_phase ?? 'pre_weekend',
    completedSessions: Array.isArray(weekend.completedSessions)
      ? weekend.completedSessions
      : Array.isArray(weekend.completed_sessions)
        ? weekend.completed_sessions
        : [],
    sessionSummaries: weekend.sessionSummaries ?? weekend.session_summaries ?? {},
  };
};

const getPlanTableForSession = (sessionType: SessionType) => PLAN_TABLE_BY_SESSION[sessionType];

export const TCC_API = {
  // Championship Management
  createChampionship: async (name: string) => {
    const { data, error } = await supabase.rpc('create_championship', {
      p_name: name
    });
    if (error) throw error;
    return data;
  },

  // Scheduling
  createWeekend: async (params: {
    championshipId: string;
    trackId: string;
    speedMultiplier?: number;
    practiceSpeedMultiplier?: 1 | 2 | 5 | 10;
    qualiSpeedMultiplier?: 1 | 2 | 5 | 10;
    raceSpeedMultiplier?: 1 | 2 | 5 | 10;
    raceLocalDatetime: string; // ISO string
    fp1LocalDatetime: string; // ISO string
    qualiLocalDatetime: string; // ISO string
    weatherMode: 'realistic' | 'preset';
    realismPreset: 'standard' | 'chaos';
  }) => {
    const { data, error } = await supabase.rpc('tcc_create_weekend', {
      p_championship_id: params.championshipId,
      p_track_id: params.trackId,
      p_speed_multiplier: params.speedMultiplier ?? null,
      p_practice_speed_multiplier: params.practiceSpeedMultiplier ?? null,
      p_quali_speed_multiplier: params.qualiSpeedMultiplier ?? null,
      p_race_speed_multiplier: params.raceSpeedMultiplier ?? null,
      p_host_local_datetime: params.raceLocalDatetime,
      p_fp1_local_datetime: params.fp1LocalDatetime,
      p_quali_local_datetime: params.qualiLocalDatetime,
      p_weather_mode: params.weatherMode,
      p_realism_preset: params.realismPreset,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to create weekend');
    return data;
  },

  // Plan Submission
  submitPracticePlan: async (weekendId: string, teamId: string, preset: OnlineWeekendGaragePlan) => {
    return supabase.from('tcc_plans_practice').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
  },

  submitQualiPlan: async (weekendId: string, teamId: string, preset: OnlineWeekendGaragePlan) => {
    return supabase.from('tcc_plans_quali').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
  },

  submitRacePlan: async (weekendId: string, teamId: string, preset: OnlineWeekendGaragePlan) => {
    return supabase.from('tcc_plans_race').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
  },

  getWeekendPlanForSession: async (weekendId: string, teamId: string, sessionType: SessionType): Promise<OnlineWeekendGaragePlan | null> => {
    const table = getPlanTableForSession(sessionType);
    const { data, error } = await supabase
      .from(table)
      .select('weekend_id, team_id, preset')
      .eq('weekend_id', weekendId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (error) throw error;
    return normalizeWeekendGaragePlan((data as OnlineWeekendPlanRow | null)?.preset ?? null);
  },

  saveWeekendPlanForSession: async (weekendId: string, teamId: string, sessionType: SessionType, preset: OnlineWeekendGaragePlan) => {
    const { data, error } = await supabase.rpc('tcc_save_weekend_plan_for_session', {
      p_weekend_id: weekendId,
      p_team_id: teamId,
      p_session_type: sessionType,
      p_preset: preset,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to save weekend plan');
    return data as SaveWeekendPlanResponse;
  },

  completeInteractiveSession: async (weekendId: string, teamId: string, sessionType: SessionType, summary: SessionSummary) => {
    const { data, error } = await supabase.rpc('tcc_complete_interactive_session', {
      p_weekend_id: weekendId,
      p_team_id: teamId,
      p_session_type: sessionType,
      p_summary: summary,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to complete interactive session');
    return {
      ...(data as CompleteInteractiveSessionResponse),
      weekend: normalizeWeekendRecord((data as CompleteInteractiveSessionResponse).weekend) as OfflineWeekend,
    };
  },

  getWeekendPlanBundle: async (weekendId: string, teamId: string): Promise<OnlineWeekendPlanBundle> => {
    const [practice, quali, race] = await Promise.all([
      TCC_API.getWeekendPlanForSession(weekendId, teamId, 'fp1'),
      TCC_API.getWeekendPlanForSession(weekendId, teamId, 'q1'),
      TCC_API.getWeekendPlanForSession(weekendId, teamId, 'race'),
    ]);

    return { practice, quali, race };
  },

  // Simulation Execution (Host Only)
  runPractice: async (weekendId: string) => {
    const { data, error } = await supabase.rpc('tcc_run_practice', {
      p_weekend_id: weekendId,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to run practice');
    return data;
  },

  runQuali: async (weekendId: string) => {
    const { data, error } = await supabase.rpc('tcc_run_quali', {
      p_weekend_id: weekendId,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to run qualifying');
    return data;
  },

  runRace: async (weekendId: string) => {
    const { data, error } = await supabase.rpc('tcc_run_race', {
      p_weekend_id: weekendId,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to run race');
    return data;
  },

  // Data Fetching Helpers
  getChampionships: () => supabase.from('tcc_championships').select('*'),
  
  getMyTeam: async (championshipId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    return supabase.from('tcc_teams')
      .select('*, tcc_drivers(*), tcc_facilities(*)')
      .eq('championship_id', championshipId)
      .eq('owner_id', user?.id)
      .maybeSingle();
  },

  getWeekend: async (weekendId: string) => {
    const response = await supabase.from('tcc_weekends')
      .select('*, tcc_championships(created_by), tcc_quali_results(*), tcc_race_results(*)')
      .eq('id', weekendId)
      .single();

    return {
      ...response,
      data: normalizeWeekendRecord(response.data),
    };
  },

  getChampionshipWeekends: (championshipId: string) =>
    supabase.from('tcc_weekends')
      .select('*')
      .eq('championship_id', championshipId)
      .order('round_number', { ascending: true }),

  getChampionshipStandings: async (championshipId: string): Promise<ChampionshipStandingsResponse> => {
    const { data, error } = await supabase
      .from('tcc_standings')
      .select('table_type, snapshot, updated_at')
      .eq('championship_id', championshipId)
      .in('table_type', ['drivers', 'constructors'])
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const latestDriverSnapshot = data?.find((row) => row.table_type === 'drivers')?.snapshot;
    const latestConstructorSnapshot = data?.find((row) => row.table_type === 'constructors')?.snapshot;

    return {
      driverStandings: normalizeStandingEntries(latestDriverSnapshot),
      constructorStandings: normalizeStandingEntries(latestConstructorSnapshot),
    };
  },

  getTeamTrainingPlans: (championshipId: string, teamId: string, roundNumber: number) =>
    supabase.from('tcc_training_plans')
      .select('*')
      .eq('championship_id', championshipId)
      .eq('team_id', teamId)
      .eq('round_number', roundNumber),

  upsertTeamTrainingPlans: async (plans: any[]) => {
    return supabase.from('tcc_training_plans').upsert(plans, {
      onConflict: 'championship_id,team_id,round_number,subject_type,subject_id'
    });
  },

  setWeekendSessionSpeed: async (weekendId: string, sessionType: 'practice' | 'quali' | 'race', speedMultiplier: 1 | 2 | 5 | 10) => {
    return supabase.rpc('tcc_set_weekend_session_speed', {
      p_weekend_id: weekendId,
      p_session_type: sessionType,
      p_speed_multiplier: speedMultiplier,
    });
  },

  setChampionshipBackgroundImage: async (championshipId: string, backgroundImageUrl: string | null) => {
    const { data, error } = await supabase.rpc('tcc_set_championship_background_image', {
      p_championship_id: championshipId,
      p_background_image_url: backgroundImageUrl,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to update championship background image');
    return data;
  },

  setWeekendBackgroundImage: async (weekendId: string, backgroundImageUrl: string | null) => {
    const { data, error } = await supabase.rpc('tcc_set_weekend_background_image', {
      p_weekend_id: weekendId,
      p_background_image_url: backgroundImageUrl,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to update weekend background image');
    return data;
  },

  cancelWeekend: async (weekendId: string) => {
    const { data, error } = await supabase.rpc('tcc_cancel_weekend', {
      p_weekend_id: weekendId,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to cancel weekend');
    return data;
  },

  setWeekendEndOfSeason: async (weekendId: string, isEndOfSeason: boolean) => {
    const { data, error } = await supabase.rpc('tcc_set_weekend_end_of_season', {
      p_weekend_id: weekendId,
      p_is_end_of_season: isEndOfSeason,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to update end-of-season flag');
    return data;
  },

  getPlayerUsername: async (userId: string | null | undefined) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('tcc_players')
      .select('username')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.username ?? null;
  },

  getRaceLive: async (weekendId: string, sessionType: LiveSessionType = 'race') => {
    const { data, error } = await supabase.rpc('tcc_get_race_live', {
      p_weekend_id: weekendId,
      p_session_type: sessionType,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to load live race state');
    return data as RaceLiveResponse;
  },

  syncRaceLive: async (params: {
    weekendId: string;
    teamId?: string | null;
    sessionType?: LiveSessionType;
    isRunning: boolean;
    simTime?: number | null;
    raceState?: LiveRaceState | null;
  }) => {
    const { data, error } = await supabase.rpc('tcc_sync_race_live', {
      p_weekend_id: params.weekendId,
      p_team_id: params.teamId ?? null,
      p_session_type: params.sessionType ?? 'race',
      p_is_running: params.isRunning,
      p_sim_time: params.simTime ?? null,
      p_race_state: params.raceState ?? null,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to sync live race state');
    return data as RaceLiveResponse;
  },

  syncRaceLiveOffline: async (params: {
    weekendId: string;
    teamId?: string | null;
    sessionType?: LiveSessionType;
  }) => {
    const { data, error } = await supabase.rpc('tcc_sync_race_live', {
      p_weekend_id: params.weekendId,
      p_team_id: params.teamId ?? null,
      p_session_type: params.sessionType ?? 'race',
      p_is_running: false,
      p_sim_time: null,
      p_race_state: null,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to clear live race presence');
    return data as RaceLiveResponse;
  },

  getLiveRaceSidebarSummary: async (userId: string): Promise<LiveRaceSidebarSummary | null> => {
    const threshold = new Date(Date.now() - 10_000).toISOString();
    const { data: weekendRows, error: weekendError } = await supabase
      .from('tcc_weekends')
      .select('id, championship_id, round_number, track_id, status, completed_sessions, current_phase, tcc_championships!inner(name)')
      .neq('status', 'cancelled')
      .neq('status', 'race_complete')
      .neq('status', 'completed')
      .order('scheduled_race_at_utc', { ascending: true })
      .limit(12);

    if (weekendError) throw weekendError;
    if (!weekendRows || weekendRows.length === 0) return null;

    const normalizeAvailableSessions = (weekend: Record<string, any>): LiveSessionType[] => {
      const status = String(weekend.status ?? '');
      const currentPhase = String(weekend.current_phase ?? weekend.currentPhase ?? '');
      const completedSessions = Array.isArray(weekend.completed_sessions)
        ? weekend.completed_sessions
        : Array.isArray(weekend.completedSessions)
          ? weekend.completedSessions
          : [];
      const completedSet = new Set(completedSessions.map((entry: unknown) => String(entry)));

      if (status === 'race_complete' || status === 'completed' || status === 'cancelled') return [];
      if (currentPhase === 'race') return ['race'];
      if (currentPhase.startsWith('q')) return ['quali', 'race'];
      if (currentPhase.startsWith('fp')) return ['practice', 'quali', 'race'];
      if (status === 'quali_complete') return ['race'];
      if (status === 'practice_complete') return ['quali', 'race'];
      if (completedSet.has('race')) return [];
      if (completedSet.has('q3') || completedSet.has('q2') || completedSet.has('q1')) return ['race'];
      if (completedSet.has('fp3') || completedSet.has('fp2') || completedSet.has('fp1')) return ['quali', 'race'];
      return ['practice', 'quali', 'race'];
    };

    const candidateWeekends = weekendRows
      .map((weekend) => {
        const availableSessions = normalizeAvailableSessions(weekend as Record<string, any>);
        const championshipRecord = Array.isArray((weekend as any).tcc_championships)
          ? (weekend as any).tcc_championships[0]
          : (weekend as any).tcc_championships;
        return {
          weekendId: weekend.id as string,
          championshipId: weekend.championship_id as string,
          championshipName: championshipRecord?.name ?? null,
          roundNumber: typeof weekend.round_number === 'number' ? weekend.round_number : Number(weekend.round_number ?? 0) || null,
          weekendStatus: typeof weekend.status === 'string' ? weekend.status : null,
          trackId: typeof weekend.track_id === 'string' ? weekend.track_id : null,
          availableSessions,
        };
      })
      .filter((weekend) => weekend.availableSessions.length > 0);

    if (candidateWeekends.length === 0) return null;

    const { data: presenceRows, error: presenceError } = await supabase
      .from('tcc_live_presence')
      .select('weekend_id, user_id, team_id, last_seen_at')
      .eq('session_type', 'race')
      .eq('is_running', true)
      .gte('last_seen_at', threshold)
      .in('weekend_id', candidateWeekends.map((weekend) => weekend.weekendId));

    if (presenceError) throw presenceError;

    const presenceByWeekend = new Map<string, { count: number; latestLastSeenAt: string | null }>();
    for (const row of presenceRows ?? []) {
      const existing = presenceByWeekend.get(row.weekend_id) ?? { count: 0, latestLastSeenAt: null };
      presenceByWeekend.set(row.weekend_id, {
        count: existing.count + 1,
        latestLastSeenAt: existing.latestLastSeenAt && existing.latestLastSeenAt > row.last_seen_at ? existing.latestLastSeenAt : row.last_seen_at,
      });
    }

    const prioritizedWeekend = [...candidateWeekends].sort((a, b) => {
      const aPresence = presenceByWeekend.get(a.weekendId)?.count ?? 0;
      const bPresence = presenceByWeekend.get(b.weekendId)?.count ?? 0;
      if (aPresence !== bPresence) return bPresence - aPresence;
      return (a.roundNumber ?? Number.MAX_SAFE_INTEGER) - (b.roundNumber ?? Number.MAX_SAFE_INTEGER);
    })[0];

    const { data: snapshotData, error: snapshotError } = await supabase
      .from('tcc_live_snapshot_current')
      .select('authority_user_id, race_state, updated_at')
      .eq('weekend_id', prioritizedWeekend.weekendId)
      .eq('session_type', 'race')
      .maybeSingle();

    if (snapshotError) throw snapshotError;

    const authorityUserId = snapshotData?.authority_user_id ?? null;
    const authorityUsername = authorityUserId ? await TCC_API.getPlayerUsername(authorityUserId) : null;
    const raceState = (snapshotData?.race_state ?? null) as LiveRaceState | null;

    let playerDriverPositions: LiveRaceSidebarDriverPosition[] = [];
    const { data: myTeam } = await TCC_API.getMyTeam(prioritizedWeekend.championshipId);
    const onlineDrivers = (myTeam?.tcc_drivers ?? []).slice(0, 2);
    const driverNames = new Set(onlineDrivers.map((driver: { name?: string | null }) => driver.name).filter(Boolean));
    if (raceState?.vehicles?.length && driverNames.size > 0) {
      const staticDrivers = DRIVERS.filter((driver) => driverNames.has(driver.name));
      playerDriverPositions = raceState.vehicles
        .filter((vehicle) => staticDrivers.some((driver) => driver.id === vehicle.driverId))
        .sort((a, b) => a.position - b.position)
        .map((vehicle) => ({ driverId: vehicle.driverId, position: vehicle.position }));
    }

    const livePresence = presenceByWeekend.get(prioritizedWeekend.weekendId);

    return {
      championshipId: prioritizedWeekend.championshipId,
      weekendId: prioritizedWeekend.weekendId,
      championshipName: prioritizedWeekend.championshipName,
      authorityUserId,
      authorityUsername,
      currentLap: raceState?.currentLap ?? null,
      lastSeenAt: snapshotData?.updated_at ?? livePresence?.latestLastSeenAt ?? null,
      playerDriverPositions,
      availableSessions: prioritizedWeekend.availableSessions,
      defaultSession: prioritizedWeekend.availableSessions[0] ?? 'race',
      hasLiveUsers: (livePresence?.count ?? 0) > 0,
      livePresenceCount: livePresence?.count ?? 0,
      weekendStatus: prioritizedWeekend.weekendStatus,
      roundNumber: prioritizedWeekend.roundNumber,
      trackId: prioritizedWeekend.trackId,
    };
  },

  // Team Selection & Economy
  getAvailableTeams: (championshipId: string) => 
    supabase.from('tcc_teams')
      .select('*, tcc_drivers(*), tcc_facilities(*)')
      .eq('championship_id', championshipId)
      .is('owner_id', null)
      .order('name'),

  getWalletBalance: async (championshipId: string) => {
    return await supabase.rpc('tcc_get_wallet_economy', { p_championship_id: championshipId }) as unknown as { data: WalletEconomyResponse | null; error: any };
  },

  getCashLedger: async (championshipId: string, limit = 10) => {
    return supabase.from('tcc_cash_ledger')
      .select('*')
      .eq('championship_id', championshipId)
      .order('created_at', { ascending: false })
      .limit(limit);
  },

  spendCash: async (championshipId: string, cashAmount: number, reason: string, metadata: Record<string, unknown> = {}) => {
    return supabase.rpc('tcc_spend_cash', {
      p_championship_id: championshipId,
      p_cash_amount: cashAmount,
      p_reason: reason,
      p_metadata: metadata,
    });
  },

  convertTokensToCash: async (championshipId: string, tokenAmount: number, weekNumber?: number) => {
    return supabase.rpc('tcc_convert_token_to_cash', {
      p_championship_id: championshipId,
      p_token_amount: tokenAmount,
      p_week_number: weekNumber ?? null
    });
  },

  purchaseTeam: async (teamId: string) => {
    return supabase.rpc('purchase_team', { team_id: teamId });
  },
  
  ensurePlayerProfile: async () => {
    return supabase.rpc('ensure_player_profile');
  },
  
  leaveChampionship: async (championshipId: string) => {
    return supabase.rpc('leave_championship', { p_championship_id: championshipId });
  },
  
  getFacilities: async (teamId: string) => {
    return supabase.from('tcc_facilities')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();
  },

  enqueueFacilityUpgrade: async (teamId: string, facility: string) => {
    return supabase.rpc('tcc_enqueue_facility_upgrade', { p_team_id: teamId, p_facility: facility });
  },

  completeReadyUpgrades: async (teamId: string) => {
    return supabase.rpc('tcc_complete_ready_upgrades', { p_team_id: teamId });
  }
};
