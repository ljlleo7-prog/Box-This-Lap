import { supabase } from './supabase';

export const TCC_API = {
  // Championship Management
  createChampionship: async (name: string) => {
    const { data, error } = await supabase.functions.invoke('create-championship', {
      body: { name }
    });
    if (error) throw error;
    return data;
  },

  // Scheduling
  createWeekend: async (params: {
    championshipId: string;
    trackId: string;
    speedMultiplier: number;
    hostLocalDatetime: string; // ISO string
    weatherMode: 'realistic' | 'preset';
    realismPreset: 'standard' | 'chaos';
  }) => {
    const { data, error } = await supabase.functions.invoke('create-weekend', {
      body: params
    });
    if (error) throw error;
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
    const { data, error } = await supabase.functions.invoke('run-practice', {
      body: { weekendId }
    });
    if (error) throw error;
    return data;
  },

  runQuali: async (weekendId: string) => {
    const { data, error } = await supabase.functions.invoke('run-quali', {
      body: { weekendId }
    });
    if (error) throw error;
    return data;
  },

  runRace: async (weekendId: string) => {
    const { data, error } = await supabase.functions.invoke('run-race', {
      body: { weekendId }
    });
    if (error) throw error;
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
      .select('*, tcc_quali_results(*), tcc_race_results(*)')
      .eq('id', weekendId)
      .single(),

  // Team Selection & Economy
  getAvailableTeams: (championshipId: string) => 
    supabase.from('tcc_teams')
      .select('*, tcc_drivers(*), tcc_facilities(*)')
      .eq('championship_id', championshipId)
      .is('owner_id', null)
      .order('name'),

  getWalletBalance: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'No user' };
    
    // Read-only: wallets table uses user_uid to reference auth.users(id)
    const { data, error } = await supabase
      .from('wallets')
      .select('token_balance')
      .eq('user_id', user.id)
      .maybeSingle();

    return { data, error };
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
