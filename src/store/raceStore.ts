import { create } from 'zustand';
import { SimulationEngine } from '../engine/simulation';
import { RaceState, TeamSpecs, PreRaceSetup } from '../types';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';
import { TEAM_TEMPLATES } from '../data/teams';
import { loadTeamSpecsScoped, loadSaveGame } from '../lib/localSaves';
import { useChampionshipStore } from './championshipStore';
import { getOnlineTrainingEffects, type OnlineTrainingDriverEffects, type OnlineTrainingPitCrewEffects } from '../lib/onlineTrainingEffects';
import type { LiveSessionType, LiveRaceSnapshot } from '../lib/tcc-api';

interface RaceStore {
  engine: SimulationEngine | null;
  raceState: RaceState | null;
  onlineDriverReadiness: Record<string, OnlineTrainingDriverEffects>;
  onlinePitCrewReadiness: OnlineTrainingPitCrewEffects | null;
  isPlaying: boolean;
  gameSpeed: number; // 1x, 2x, 5x, 10x
  authoritativeSessionSpeed: number;
  selectedTrackId: string;
  isAuthoritative: boolean;
  authorityUserId: string | null;
  authorityRole: 'host' | 'participant' | null;
  liveRevision: number;
  lastLiveSyncAt: string | null;
  liveSessionType: LiveSessionType | null;

  // Actions
  setTrack: (trackId: string) => void;
  initRace: (trackId?: string) => Promise<void>;
  initRaceFromSnapshot: (snapshot: LiveRaceSnapshot, trackId?: string) => Promise<void>;
  startRace: () => void;
  pauseRace: () => void;
  setGameSpeed: (speed: number) => void;
  setAuthoritativeSessionSpeed: (speed: number) => void;
  tick: (dt: number) => void;
  applyPreRaceSetup: (setups: Record<string, PreRaceSetup>) => void;
  setLiveAuthority: (payload: { authorityUserId: string | null; authorityRole: 'host' | 'participant' | null; isAuthoritative: boolean; revision?: number; sessionType?: LiveSessionType | null; syncedAt?: string | null; }) => void;
  applyLiveSnapshot: (snapshot: LiveRaceSnapshot) => void;
  serializeLiveRaceState: () => RaceState | null;

  // Player Actions
  updateStrategy: (driverId: string, type: 'pace' | 'ers' | 'pit' | 'line', value: any) => void;
  toggleWeatherMode: () => void;
  fetchRealWeather: () => Promise<void>;
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  engine: null,
  raceState: null,
  onlineDriverReadiness: {},
  onlinePitCrewReadiness: null,
  isPlaying: false,
  gameSpeed: 1,
  authoritativeSessionSpeed: 1,
  selectedTrackId: TRACKS[0].id,
  isAuthoritative: false,
  authorityUserId: null,
  authorityRole: null,
  liveRevision: 0,
  lastLiveSyncAt: null,
  liveSessionType: null,

  setTrack: (trackId) => set({ selectedTrackId: trackId }),

  initRace: async (trackId) => {
    const { selectedTrackId } = get();
    const { mode, championshipId, teamId, teamName } = useChampionshipStore.getState();
    const resolvedTrackId = trackId ?? selectedTrackId;
    const track = TRACKS.find(t => t.id === resolvedTrackId) || TRACKS[0];
    const seed = Date.now();
    const baseSpecsByTeam = TEAM_TEMPLATES.reduce<Record<string, TeamSpecs>>((acc, team) => {
      acc[team.name] = team.specs;
      return acc;
    }, {});

    const scopedSpecs = mode && championshipId && teamId
      ? loadTeamSpecsScoped({ mode, championshipId, teamId }, teamName ?? '')
      : null;
    const saveGame = loadSaveGame();

    const teamSpecsByTeam = scopedSpecs && teamName && baseSpecsByTeam[teamName]
      ? { ...baseSpecsByTeam, [teamName]: { ...baseSpecsByTeam[teamName], ...scopedSpecs } }
      : { ...baseSpecsByTeam };

    let drivers = DRIVERS.map((driver) => ({ ...driver }));
    let onlineDriverReadiness: Record<string, OnlineTrainingDriverEffects> = {};
    let onlinePitCrewReadiness: OnlineTrainingPitCrewEffects | null = null;

    if (mode === 'online' && championshipId && teamId && teamName) {
      try {
        const onlineEffects = await getOnlineTrainingEffects(championshipId, teamId, teamName);
        onlineDriverReadiness = onlineEffects.driverOverrides;
        onlinePitCrewReadiness = onlineEffects.pitCrew;

        drivers = drivers.map((driver) => {
          const override = onlineEffects.driverOverrides[driver.id];
          if (!override) return driver;

          return {
            ...driver,
            strength: override.strength,
            morale: override.morale,
          };
        });

        if (teamSpecsByTeam[teamName] && onlineEffects.pitCrew) {
          teamSpecsByTeam[teamName] = {
            ...teamSpecsByTeam[teamName],
            pitStopErrorRate: onlineEffects.pitCrew.pitStopErrorRate,
            pitStopSpeedBonus: onlineEffects.pitCrew.pitStopSpeedBonus,
          };
        }
      } catch (error) {
        console.error('Failed to apply online training effects', error);
      }
    }

    if (mode === 'local') {
      const championship = saveGame.championship;
      const playerTeam = championship?.teams.find(t => t.teamId === championship.selectedTeamId);
      const pitCrew = playerTeam?.crew.find(c => c.department === 'pit_crew');
      const selectedTeamName = playerTeam?.teamName;

      if (selectedTeamName && pitCrew && teamSpecsByTeam[selectedTeamName]) {
        teamSpecsByTeam[selectedTeamName] = {
          ...teamSpecsByTeam[selectedTeamName],
          pitStopErrorRate: pitCrew.errorRate ?? 50,
          pitStopSpeedBonus: pitCrew.speedBonus ?? 0,
        };
      }
    }
    const engine = new SimulationEngine(track, drivers, seed, teamSpecsByTeam, '2025');

    set({
      engine,
      raceState: engine.getState(),
      onlineDriverReadiness,
      onlinePitCrewReadiness,
      isPlaying: false,
      gameSpeed: 1,
      authoritativeSessionSpeed: 1,
      selectedTrackId: track.id,
      isAuthoritative: false,
      authorityUserId: null,
      authorityRole: null,
      liveRevision: 0,
      lastLiveSyncAt: null,
      liveSessionType: null,
    });
  },

  initRaceFromSnapshot: async (snapshot, trackId) => {
    await get().initRace(trackId ?? snapshot.race_state.trackId);
    const { engine } = get();
    if (!engine) return;

    engine.replaceState(snapshot.race_state);
    set({
      raceState: { ...snapshot.race_state },
      selectedTrackId: snapshot.race_state.trackId,
      liveRevision: snapshot.revision,
      lastLiveSyncAt: snapshot.updated_at,
      liveSessionType: snapshot.session_type,
      authorityUserId: snapshot.authority_user_id,
      authorityRole: snapshot.authority_role,
      isPlaying: snapshot.race_state.status === 'racing',
    });
  },
  
  startRace: () => {
    const { engine } = get();
    if (engine) {
        engine.startRace();
        set({ isPlaying: true });
    }
  },
  
  pauseRace: () => set({ isPlaying: false }),
  
  setGameSpeed: (speed) => set({ gameSpeed: speed }),
  setAuthoritativeSessionSpeed: (speed) => set({ authoritativeSessionSpeed: speed, gameSpeed: speed }),
  
  tick: (dt) => {
    const { engine, isPlaying, authoritativeSessionSpeed, fetchRealWeather, raceState } = get();
    if (!engine || !isPlaying) return;
    
    // Auto-fetch weather if in real mode (every 60s handled by simple timer check here?)
    // Actually, better to do it via a useEffect in component, or check elapsed time here.
    // Let's rely on component to call fetchRealWeather periodically for now, or add a timer.
    
    // Limit max dt per step to 0.1s for stability
    const stepSize = 0.1;
    let timeToSimulate = dt * authoritativeSessionSpeed;
    
    // Safety cap to prevent spiral of death if tab was inactive
    if (timeToSimulate > 2.0) timeToSimulate = 2.0;
    
    while (timeToSimulate > 0) {
        const step = Math.min(timeToSimulate, stepSize);
        engine.update(step);
        timeToSimulate -= step;
    }
    
    // Force new object reference for React reactivity
    set({ raceState: { ...engine.getState() } });
  },

  applyPreRaceSetup: (setups) => {
    const { engine } = get();
    if (engine) {
      engine.applyPreRaceSetup(setups);
      set({ raceState: { ...engine.getState() } });
    }
  },

  setLiveAuthority: ({ authorityUserId, authorityRole, isAuthoritative, revision, sessionType, syncedAt }) => set((state) => ({
    authorityUserId,
    authorityRole,
    isAuthoritative,
    liveRevision: typeof revision === 'number' ? revision : state.liveRevision,
    liveSessionType: sessionType === undefined ? state.liveSessionType : sessionType,
    lastLiveSyncAt: syncedAt === undefined ? state.lastLiveSyncAt : syncedAt,
  })),

  applyLiveSnapshot: (snapshot) => {
    const { engine, liveRevision } = get();
    if (!engine) return;
    if (snapshot.revision < liveRevision) return;

    engine.replaceState(snapshot.race_state);
    set({
      raceState: { ...snapshot.race_state },
      selectedTrackId: snapshot.race_state.trackId,
      liveRevision: snapshot.revision,
      lastLiveSyncAt: snapshot.updated_at,
      liveSessionType: snapshot.session_type,
      authorityUserId: snapshot.authority_user_id,
      authorityRole: snapshot.authority_role,
      isPlaying: snapshot.race_state.status === 'racing',
    });
  },

  serializeLiveRaceState: () => {
    const { raceState } = get();
    return raceState ? JSON.parse(JSON.stringify(raceState)) : null;
  },

  updateStrategy: (driverId, type, value) => {
      const { engine } = get();
      if (engine) {
          engine.updateStrategy(driverId, type, value);
          set({ raceState: { ...engine.getState() } });
      }
  },

  toggleWeatherMode: () => {
      const { engine, raceState } = get();
      if (engine && raceState) {
          const newMode = raceState.weatherMode === 'simulation' ? 'real' : 'simulation';
          engine.setWeatherMode(newMode);
          set({ raceState: { ...engine.getState() } });
      }
  },

  fetchRealWeather: async () => {
      const { engine, selectedTrackId } = get();
      if (!engine) return;

      const track = TRACKS.find(t => t.id === selectedTrackId);
      if (!track || !track.location) return;

      try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${track.location.lat}&longitude=${track.location.long}&current=temperature_2m,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m`;
          const res = await fetch(url);
          const data = await res.json();
          
          if (data.current) {
              engine.setRealWeatherData({
                  cloudCover: data.current.cloud_cover,
                  windSpeed: data.current.wind_speed_10m,
                  windDirection: data.current.wind_direction_10m,
                  temp: data.current.temperature_2m,
                  precipitation: data.current.precipitation
              });
              // Force update
              set({ raceState: { ...engine.getState() } });
          }
      } catch (e) {
          console.error("Failed to fetch weather", e);
      }
  }
}));
