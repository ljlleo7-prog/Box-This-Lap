import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRaceStore } from '../store/raceStore';
import { useGameLoop } from '../hooks/useGameLoop';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { TRACKS } from '../data/tracks';
import { clsx } from 'clsx';
import { DRIVERS } from '../data/initialData';
import { StrategyStint, TyreCompound, PreRaceSetup, PowerUnitPhilosophy, BatteryAllocationMode, ActiveAeroMode } from '../types';
import { TyreModel, TYRE_COMPOUNDS } from '../engine/systems/TyreModel';
import { TCC_API } from '../lib/tcc-api';
import { resolveStaticDriverIdsForTeam } from '../lib/onlineTrainingEffects';
import { useChampionshipStore } from '../store/championshipStore';
import { useI18n } from '../i18n/I18nProvider';
import { useRaceWeekendController } from '../hooks/useRaceWeekendController';
import { useWeekendSetupController } from '../hooks/useWeekendSetupController';
import { WeekendSessionHeader } from '../components/weekend/WeekendSessionHeader';
import { RaceWeekendShell } from '../components/weekend/RaceWeekendShell';
import { WeekendSetupPlannerModal, type WeekendPlannerSetup } from '../components/weekend/WeekendSetupPlannerModal';
import { WeekendTimedSessionControl } from './PracticeQualiDev';
import { PostRaceResultsScene } from '../components/race/PostRaceResultsScene';

export const RaceControl: React.FC<{ devMode?: boolean }> = ({ devMode }) => {
  const { t } = useI18n();
  const { weekendId } = useParams<{ weekendId: string }>();
  const navigate = useNavigate();
  const { loading, error, liveSyncError, sessionType } = useRaceWeekendController(weekendId, devMode);
  const { hydratedSetup, saveSetup, parcFermeState, mechanicalLocked } = useWeekendSetupController(weekendId, sessionType);

  const {
    startCurrentSession,
    pauseCurrentSession,
    isPlaying,
    raceState,
    sessionSummaries,
    onlineDriverReadiness,
    onlinePitCrewReadiness,
    selectedTrackId,
    toggleWeatherMode,
    updateStrategy,
    applySessionSetup,
    isAuthoritative,
    authorityUserId,
    authorityUsername,
    authorityRole,
  } = useRaceStore();
  const teamId = useChampionshipStore((state) => state.teamId);
  const teamName = useChampionshipStore((state) => state.teamName);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const championshipMode = useChampionshipStore((state) => state.mode);
  const activeChampionship = useChampionshipStore((state) => state.activeChampionship);
  const teamStateById = useChampionshipStore((state) => state.teamStateById);
  const driverStandings = useChampionshipStore((state) => state.driverStandings);
  const constructorStandings = useChampionshipStore((state) => state.constructorStandings);
  const resolvedPlayerTeam = useMemo(() => {
    if (championshipMode === 'local') {
      return activeChampionship?.teams.find((team) => team.teamId === activeChampionship.selectedTeamId)?.teamName ?? teamName ?? null;
    }
    return teamName ?? null;
  }, [activeChampionship, championshipMode, teamName]);
  const [onlineTeamDrivers, setOnlineTeamDrivers] = useState<Array<{ name?: string | null }>>([]);
  const playerDriverIds = useMemo(
    () => resolveStaticDriverIdsForTeam(resolvedPlayerTeam, onlineTeamDrivers),
    [resolvedPlayerTeam, onlineTeamDrivers]
  );
  const playerTeamLabel = resolvedPlayerTeam ?? 'Player Team';
  const canControlDrivers = championshipMode === 'local' ? playerDriverIds.length > 0 : Boolean(teamId && playerDriverIds.length > 0);
  const canControlSession = Boolean(isAuthoritative);
  const [preRaceSetup, setPreRaceSetup] = useState<Record<string, WeekendPlannerSetup>>({});
  const [isCompletingRace, setIsCompletingRace] = useState(false);
  const [isPostRaceSceneOpen, setIsPostRaceSceneOpen] = useState(false);
  const hydratedPreRaceIdRef = useRef<string | null>(null);
  const authoritativeSpeed = useRaceStore((state) => state.authoritativeSessionSpeed as 1 | 2 | 5 | 10);

  useGameLoop();

  useEffect(() => {
    let isActive = true;

    if (championshipMode !== 'online' || !championshipId) {
      setOnlineTeamDrivers([]);
      return () => {
        isActive = false;
      };
    }

    const loadOnlineTeamDrivers = async () => {
      try {
        const { data } = await TCC_API.getMyTeam(championshipId);
        if (!isActive) return;
        setOnlineTeamDrivers((data?.tcc_drivers ?? []).slice(0, 2));
      } catch (error) {
        console.error('Failed to load online race team drivers', error);
        if (isActive) setOnlineTeamDrivers([]);
      }
    };

    void loadOnlineTeamDrivers();
    return () => {
      isActive = false;
    };
  }, [championshipId, championshipMode]);

  useEffect(() => {
    if (devMode || !weekendId || !teamId || sessionType !== 'race' || raceState?.status !== 'finished' || isCompletingRace || !isPostRaceSceneOpen) {
      return;
    }

    if (!championshipId || championshipMode !== 'online') return;

    let cancelled = false;
    const loadStandingsPreview = async () => {
      try {
        const standings = await TCC_API.getChampionshipStandings(championshipId);
        if (cancelled) return;
        useChampionshipStore.getState().setDriverStandings(standings.driverStandings);
        useChampionshipStore.getState().setConstructorStandings(standings.constructorStandings);
      } catch (error) {
        console.error('Failed to load championship standings preview', error);
      }
    };

    void loadStandingsPreview();
    return () => {
      cancelled = true;
    };
  }, [championshipId, championshipMode, devMode, isCompletingRace, isPostRaceSceneOpen, raceState?.status, sessionType, teamId, weekendId]);

  const handleEndWeekendFromScene = async () => {
    if (!weekendId || sessionType !== 'race') return;
    const summary = sessionSummaries.race;
    if (!summary?.completed) return;

    if (devMode || !teamId) {
      navigate('/championships');
      return;
    }

    setIsCompletingRace(true);
    try {
      await TCC_API.completeInteractiveSession(weekendId, teamId, 'race', summary);
      navigate('/championships');
    } catch (error) {
      console.error('Failed to complete live race session', error);
    } finally {
      setIsCompletingRace(false);
    }
  };

  useEffect(() => {
    if (raceState?.status === 'finished' && sessionSummaries.race?.completed) {
      setIsPostRaceSceneOpen(true);
    }
  }, [raceState?.status, sessionSummaries.race?.completed]);

  useEffect(() => {
    if (raceState?.status !== 'finished') {
      setIsPostRaceSceneOpen(false);
    }
  }, [raceState?.status]);

  useEffect(() => {
    if (!raceState || raceState.status !== 'pre-race') {
      hydratedPreRaceIdRef.current = null;
      return;
    }

    if (!playerDriverIds.length) return;

    const hasHydratedSetup = Object.keys(hydratedSetup).length > 0;
    if (hydratedPreRaceIdRef.current === raceState.id && !hasHydratedSetup) {
      return;
    }

    const nextSetup: Record<string, PreRaceSetup & { tyreCompound: TyreCompound; fuelLoad: number; stints: StrategyStint[] }> = {};
    playerDriverIds.forEach(id => {
      const vehicle = raceState.vehicles.find(v => v.driverId === id);
      if (!vehicle) return;
      nextSetup[id] = {
        tyreCompound: vehicle.tyreCompound,
        fuelLoad: vehicle.fuelLoad,
        pitWindowStart: typeof vehicle.pitWindowStart === 'number' ? vehicle.pitWindowStart : undefined,
        pitWindowEnd: typeof vehicle.pitWindowEnd === 'number' ? vehicle.pitWindowEnd : undefined,
        powerUnitPhilosophy: vehicle.powerUnitPhilosophy,
        batteryAllocationMode: vehicle.batteryAllocationMode,
        activeAeroMode: vehicle.activeAeroMode,
        stints: vehicle.strategyPlan?.stints?.length
          ? vehicle.strategyPlan.stints.map(stint => ({ ...stint }))
          : [{ compound: vehicle.tyreCompound, startLap: 0, endLap: raceState.totalLaps }]
      };
    });

    hydratedPreRaceIdRef.current = raceState.id;
    setPreRaceSetup(hasHydratedSetup ? { ...nextSetup, ...hydratedSetup } : nextSetup);
  }, [raceState, playerDriverIds, hydratedSetup]);

  const totalLaps = raceState?.totalLaps || 0;
  const track = TRACKS.find(t => t.id === selectedTrackId) || TRACKS[0];
  const timedSessionInitialPhase = sessionType === 'fp1' ? 'fp1' : 'q1';
  const compoundColor: Record<TyreCompound, string> = {
      soft: '#ef4444',
      medium: '#f59e0b',
      hard: '#e5e7eb',
      intermediate: '#22c55e',
      wet: '#3b82f6'
  };
  const getTempStatus = (temp: number, compound: TyreCompound) => {
    const [minTemp, maxTemp] = TYRE_COMPOUNDS[compound].optimalTempWindow;
    if (temp < minTemp - 6) return { label: 'Cold', color: '#60a5fa' };
    if (temp < minTemp) return { label: 'Cool', color: '#93c5fd' };
    if (temp <= maxTemp) return { label: 'Optimal', color: '#22c55e' };
    if (temp <= maxTemp + 6) return { label: 'Warm', color: '#f59e0b' };
    return { label: 'Hot', color: '#ef4444' };
  };

  const getPuLabel = (value: PowerUnitPhilosophy) => {
    if (value === 'top_speed') return t('raceControl.topSpeed');
    if (value === 'corner_focus') return t('raceControl.cornerFocus');
    return t('common.balanced');
  };

  const getBatteryLabel = (value: BatteryAllocationMode) => {
    if (value === 'conservative') return t('raceControl.conservative');
    if (value === 'attack') return t('raceControl.attack');
    return t('common.balanced');
  };

  const getAeroLabel = (value: ActiveAeroMode) => {
    if (value === 'low_drag') return t('raceControl.lowDrag');
    if (value === 'high_downforce') return t('raceControl.highDownforce');
    return t('common.balanced');
  };

  const getDryRuleStatus = (vehicle: { mandatoryDryCompoundsSatisfied: boolean; usedDryCompounds: string[] }, weather: string) => {
    if (weather !== 'dry') {
      return { label: 'Wet rules active', tone: 'text-blue-300 border-blue-500/30 bg-blue-500/10' };
    }
    if (vehicle.mandatoryDryCompoundsSatisfied) {
      return { label: 'Dry rule satisfied', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
    }
    return {
      label: `Needs second dry compound (${vehicle.usedDryCompounds.join('/') || 'none used'})`,
      tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10'
    };
  };

  const getPlannedDryRuleStatus = (stints: StrategyStint[]) => {
    const dryCompounds = [...new Set(stints
      .map(stint => stint.compound)
      .filter((compound): compound is 'soft' | 'medium' | 'hard' => ['soft', 'medium', 'hard'].includes(compound)))];

    if (dryCompounds.length >= 2) {
      return {
        legal: true,
        label: `Legal dry plan: ${dryCompounds.join(' + ')}`,
        tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
        missingCompound: null as null | TyreCompound
      };
    }

    const missingCompound = (['soft', 'medium', 'hard'] as const).find(compound => !dryCompounds.includes(compound)) ?? 'medium';
    return {
      legal: false,
      label: `Illegal dry finish risk: add ${missingCompound}`,
      tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
      missingCompound
    };
  };

  const getStintWarning = (stints: StrategyStint[], index: number) => {
    const planStatus = getPlannedDryRuleStatus(stints);
    if (planStatus.legal || index !== stints.length - 1) {
      return null;
    }
    return `Final stint should switch to ${planStatus.missingCompound}`;
  };

  const normalizeStints = (stints: StrategyStint[]) => {
    if (!totalLaps) return stints;
    const fallbackCompound = stints[0]?.compound ?? 'soft';
    const base = stints.length
      ? stints
      : [{ compound: fallbackCompound, startLap: 0, endLap: totalLaps }];
    const clamped = base.map(stint => ({
      ...stint,
      endLap: Math.min(totalLaps, Math.max(1, Math.round(stint.endLap || 0)))
    }));
    const sorted = [...clamped].sort((a, b) => a.endLap - b.endLap);
    const withStart = sorted.map((stint, index) => ({
      ...stint,
      startLap: index === 0 ? 0 : sorted[index - 1].endLap
    }));
    const filtered = withStart.filter(stint => stint.endLap > stint.startLap);
    if (!filtered.length) {
      return [{ compound: fallbackCompound, startLap: 0, endLap: totalLaps }];
    }
    return filtered.map((stint, index, list) => ({
      ...stint,
      endLap: index === list.length - 1 ? totalLaps : stint.endLap
    }));
  };

  const getWearyColor = (state: string) => {
    switch (state) {
      case 'fresh': return 'text-green-400';
      case 'tired': return 'text-yellow-400';
      case 'exhausted': return 'text-orange-400';
      case 'burnt-out': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getConfidenceBarColor = (value: number) => {
    if (value > 80) return '#4ade80';
    if (value < 50) return '#ef4444';
    return '#fbbf24';
  };

  const getFocusBarColor = (value: number) => {
    if (value > 80) return '#3b82f6';
    if (value < 50) return '#f97316';
    return '#60a5fa';
  };

  const updatePlannerSetup = (driverId: string, updater: (current: WeekendPlannerSetup) => WeekendPlannerSetup) => {
    setPreRaceSetup(prev => {
      const current = prev[driverId];
      if (!current) return prev;
      return {
        ...prev,
        [driverId]: updater(current),
      };
    });
  };

  const isLockedRaceControl = !devMode && sessionType === 'race';

  const handleSpeedChange = (_speed: 1 | 2 | 5 | 10) => {
    return;
  };

  const handleStartRace = () => {
      if (!canControlSession) return;
      if (Object.keys(preRaceSetup).length > 0) {
          const setups: Record<string, PreRaceSetup> = {};
          Object.entries(preRaceSetup).forEach(([driverId, setup]) => {
              const stints = normalizeStints(setup.stints);
              setups[driverId] = {
                  tyreCompound: setup.tyreCompound,
                  fuelLoad: setup.fuelLoad,
                  pitWindowStart: setup.pitWindowStart ?? undefined,
                  pitWindowEnd: setup.pitWindowEnd ?? undefined,
                  powerUnitPhilosophy: setup.powerUnitPhilosophy,
                  batteryAllocationMode: setup.batteryAllocationMode,
                  activeAeroMode: setup.activeAeroMode,
                  stints
              };
          });
          applySessionSetup(setups);
          if (weekendId && championshipMode === 'online' && teamId) {
            void saveSetup(setups as Record<string, PreRaceSetup & { tyreCompound: TyreCompound; fuelLoad: number; stints: StrategyStint[] }>);
          }
      }
      if (isPlaying) {
        pauseCurrentSession();
        return;
      }
      startCurrentSession();
  };

  const estimateBaselineLapTime = () => {
      const maxSpeeds = (track.sectors || [])
        .map(sector => sector.maxSpeed)
        .filter((speed): speed is number => typeof speed === 'number' && speed > 0);
      const averageSpeed = maxSpeeds.length
        ? maxSpeeds.reduce((sum, speed) => sum + speed, 0) / maxSpeeds.length
        : 70;
      const normalizedSpeed = Math.min(90, Math.max(40, averageSpeed));
      return track.totalDistance
        ? Math.min(130, Math.max(40, track.totalDistance / normalizedSpeed))
        : 90;
  };

  const pitStopSpeedBonus = useMemo(() => {
      if (onlinePitCrewReadiness) {
        return onlinePitCrewReadiness.pitStopSpeedBonus;
      }
      if (championshipMode === 'local' && teamId) {
        const pitCrew = teamStateById[teamId]?.crew.find((crew) => crew.department === 'pit_crew');
        return pitCrew?.speedBonus ?? 0;
      }
      return 0;
  }, [onlinePitCrewReadiness, championshipMode, teamId, teamStateById]);

  const estimatePitLoss = (baselineLapTimeSeconds: number) => {
      let stopDuration = 2.4;
      if (pitStopSpeedBonus > 0) {
        stopDuration *= Math.max(0.7, 1 - pitStopSpeedBonus / 100);
      }
      const fieldSize = Math.max(2, raceState?.vehicles.length ?? DRIVERS.length);
      const expectedPositionsLost = ((fieldSize - 1) * stopDuration) / Math.max(1, baselineLapTimeSeconds);
      const cappedPositionsLost = Math.min(3, expectedPositionsLost);
      const perPassRecoverySeconds = 0.8 + track.overtakingDifficulty * 1.4;
      const passLossSeconds = cappedPositionsLost * perPassRecoverySeconds;
      return stopDuration + passLossSeconds;
  };

  const formatRaceTime = (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return '—';
      const totalMilliseconds = Math.round(seconds * 1000);
      const minutes = Math.floor(totalMilliseconds / 60000);
      const secs = Math.floor((totalMilliseconds % 60000) / 1000);
      const milliseconds = totalMilliseconds % 1000;
      return `${minutes}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  const buildTheoreticalRaceTime = (stints: StrategyStint[]) => {
      if (!stints.length || !totalLaps) {
        return {
          totalSeconds: 0,
          baselineLapTimeSeconds: 0,
          pitLossSeconds: 0,
          pitStops: 0,
          stintTimes: [] as number[]
        };
      }

      const baselineLapTimeSeconds = estimateBaselineLapTime();
      const pitLossSeconds = estimatePitLoss(baselineLapTimeSeconds);
      let totalSeconds = 0;
      let currentWear = 0;
      let stintIndex = 0;
      const stintTimes = stints.map(() => 0);

      for (let lap = 1; lap <= totalLaps; lap++) {
          const stint = stints[stintIndex];
          if (!stint) break;

          const gripFactor = TyreModel.getGripFactor(stint.compound, currentWear, 0);
          const lapTime = baselineLapTimeSeconds / Math.max(0.1, gripFactor);
          totalSeconds += lapTime;
          stintTimes[stintIndex] += lapTime;

          const wearRate = TyreModel.getWearRate(stint.compound, track, 'balanced', currentWear);
          currentWear = Math.min(100, currentWear + wearRate * lapTime);

          if (lap >= stint.endLap && stintIndex < stints.length - 1) {
              totalSeconds += pitLossSeconds;
              stintIndex += 1;
              currentWear = 0;
          }
      }

      return {
        totalSeconds,
        baselineLapTimeSeconds,
        pitLossSeconds,
        pitStops: Math.max(0, stints.length - 1),
        stintTimes
      };
  };

  const buildWearSeries = (stints: StrategyStint[]) => {
      if (!stints.length || !totalLaps) return [];
      const lapTimeSeconds = estimateBaselineLapTime();
      const series: Array<Record<string, number | null>> = [];
      let wear = 0;
      let stintIndex = 0;
      let currentCompound = stints[0].compound;
      for (let lap = 1; lap <= totalLaps; lap++) {
          const stint = stints[stintIndex];
          if (stint && lap > stint.endLap && stintIndex < stints.length - 1) {
              stintIndex += 1;
              currentCompound = stints[stintIndex].compound;
              wear = 0;
          }
          const rate = TyreModel.getWearRate(currentCompound, track, 'balanced', wear);
          wear = Math.min(100, wear + rate * lapTimeSeconds);
          const point: Record<string, number | null> = { lap };
          stints.forEach((_, idx) => {
              point[`stint-${idx}`] = idx === stintIndex ? wear : null;
          });
          series.push(point);
      }
      return series;
  };

  if (error) {
      return (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <GlassCard className="max-w-md w-full text-center border-red-500/30">
                  <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
                  <h2 className="text-xl font-bold text-white mb-2">{t('raceControl.accessRestricted')}</h2>
                  <p className="text-gray-400 mb-6">{error}</p>
                  <GlassButton 
                    onClick={() => navigate('/')}
                    variant="secondary"
                    icon={<ChevronLeft size={18} />}
                  >
                      {t('raceControl.returnToPaddock')}
                  </GlassButton>
              </GlassCard>
          </div>
      );
  }

  if (loading) {
      return (
        <div className="h-full flex items-center justify-center">
             <div className="text-f1-red animate-pulse font-mono tracking-widest text-xl">{t('raceControl.initializingSystems')}</div>
        </div>
      );
  }

  if (sessionType !== 'race') {
    return (
      <WeekendTimedSessionControl
        weekendId={weekendId}
        initialTrackId={selectedTrackId}
        initialPhase={timedSessionInitialPhase}
        onBack={() => navigate(-1)}
        onOpenRaceSession={() => navigate(`/race/${weekendId}?session=race`)}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-4 md:gap-6 animate-in fade-in duration-500">
      {raceState && sessionSummaries.race?.completed && (
        <PostRaceResultsScene
          open={isPostRaceSceneOpen}
          trackName={track.name}
          summary={sessionSummaries.race}
          vehicles={raceState.vehicles}
          playerDriverIds={playerDriverIds}
          playerTeamLabel={playerTeamLabel}
          isCompleting={isCompletingRace}
          driverStandings={driverStandings}
          constructorStandings={constructorStandings}
          onEndWeekend={handleEndWeekendFromScene}
        />
      )}
      <WeekendSessionHeader
        raceState={raceState}
        sessionType={sessionType}
        weekendId={weekendId}
        devMode={devMode}
        liveSyncError={liveSyncError}
        isAuthoritative={isAuthoritative}
        authorityRole={authorityRole}
        authorityUserId={authorityUserId}
        authorityUsername={authorityUsername}
        authoritativeSpeed={authoritativeSpeed}
        isPlaying={isPlaying}
        onBack={() => navigate(-1)}
        onToggleWeather={toggleWeatherMode}
        onSpeedChange={handleSpeedChange}
        lockWeather={isLockedRaceControl}
        lockSpeed={isLockedRaceControl}
        lockStartPause={!canControlSession}
        onStartPause={handleStartRace}
      />

      {raceState && raceState.safetyCar !== 'none' && (
        <div className={clsx(
            "w-full py-3 px-4 rounded-lg font-black text-center uppercase tracking-[0.2em] animate-pulse border",
            raceState.safetyCar === 'red-flag' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
        )}>
            {raceState.safetyCar === 'red-flag' ? t('raceControl.redFlagSuspended') :
             raceState.safetyCar === 'sc' ? t('raceControl.safetyCarDeployed') : t('raceControl.virtualSafetyCar')}
        </div>
      )}
      
      <RaceWeekendShell
        raceState={raceState}
        trackName={track.name}
        telemetryMetadata={track.telemetry}
        playerDriverIds={playerDriverIds}
        rightPanel={(
          <>
             <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono">{t('raceControl.strategyAndDrivers')}</h3>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {raceState && playerDriverIds.map(id => {
                    const vehicle = raceState.vehicles.find(v => v.driverId === id);
                    const driver = DRIVERS.find(d => d.id === id);
                    if (!vehicle || !driver) return null;
                    const dryRuleStatus = getDryRuleStatus(vehicle, raceState.weather);
                    const livePlanStatus = getPlannedDryRuleStatus(vehicle.strategyPlan?.stints ?? []);

                    return (
                        <div key={id} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-bold" style={{ color: driver.color }}>{driver.name}</div>
                                    <div className="text-xs text-gray-500">{playerTeamLabel} • P{vehicle.position}</div>
                                </div>
                                <div className="text-xs text-gray-400">
                                    {t('raceControl.gap')}: {vehicle.gapToLeader.toFixed(1)}s
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">{t('raceControl.fuel')}</div>
                                    <div className="text-white font-bold">{vehicle.fuelLoad.toFixed(1)} kg</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">{t('raceControl.tyreWear')}</div>
                                    <div className="text-white font-bold">{Math.round(vehicle.tyreWear)}%</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">{t('raceControl.tyreTemp')}</div>
                                    <div className="text-white font-bold">{vehicle.tyreTemp.toFixed(1)}°C</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">{t('raceControl.tempStatus')}</div>
                                    <div className="font-bold" style={{ color: getTempStatus(vehicle.tyreTemp, vehicle.tyreCompound).color }}>
                                      {getTempStatus(vehicle.tyreTemp, vehicle.tyreCompound).label}
                                    </div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">ERS</div>
                                    <div className="text-white font-bold">{Math.round(vehicle.ersLevel)}%</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">{t('raceControl.tyres')}</div>
                                    <div className="text-white font-bold uppercase">{vehicle.tyreCompound}</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">2026 Setup</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest">PU</div>
                                        <div className="mt-1 font-bold text-white">{getPuLabel(vehicle.powerUnitPhilosophy)}</div>
                                    </div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest">{t('raceControl.battery')}</div>
                                        <div className="mt-1 font-bold text-white">{getBatteryLabel(vehicle.batteryAllocationMode)}</div>
                                    </div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest">{t('raceControl.aero')}</div>
                                        <div className="mt-1 font-bold text-white">{getAeroLabel(vehicle.activeAeroMode)}</div>
                                    </div>
                                </div>
                                <div className={clsx(
                                    'rounded border px-2 py-2 text-[10px] font-bold uppercase tracking-widest',
                                    dryRuleStatus.tone
                                )}>
                                    {dryRuleStatus.label}
                                </div>
                                {raceState.weather === 'dry' && !livePlanStatus.legal && (
                                    <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                                        Planned finish still illegal: {livePlanStatus.missingCompound} missing
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">{t('raceControl.fuelAndPace')}</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'conservative', label: 'SAVE' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'aggressive', label: 'PUSH' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'pace', option.value)}
                                            disabled={!canControlDrivers}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed",
                                                vehicle.paceMode === option.value
                                                    ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                                                    : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">{t('raceControl.ersStrategy')}</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'harvest', label: 'HARV' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'deploy', label: 'DEP' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'ers', option.value)}
                                            disabled={!canControlDrivers}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed",
                                                vehicle.ersMode === option.value
                                                    ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                                                    : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">{t('raceControl.racingLine')}</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'defend', label: 'DEF' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'attack', label: 'ATT' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'line', option.value)}
                                            disabled={!canControlDrivers}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed",
                                                vehicle.lineMode === option.value
                                                    ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                                                    : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                                <div className="text-gray-400 uppercase tracking-widest text-[10px]">{t('raceControl.pitstop')}</div>
                                <button
                                    onClick={() => updateStrategy(id, 'pit', !vehicle.boxThisLap)}
                                    disabled={!canControlDrivers}
                                    className={clsx(
                                        "px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed",
                                        vehicle.boxThisLap
                                            ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                                            : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                                    )}
                                >
                                    {vehicle.boxThisLap ? t('raceControl.boxing') : t('raceControl.boxThisLap')}
                                </button>
                            </div>
                        </div>
                    );
                })}
             </div>
          </>
        )}
      />

      <WeekendSetupPlannerModal
        open={raceState?.status === 'pre-race'}
        playerDriverIds={playerDriverIds}
        totalLaps={totalLaps}
        preRaceSetup={preRaceSetup}
        onlineDriverReadiness={onlineDriverReadiness}
        onlinePitCrewReadiness={onlinePitCrewReadiness}
        compoundColor={compoundColor}
        mechanicalLocked={mechanicalLocked}
        canStartRace={canControlSession}
        parcFermeMessage={parcFermeState?.isActive ? 'Stored parc fermé setup loaded for this session.' : null}
        onUpdateSetup={updatePlannerSetup}
        onStartRace={handleStartRace}
        normalizeStints={normalizeStints}
        buildWearSeries={buildWearSeries}
        buildTheoreticalRaceTime={buildTheoreticalRaceTime}
        getPlannedDryRuleStatus={getPlannedDryRuleStatus}
        getStintWarning={getStintWarning}
        getConfidenceBarColor={getConfidenceBarColor}
        getFocusBarColor={getFocusBarColor}
        getWearyColor={getWearyColor}
        formatRaceTime={formatRaceTime}
      />
    </div>
  );
};
