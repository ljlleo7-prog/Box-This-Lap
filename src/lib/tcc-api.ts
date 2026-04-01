import { supabase } from './supabase';
import type { RaceState } from '../types';

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
  authority_role: 'host' | 'participant';
  revision: number;
  sim_time: number;
  race_state: RaceState;
  source_updated_at: string;
  updated_at: string;
  isFresh?: boolean;
};

export type RaceLiveResponse = {
  weekendId: string;
  sessionType: LiveSessionType;
  authorityUserId: string | null;
  authorityRole: 'host' | 'participant';
  authorityTeamId: string | null;
  isRequesterAuthority: boolean;
  snapshot: LiveRaceSnapshot | null;
};

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
    hostLocalDatetime: string; // ISO string
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
      p_host_local_datetime: params.hostLocalDatetime,
      p_weather_mode: params.weatherMode,
      p_realism_preset: params.realismPreset,
    });
    if (error) throw error;
    if (data?.success === false) throw new Error(data.message || 'Failed to create weekend');
    return data;
  },

  // Plan Submission
  submitPracticePlan: async (weekendId: string, teamId: string, preset: any) => {
    return supabase.from('tcc_plans_practice').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
  },

  submitQualiPlan: async (weekendId: string, teamId: string, preset: any) => {
    return supabase.from('tcc_plans_quali').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
  },

  submitRacePlan: async (weekendId: string, teamId: string, preset: any) => {
    return supabase.from('tcc_plans_race').upsert({
      weekend_id: weekendId,
      team_id: teamId,
      preset
    });
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

  getWeekend: (weekendId: string) =>
    supabase.from('tcc_weekends')
      .select('*, tcc_championships(created_by), tcc_quali_results(*), tcc_race_results(*)')
      .eq('id', weekendId)
      .single(),

  getChampionshipWeekends: (championshipId: string) =>
    supabase.from('tcc_weekends')
      .select('*')
      .eq('championship_id', championshipId)
      .order('round_number', { ascending: true }),

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
    raceState?: RaceState | null;
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
