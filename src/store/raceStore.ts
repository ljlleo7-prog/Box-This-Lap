import { create } from 'zustand';
import { SimulationEngine } from '../engine/simulation';
import { RaceState, TeamSpecs, PreRaceSetup, SessionSummary, SessionType, WeekendPhase, WeekendSessionState, WeekendSessionStatus, WeekendSessionType, WeekendState, type LiveRaceState, type LiveVehicleState } from '../types';
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
  weekendState: WeekendState | null;
  activeSessionType: SessionType;
  activeWeekendSessionType: WeekendSessionType;
  sessionSummaries: Partial<Record<SessionType, SessionSummary>>;
  onlineDriverReadiness: Record<string, OnlineTrainingDriverEffects>;
  onlinePitCrewReadiness: OnlineTrainingPitCrewEffects | null;
  isPlaying: boolean;
  gameSpeed: number; // 1x, 2x, 5x, 10x
  authoritativeSessionSpeed: number;
  selectedTrackId: string;
  isAuthoritative: boolean;
  authorityUserId: string | null;
  authorityUsername: string | null;
  authorityRole: 'host' | 'participant' | null;
  liveRevision: number;
  lastLiveSyncAt: string | null;
  liveSessionType: LiveSessionType | null;

  // Actions
  setTrack: (trackId: string) => void;
  setSessionType: (sessionType: SessionType) => void;
  initWeekend: (trackId?: string, sessionType?: SessionType) => Promise<void>;
  initRace: (trackId?: string) => Promise<void>;
  initRaceFromSnapshot: (snapshot: LiveRaceSnapshot, trackId?: string) => Promise<void>;
  startCurrentSession: () => void;
  startRace: () => void;
  pauseCurrentSession: () => void;
  pauseRace: () => void;
  advanceToNextSession: () => void;
  setGameSpeed: (speed: number) => void;
  setAuthoritativeSessionSpeed: (speed: number) => void;
  tickSession: (dt: number) => void;
  tick: (dt: number) => void;
  applySessionSetup: (setups: Record<string, PreRaceSetup>) => void;
  applyPreRaceSetup: (setups: Record<string, PreRaceSetup>) => void;
  setSessionSummary: (sessionType: SessionType, summary: SessionSummary) => void;
  setLiveAuthority: (payload: { authorityUserId: string | null; authorityUsername?: string | null; authorityRole: 'host' | 'participant' | null; isAuthoritative: boolean; revision?: number; sessionType?: LiveSessionType | null; syncedAt?: string | null; }) => void;
  applyLiveSnapshot: (snapshot: LiveRaceSnapshot) => void;
  serializeLiveRaceState: () => LiveRaceState | null;

  // Player Actions
  updateStrategy: (driverId: string, type: 'pace' | 'ers' | 'pit' | 'line', value: any) => void;
  toggleWeatherMode: () => void;
  fetchRealWeather: () => Promise<void>;
}

const SESSION_ORDER: SessionType[] = ['fp1', 'fp2', 'fp3', 'q1', 'q2', 'q3', 'race'];

const isLockedLiveRaceSession = (state: Pick<RaceStore, 'activeSessionType' | 'liveSessionType'>) => (
  state.activeSessionType === 'race' || state.liveSessionType === 'race'
);

const forceRealWeatherState = (raceState: RaceState | null) => {
  if (!raceState || raceState.weatherMode === 'real') return raceState;
  return { ...raceState, weatherMode: 'real' as const };
};

const toLiveVehicleState = (vehicle: RaceState['vehicles'][number]): LiveVehicleState => ({
  ...vehicle,
  telemetry: {
    sampleInterval: vehicle.telemetry.sampleInterval,
    nextSampleDistance: vehicle.telemetry.nextSampleDistance,
  },
});

const toLiveRaceState = (raceState: RaceState): LiveRaceState => ({
  ...raceState,
  vehicles: raceState.vehicles.map(toLiveVehicleState),
});

const rehydrateVehicleState = (vehicle: LiveVehicleState): RaceState['vehicles'][number] => ({
  ...vehicle,
  telemetry: {
    sampleInterval: vehicle.telemetry.sampleInterval,
    nextSampleDistance: vehicle.telemetry.nextSampleDistance,
    currentLapSpeedTrace: vehicle.telemetry.currentLapSpeedTrace ?? [],
    lastLapSpeedTrace: vehicle.telemetry.lastLapSpeedTrace ?? [],
  },
});

const rehydrateLiveRaceState = (raceState: LiveRaceState): RaceState => ({
  ...raceState,
  vehicles: raceState.vehicles.map(rehydrateVehicleState),
});

const getWeekendPhaseForSession = (sessionType: SessionType): WeekendPhase => sessionType;

const getWeekendSessionType = (sessionType: SessionType): WeekendSessionType => {
  if (sessionType.startsWith('fp')) return 'practice';
  if (sessionType.startsWith('q')) return 'quali';
  return 'race';
};

const getSessionStatus = (raceState: RaceState | null, isPlaying: boolean): WeekendSessionStatus => {
  if (!raceState) return 'pending';
  if (raceState.status === 'finished') return 'completed';
  if (isPlaying || raceState.status === 'racing') return 'running';
  if (raceState.status === 'pre-race') return 'ready';
  return 'pending';
};

const buildWeekendSessionState = (sessionType: SessionType, raceState: RaceState | null, isPlaying: boolean, summary?: SessionSummary): WeekendSessionState => ({
  sessionType,
  weekendSessionType: getWeekendSessionType(sessionType),
  status: summary?.completed ? 'completed' : getSessionStatus(raceState, isPlaying),
  elapsedTime: raceState?.elapsedTime ?? 0,
  targetLaps: sessionType === 'race' ? raceState?.totalLaps : undefined,
  summary,
});

const buildWeekendState = (trackId: string, sessionType: SessionType, raceState: RaceState | null, isPlaying: boolean, sessionSummaries: Partial<Record<SessionType, SessionSummary>>): WeekendState => ({
  trackId,
  currentPhase: getWeekendPhaseForSession(sessionType),
  activeSession: buildWeekendSessionState(sessionType, raceState, isPlaying, sessionSummaries[sessionType]),
  sessions: SESSION_ORDER.map((entry) => buildWeekendSessionState(entry, entry === sessionType ? raceState : null, entry === sessionType ? isPlaying : false, sessionSummaries[entry])),
  grid: sessionSummaries.q3?.classification?.map((entry) => entry.driverId) ?? sessionSummaries.q2?.classification?.map((entry) => entry.driverId) ?? sessionSummaries.q1?.classification?.map((entry) => entry.driverId),
});

export const useRaceStore = create<RaceStore>((set, get) => ({
  engine: null,
  raceState: null,
  weekendState: null,
  activeSessionType: 'race',
  activeWeekendSessionType: 'race',
  sessionSummaries: {},
  onlineDriverReadiness: {},
  onlinePitCrewReadiness: null,
  isPlaying: false,
  gameSpeed: 1,
  authoritativeSessionSpeed: 1,
  selectedTrackId: TRACKS[0].id,
  isAuthoritative: false,
  authorityUserId: null,
  authorityUsername: null,
  authorityRole: null,
  liveRevision: 0,
  lastLiveSyncAt: null,
  liveSessionType: null,

  setTrack: (trackId) => set({ selectedTrackId: trackId }),
  setSessionType: (sessionType) => set((state) => ({
    activeSessionType: sessionType,
    activeWeekendSessionType: getWeekendSessionType(sessionType),
    weekendState: buildWeekendState(state.selectedTrackId, sessionType, state.raceState, state.isPlaying, state.sessionSummaries),
  })),

  initWeekend: async (trackId, sessionType = 'race') => {
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
    if (sessionType === 'race') {
      engine.setWeatherMode('real');
    }
    const raceState = forceRealWeatherState(engine.getState());
    const sessionSummaries: Partial<Record<SessionType, SessionSummary>> = {};

    set({
      engine,
      raceState,
      weekendState: buildWeekendState(track.id, sessionType, raceState, false, sessionSummaries),
      activeSessionType: sessionType,
      activeWeekendSessionType: getWeekendSessionType(sessionType),
      sessionSummaries,
      onlineDriverReadiness,
      onlinePitCrewReadiness,
      isPlaying: false,
      gameSpeed: 1,
      authoritativeSessionSpeed: 1,
      selectedTrackId: track.id,
      isAuthoritative: false,
      authorityUserId: null,
      authorityUsername: null,
      authorityRole: null,
      liveRevision: 0,
      lastLiveSyncAt: null,
      liveSessionType: null,
    });
  },

  initRace: async (trackId) => {
    await get().initWeekend(trackId, 'race');
  },

  initRaceFromSnapshot: async (snapshot, trackId) => {
    const snapshotRaceState = rehydrateLiveRaceState(snapshot.race_state);
    await get().initWeekend(trackId ?? snapshotRaceState.trackId, snapshot.session_type === 'practice' ? 'fp1' : snapshot.session_type === 'quali' ? 'q1' : 'race');
    const { engine, activeSessionType, sessionSummaries } = get();
    if (!engine) return;

    const nextRaceState = forceRealWeatherState(snapshotRaceState) ?? snapshotRaceState;
    engine.replaceState(nextRaceState);
    set({
      raceState: nextRaceState,
      weekendState: buildWeekendState(nextRaceState.trackId, activeSessionType, nextRaceState, nextRaceState.status === 'racing', sessionSummaries),
      selectedTrackId: nextRaceState.trackId,
      liveRevision: snapshot.revision,
      lastLiveSyncAt: snapshot.updated_at,
      liveSessionType: snapshot.session_type,
      authorityUserId: snapshot.authority_user_id,
      authorityUsername: null,
      authorityRole: snapshot.authority_role,
      isPlaying: false,
    });
  },

  startCurrentSession: () => {
    const { engine, activeSessionType, sessionSummaries } = get();
    if (engine) {
      engine.startRace();
      const nextRaceState = { ...engine.getState() };
      set((state) => ({
        isPlaying: true,
        raceState: nextRaceState,
        weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, true, sessionSummaries),
      }));
    }
  },

  startRace: () => {
    get().startCurrentSession();
  },

  pauseCurrentSession: () => set((state) => ({
    isPlaying: false,
    weekendState: buildWeekendState(state.selectedTrackId, state.activeSessionType, state.raceState, false, state.sessionSummaries),
  })),

  pauseRace: () => get().pauseCurrentSession(),

  advanceToNextSession: () => set((state) => {
    const currentIndex = SESSION_ORDER.indexOf(state.activeSessionType);
    const nextSessionType = SESSION_ORDER[Math.min(SESSION_ORDER.length - 1, currentIndex + 1)] ?? state.activeSessionType;
    return {
      activeSessionType: nextSessionType,
      activeWeekendSessionType: getWeekendSessionType(nextSessionType),
      isPlaying: false,
      weekendState: buildWeekendState(state.selectedTrackId, nextSessionType, state.raceState, false, state.sessionSummaries),
    };
  }),

  setGameSpeed: (speed) => set((state) => {
    if (isLockedLiveRaceSession(state)) return {};
    return { gameSpeed: speed };
  }),
  setAuthoritativeSessionSpeed: (speed) => set(() => ({ authoritativeSessionSpeed: speed })),

  tickSession: (dt) => {
    const { engine, isPlaying, authoritativeSessionSpeed, activeSessionType, sessionSummaries, isAuthoritative, liveSessionType } = get();
    if (!engine || !isPlaying) return;
    if (liveSessionType === 'race' && !isAuthoritative) return;

    const stepSize = 0.1;
    let timeToSimulate = dt * authoritativeSessionSpeed;
    if (timeToSimulate > 2.0) timeToSimulate = 2.0;

    while (timeToSimulate > 0) {
        const step = Math.min(timeToSimulate, stepSize);
        engine.update(step);
        timeToSimulate -= step;
    }

    const nextRaceState = { ...engine.getState() };
    const summary = nextRaceState.status === 'finished'
      ? {
          sessionType: activeSessionType,
          completed: true,
          classification: [...nextRaceState.vehicles]
            .sort((a, b) => a.position - b.position)
            .map((vehicle) => ({
              driverId: vehicle.driverId,
              position: vehicle.position,
              timeOrGap: vehicle.position === 1 ? nextRaceState.elapsedTime : vehicle.gapToLeader,
              bestLapTime: Number.isFinite(vehicle.bestLapTime) ? vehicle.bestLapTime : null,
              lapsCompleted: vehicle.lapCount,
            })),
          notes: [],
          weather: nextRaceState.weather,
        } satisfies SessionSummary
      : sessionSummaries[activeSessionType];

    set((state) => ({
      raceState: nextRaceState,
      isPlaying: nextRaceState.status === 'racing',
      sessionSummaries: summary ? { ...state.sessionSummaries, [activeSessionType]: summary } : state.sessionSummaries,
      weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, nextRaceState.status === 'racing', summary ? { ...state.sessionSummaries, [activeSessionType]: summary } : state.sessionSummaries),
    }));
  },

  tick: (dt) => {
    get().tickSession(dt);
  },

  applySessionSetup: (setups) => {
    const { engine, activeSessionType, sessionSummaries } = get();
    if (engine) {
      engine.applyPreRaceSetup(setups);
      const nextRaceState = { ...engine.getState() };
      set((state) => ({
        raceState: nextRaceState,
        weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, state.isPlaying, sessionSummaries),
      }));
    }
  },

  applyPreRaceSetup: (setups) => {
    get().applySessionSetup(setups);
  },

  setSessionSummary: (sessionType, summary) => set((state) => ({
    sessionSummaries: { ...state.sessionSummaries, [sessionType]: summary },
    weekendState: buildWeekendState(state.selectedTrackId, state.activeSessionType, state.raceState, state.isPlaying, { ...state.sessionSummaries, [sessionType]: summary }),
  })),

  setLiveAuthority: ({ authorityUserId, authorityUsername, authorityRole, isAuthoritative, revision, sessionType, syncedAt }) => set((state) => ({
    authorityUserId,
    authorityUsername: authorityUsername === undefined ? state.authorityUsername : authorityUsername,
    authorityRole,
    isAuthoritative,
    liveRevision: typeof revision === 'number' ? revision : state.liveRevision,
    liveSessionType: sessionType === undefined ? state.liveSessionType : sessionType,
    lastLiveSyncAt: syncedAt === undefined ? state.lastLiveSyncAt : syncedAt,
  })),

  applyLiveSnapshot: (snapshot) => {
    const { engine, liveRevision, activeSessionType, sessionSummaries } = get();
    if (!engine) return;
    if (snapshot.revision < liveRevision) return;

    const snapshotRaceState = rehydrateLiveRaceState(snapshot.race_state);
    const nextRaceState = forceRealWeatherState(snapshotRaceState) ?? snapshotRaceState;
    engine.replaceState(nextRaceState);
    set({
      raceState: nextRaceState,
      weekendState: buildWeekendState(nextRaceState.trackId, activeSessionType, nextRaceState, false, sessionSummaries),
      selectedTrackId: nextRaceState.trackId,
      liveRevision: snapshot.revision,
      lastLiveSyncAt: snapshot.updated_at,
      liveSessionType: snapshot.session_type,
      authorityUserId: snapshot.authority_user_id,
      authorityUsername: null,
      authorityRole: snapshot.authority_role,
      isPlaying: false,
    });
  },

  serializeLiveRaceState: () => {
    const { raceState } = get();
    return raceState ? toLiveRaceState(raceState) : null;
  },

  updateStrategy: (driverId, type, value) => {
      const { engine, activeSessionType, sessionSummaries } = get();
      if (engine) {
          engine.updateStrategy(driverId, type, value);
          const nextRaceState = { ...engine.getState() };
          set((state) => ({
            raceState: nextRaceState,
            weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, state.isPlaying, sessionSummaries),
          }));
      }
  },

  toggleWeatherMode: () => {
      const { engine, raceState, activeSessionType, sessionSummaries, liveSessionType } = get();
      if (isLockedLiveRaceSession({ activeSessionType, liveSessionType })) return;
      if (engine && raceState) {
          const newMode = raceState.weatherMode === 'simulation' ? 'real' : 'simulation';
          engine.setWeatherMode(newMode);
          const nextRaceState = { ...engine.getState() };
          set((state) => ({
            raceState: nextRaceState,
            weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, state.isPlaying, sessionSummaries),
          }));
      }
  },

  fetchRealWeather: async () => {
      const { engine, selectedTrackId, activeSessionType, sessionSummaries } = get();
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
              const nextRaceState = { ...engine.getState() };
              set((state) => ({
                raceState: nextRaceState,
                weekendState: buildWeekendState(state.selectedTrackId, activeSessionType, nextRaceState, state.isPlaying, sessionSummaries),
              }));
          }
      } catch (e) {
          console.error("Failed to fetch weather", e);
      }
  }
}));
