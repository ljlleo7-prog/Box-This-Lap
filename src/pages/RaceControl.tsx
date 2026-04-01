import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRaceStore } from '../store/raceStore';
import { useGameLoop } from '../hooks/useGameLoop';
import { LiveLeaderboard } from '../components/race/LiveLeaderboard';
import { TelemetryPanel } from '../components/race/TelemetryPanel';
import { CircularTrackMap } from '../components/CircularTrackMap';
import { AlertTriangle, ChevronLeft, Flag, MapPin, Play, Pause, CloudRain, Zap } from 'lucide-react';
import { TCC_API } from '../lib/tcc-api';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { TRACKS } from '../data/tracks';
import { clsx } from 'clsx';
import { DRIVERS } from '../data/initialData';
import { StrategyStint, TyreCompound, PreRaceSetup, PowerUnitPhilosophy, BatteryAllocationMode, ActiveAeroMode } from '../types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TyreModel, TYRE_COMPOUNDS } from '../engine/systems/TyreModel';
import { useChampionshipStore } from '../store/championshipStore';
import { supabase } from '../lib/supabase';

export const RaceControl: React.FC<{ devMode?: boolean }> = ({ devMode }) => {
  const { weekendId } = useParams<{ weekendId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(!!weekendId);
  const [error, setError] = useState<string | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
  const liveSyncInFlightRef = useRef(false);
  const hydratedLiveRevisionRef = useRef<number>(0);

  const {
    initRace,
    initRaceFromSnapshot,
    startRace,
    isPlaying,
    raceState,
    onlineDriverReadiness,
    onlinePitCrewReadiness,
    setTrack,
    selectedTrackId,
    toggleWeatherMode,
    fetchRealWeather,
    gameSpeed,
    setGameSpeed,
    setAuthoritativeSessionSpeed,
    updateStrategy,
    applyPreRaceSetup,
    isAuthoritative,
    authorityUserId,
    authorityRole,
    liveRevision,
    setLiveAuthority,
    applyLiveSnapshot,
    serializeLiveRaceState,
  } = useRaceStore();
  const teamId = useChampionshipStore((state) => state.teamId);
  const playerDriverIds = useMemo(() => DRIVERS.filter(driver => driver.team === 'McLaren').map(driver => driver.id), []);
  const [preRaceSetup, setPreRaceSetup] = useState<Record<string, PreRaceSetup & { tyreCompound: TyreCompound; fuelLoad: number; stints: StrategyStint[] }>>({});
  const hydratedPreRaceIdRef = useRef<string | null>(null);
  const [authoritativeSpeed, setAuthoritativeSpeed] = useState<1 | 2 | 5 | 10>(1);
  
  // Start game loop
  useGameLoop();
  
  // Initialize race logic
  useEffect(() => {
    if (devMode) {
        const requestedTrackId = searchParams.get('track');
        const initialTrackId = TRACKS.some(track => track.id === requestedTrackId) ? requestedTrackId! : TRACKS[0].id;
        setError(null);
        setLoading(true);
        setTrack(initialTrackId);
        setPendingTrackId(initialTrackId);
        return;
    }

    if (!weekendId) {
        setError("No Race ID provided. Access via Championship.");
        return;
    }

    const loadWeekend = async () => {
        try {
            const { data: weekend, error } = await TCC_API.getWeekend(weekendId);
            if (error) throw error;

            setTrack(weekend.track_id);

            const sessionSpeed = searchParams.get('session') === 'practice'
              ? (weekend.practice_speed_multiplier ?? weekend.speed_multiplier ?? 1)
              : searchParams.get('session') === 'quali'
                ? (weekend.quali_speed_multiplier ?? weekend.speed_multiplier ?? 1)
                : (weekend.race_speed_multiplier ?? weekend.speed_multiplier ?? 1);
            setAuthoritativeSpeed(sessionSpeed);
            setAuthoritativeSessionSpeed(sessionSpeed);

            const live = await TCC_API.getRaceLive(weekendId);
            if (live.snapshot?.race_state) {
              hydratedLiveRevisionRef.current = live.snapshot.revision;
              await initRaceFromSnapshot(live.snapshot, weekend.track_id);
              setLiveAuthority({
                authorityUserId: live.authorityUserId,
                authorityRole: live.authorityRole,
                isAuthoritative: live.isRequesterAuthority,
                revision: live.snapshot.revision,
                sessionType: live.sessionType,
                syncedAt: live.snapshot.updated_at,
              });
              setLoading(false);
              return;
            }

            setLiveAuthority({
              authorityUserId: live.authorityUserId,
              authorityRole: live.authorityRole,
              isAuthoritative: live.isRequesterAuthority,
              revision: live.snapshot?.revision ?? 0,
              sessionType: live.sessionType,
              syncedAt: live.snapshot?.updated_at ?? null,
            });
            setPendingTrackId(weekend.track_id);
        } catch (err) {
            console.error(err);
            setError("Failed to load race configuration.");
            setLoading(false);
        }
    };

    loadWeekend();
  }, [weekendId, devMode, searchParams, setTrack]);

  useEffect(() => {
      if (!pendingTrackId) return;
      const initialize = async () => {
        await initRace(pendingTrackId);
        setLoading(false);
        setPendingTrackId(null);
      };
      initialize();
  }, [pendingTrackId, initRace]);

  useEffect(() => {
      if (!weekendId || devMode || !raceState || !teamId) return;

      const syncLiveState = async () => {
        if (liveSyncInFlightRef.current) return;
        liveSyncInFlightRef.current = true;

        try {
          const live = await TCC_API.syncRaceLive({
            weekendId,
            teamId,
            isRunning: isPlaying,
            simTime: isPlaying ? raceState.elapsedTime : undefined,
            raceState: isPlaying && isAuthoritative ? serializeLiveRaceState() : undefined,
          });

          setLiveAuthority({
            authorityUserId: live.authorityUserId,
            authorityRole: live.authorityRole,
            isAuthoritative: live.isRequesterAuthority,
            revision: live.snapshot?.revision ?? liveRevision,
            sessionType: live.sessionType,
            syncedAt: live.snapshot?.updated_at ?? new Date().toISOString(),
          });

          if (live.snapshot && live.snapshot.revision > hydratedLiveRevisionRef.current) {
            const shouldHydrate = !live.isRequesterAuthority || live.snapshot.authority_user_id !== (await supabase.auth.getUser()).data.user?.id;
            if (shouldHydrate) {
              hydratedLiveRevisionRef.current = live.snapshot.revision;
              applyLiveSnapshot(live.snapshot);
            }
          }

          setLiveSyncError(null);
        } catch (err) {
          console.error('Failed to sync live race state', err);
          setLiveSyncError('Live sync disconnected');
        } finally {
          liveSyncInFlightRef.current = false;
        }
      };

      syncLiveState();
      const interval = window.setInterval(syncLiveState, 2000);
      return () => window.clearInterval(interval);
  }, [weekendId, devMode, raceState, teamId, isPlaying, isAuthoritative, serializeLiveRaceState, setLiveAuthority, liveRevision, applyLiveSnapshot]);

  // Real Weather Auto-Fetch
  useEffect(() => {
      if (raceState?.weatherMode === 'real') {
          fetchRealWeather(); // Initial fetch
          const interval = setInterval(fetchRealWeather, 60000); // Every minute
          return () => clearInterval(interval);
      }
  }, [raceState?.weatherMode, fetchRealWeather]);

  useEffect(() => {
      if (!raceState || raceState.status !== 'pre-race') {
          hydratedPreRaceIdRef.current = null;
          return;
      }
      if (hydratedPreRaceIdRef.current === raceState.id) return;

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
      setPreRaceSetup(nextSetup);
  }, [raceState, playerDriverIds]);

  const totalLaps = raceState?.totalLaps || 0;
  const track = TRACKS.find(t => t.id === selectedTrackId) || TRACKS[0];
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
    if (value === 'top_speed') return 'Top Speed';
    if (value === 'corner_focus') return 'Corner Focus';
    return 'Balanced';
  };

  const getBatteryLabel = (value: BatteryAllocationMode) => {
    if (value === 'conservative') return 'Conservative';
    if (value === 'attack') return 'Attack';
    return 'Balanced';
  };

  const getAeroLabel = (value: ActiveAeroMode) => {
    if (value === 'low_drag') return 'Low Drag';
    if (value === 'high_downforce') return 'High Downforce';
    return 'Balanced';
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

  const handleSpeedChange = (speed: 1 | 2 | 5 | 10) => {
    if (!isAuthoritative) return;
    setAuthoritativeSpeed(speed);
    setAuthoritativeSessionSpeed(speed);
    setGameSpeed(speed);
  };

  const handleStartRace = () => {
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
          applyPreRaceSetup(setups);
      }
      startRace();
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

  const estimatePitLoss = (baselineLapTimeSeconds: number) => {
      const pitDistance = track.pitLane.exitDistance >= track.pitLane.entryDistance
        ? track.pitLane.exitDistance - track.pitLane.entryDistance
        : (track.totalDistance - track.pitLane.entryDistance) + track.pitLane.exitDistance;
      const pitTransitTime = pitDistance > 0 ? pitDistance / track.pitLane.speedLimit : 0;
      const racingTransitTime = pitDistance > 0 ? pitDistance / Math.max(1, track.totalDistance / baselineLapTimeSeconds) : 0;
      return track.pitLane.stopTime + Math.max(0, pitTransitTime - racingTransitTime);
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
          stints.forEach((s, idx) => {
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
                  <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
                  <p className="text-gray-400 mb-6">{error}</p>
                  <GlassButton 
                    onClick={() => navigate('/')}
                    variant="secondary"
                    icon={<ChevronLeft size={18} />}
                  >
                      Return to Paddock
                  </GlassButton>
              </GlassCard>
          </div>
      );
  }

  if (loading) {
      return (
        <div className="h-full flex items-center justify-center">
             <div className="text-f1-red animate-pulse font-mono tracking-widest text-xl">INITIALIZING RACE SYSTEMS...</div>
        </div>
      );
  }

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-4 md:gap-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#121212]/40 backdrop-blur-md p-4 rounded-xl border border-white/5">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                title="Back"
            >
                <ChevronLeft size={24} />
            </button>
            <div>
                <h2 className="text-2xl font-black italic tracking-tighter text-white">RACE CONTROL</h2>
                <div className="text-xs md:text-sm text-gray-400 font-mono mt-1 flex items-center gap-3">
                    <span className="text-[#00FFFF]">{raceState ? `LAP ${raceState.currentLap}/${raceState.totalLaps}` : 'PRE-RACE'}</span>
                    <span>•</span>
                    <span>{raceState?.trackTemp.toFixed(1)}°C</span>
                    <span>•</span>
                    <span className="uppercase">{raceState?.weather}</span>
                    <span>•</span>
                    <span className={clsx(
                        "font-bold",
                        raceState?.safetyCar === 'red-flag' ? "text-red-500" :
                        raceState?.safetyCar === 'sc' ? "text-yellow-400" :
                        raceState?.safetyCar === 'vsc' ? "text-yellow-400" : "text-green-500"
                    )}>
                        {raceState?.safetyCar !== 'none' ? raceState?.safetyCar?.toUpperCase() : 'GREEN FLAG'}
                    </span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            {!devMode && weekendId && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-gray-300">
                <span className={clsx(
                  'h-2 w-2 rounded-full',
                  liveSyncError ? 'bg-red-400' : isAuthoritative ? 'bg-emerald-400' : 'bg-amber-400'
                )} />
                <span>{liveSyncError ? 'Sync offline' : isAuthoritative ? `${authorityRole ?? 'participant'} authority` : 'Following authority'}</span>
                <span className="text-gray-500">{authoritativeSpeed}x session</span>
                {authorityUserId && <span className="text-gray-500">{authorityUserId.slice(0, 8)}</span>}
              </div>
            )}
            {/* Weather Mode Toggle */}
            <button
                onClick={toggleWeatherMode}
                className={clsx(
                    "px-3 py-1.5 rounded text-xs font-bold uppercase border transition-all flex items-center gap-2",
                    raceState?.weatherMode === 'real' 
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                )}
                title="Toggle Real Weather API"
            >
                <CloudRain size={14} />
                {raceState?.weatherMode === 'real' ? 'LIVE WX' : 'SIM WX'}
            </button>

            {/* Speed Controls */}
            <div className="flex bg-black/40 rounded-lg overflow-hidden border border-white/10">
                {[1, 2, 5, 10].map(speed => (
                    <button
                        key={speed}
                        onClick={() => handleSpeedChange(speed as 1 | 2 | 5 | 10)}
                        disabled={!isAuthoritative}
                        className={clsx(
                            "px-3 py-1.5 text-xs font-mono font-bold transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed",
                            authoritativeSpeed === speed ? 'text-[#00FFFF] bg-[#00FFFF]/10' : 'text-gray-500'
                        )}
                    >
                        {speed}x
                    </button>
                ))}
            </div>

            <GlassButton 
              onClick={handleStartRace}
              disabled={isPlaying}
              variant={isPlaying ? 'secondary' : 'primary'}
              className="min-w-[140px]"
              icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
            >
              {isPlaying ? 'RACING' : 'START RACE'}
            </GlassButton>
        </div>
      </header>

      {raceState && raceState.safetyCar !== 'none' && (
        <div className={clsx(
            "w-full py-3 px-4 rounded-lg font-black text-center uppercase tracking-[0.2em] animate-pulse border",
            raceState.safetyCar === 'red-flag' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
        )}>
            {raceState.safetyCar === 'red-flag' ? 'RED FLAG - SESSION SUSPENDED' : 
             raceState.safetyCar === 'sc' ? 'SAFETY CAR DEPLOYED' : 'VIRTUAL SAFETY CAR'}
        </div>
      )}
      
      <div className="grid grid-cols-12 gap-4 md:gap-6 flex-1 min-h-0">
        {/* Left: Leaderboard */}
        <GlassCard className="col-span-12 md:col-span-3 !p-0 flex flex-col overflow-hidden h-[500px] md:h-auto">
            <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                    <Flag size={14} /> Leaderboard
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                <LiveLeaderboard />
            </div>
        </GlassCard>
        
        {/* Center: Track Map & Telemetry */}
        <div className="col-span-12 md:col-span-6 flex flex-col gap-4 md:gap-6 min-h-0">
            <GlassCard className="h-80 flex flex-col !p-0 relative overflow-hidden">
                 <div className="absolute top-4 left-4 z-10">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                        <MapPin size={14} /> Track Map
                    </h3>
                    <div className="text-white font-bold text-lg mt-1">
                        {TRACKS.find(t => t.id === selectedTrackId)?.name || selectedTrackId}
                    </div>
                 </div>
                 <div className="flex-1 flex items-center justify-center">
                    <CircularTrackMap />
                </div>
            </GlassCard>
             
             {/* Telemetry Panel */}
             <GlassCard className="flex-1 min-h-[300px] !p-0 flex flex-col">
                 <div className="p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                        <Zap size={14} /> Live Telemetry
                    </h3>
                 </div>
                 <div className="flex-1 p-4">
                    {raceState && <TelemetryPanel raceState={raceState} defaultDriverIds={playerDriverIds} telemetryMetadata={track.telemetry} />}
                 </div>
             </GlassCard>
        </div>
        
        {/* Right: Strategy & Driver Info */}
        <GlassCard className="col-span-12 md:col-span-3 !p-0 flex flex-col">
             <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono">Strategy & Drivers</h3>
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
                                    <div className="text-xs text-gray-500">McLaren • P{vehicle.position}</div>
                                </div>
                                <div className="text-xs text-gray-400">
                                    Gap: {vehicle.gapToLeader.toFixed(1)}s
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">Fuel</div>
                                    <div className="text-white font-bold">{vehicle.fuelLoad.toFixed(1)} kg</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">Tyre Wear</div>
                                    <div className="text-white font-bold">{Math.round(vehicle.tyreWear)}%</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">Tyre Temp</div>
                                    <div className="text-white font-bold">{vehicle.tyreTemp.toFixed(1)}°C</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">Temp Status</div>
                                    <div className="font-bold" style={{ color: getTempStatus(vehicle.tyreTemp, vehicle.tyreCompound).color }}>
                                      {getTempStatus(vehicle.tyreTemp, vehicle.tyreCompound).label}
                                    </div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">ERS</div>
                                    <div className="text-white font-bold">{Math.round(vehicle.ersLevel)}%</div>
                                </div>
                                <div className="bg-[#151515] rounded p-2 border border-white/5">
                                    <div className="text-gray-400">Tyres</div>
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
                                        <div className="text-gray-500 uppercase tracking-widest">Battery</div>
                                        <div className="mt-1 font-bold text-white">{getBatteryLabel(vehicle.batteryAllocationMode)}</div>
                                    </div>
                                    <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest">Aero</div>
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
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Fuel & Pace</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'conservative', label: 'SAVE' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'aggressive', label: 'PUSH' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'pace', option.value)}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold",
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
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">ERS Strategy</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'harvest', label: 'HARV' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'deploy', label: 'DEP' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'ers', option.value)}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold",
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
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Racing Line</div>
                                <div className="grid grid-cols-3 gap-2 text-[10px]">
                                    {[
                                        { value: 'defend', label: 'DEF' },
                                        { value: 'balanced', label: 'BAL' },
                                        { value: 'attack', label: 'ATT' }
                                    ].map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => updateStrategy(id, 'line', option.value)}
                                            className={clsx(
                                                "py-1 rounded border transition-colors font-bold",
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
                                <div className="text-gray-400 uppercase tracking-widest text-[10px]">Pitstop</div>
                                <button
                                    onClick={() => updateStrategy(id, 'pit', !vehicle.boxThisLap)}
                                    className={clsx(
                                        "px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest",
                                        vehicle.boxThisLap
                                            ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                                            : "bg-black/30 text-gray-400 border-white/10 hover:text-white"
                                    )}
                                >
                                    {vehicle.boxThisLap ? 'Boxing' : 'Box This Lap'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
      </div>

      {raceState?.status === 'pre-race' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest">Pre-Race Setup</div>
                <div className="text-2xl font-black italic tracking-tight text-white">Strategy Planner</div>
              </div>
              <GlassButton
                onClick={handleStartRace}
                variant="primary"
                icon={<Play size={16} />}
              >
                Start Race
              </GlassButton>
            </div>

            {onlinePitCrewReadiness && (
              <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Online Pit Crew Readiness</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded border border-white/10 bg-black/30 px-3 py-3 text-gray-300">
                    <span className="block text-gray-500 uppercase tracking-widest mb-1">Pit Stop Error Rate</span>
                    <div className="font-bold text-white">{onlinePitCrewReadiness.pitStopErrorRate.toFixed(1)}%</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 px-3 py-3 text-gray-300">
                    <span className="block text-gray-500 uppercase tracking-widest mb-1">Pit Stop Speed Bonus</span>
                    <div className="font-bold text-white">+{onlinePitCrewReadiness.pitStopSpeedBonus.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {playerDriverIds.map(id => {
                const setup = preRaceSetup[id];
                const driver = DRIVERS.find(d => d.id === id);
                if (!setup || !driver) return null;
                const normalizedStints = normalizeStints(setup.stints);
                const wearSeries = buildWearSeries(normalizedStints);
                const plannedDryRuleStatus = getPlannedDryRuleStatus(normalizedStints);
                const theoreticalRace = buildTheoreticalRaceTime(normalizedStints);
                const readiness = onlineDriverReadiness[id];
                return (
                  <div key={id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold" style={{ color: driver.color }}>{driver.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">{driver.team}</div>
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Laps {totalLaps}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">PU Philosophy</div>
                        <select
                          value={setup.powerUnitPhilosophy ?? 'balanced'}
                          onChange={(event) => setPreRaceSetup(prev => ({ ...prev, [id]: { ...prev[id], powerUnitPhilosophy: event.target.value as PowerUnitPhilosophy } }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        >
                          <option value="top_speed">Top Speed</option>
                          <option value="balanced">Balanced</option>
                          <option value="corner_focus">Corner Focus</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Battery Allocation</div>
                        <select
                          value={setup.batteryAllocationMode ?? 'balanced'}
                          onChange={(event) => setPreRaceSetup(prev => ({ ...prev, [id]: { ...prev[id], batteryAllocationMode: event.target.value as BatteryAllocationMode } }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        >
                          <option value="conservative">Conservative</option>
                          <option value="balanced">Balanced</option>
                          <option value="attack">Attack</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Active Aero</div>
                        <select
                          value={setup.activeAeroMode ?? 'balanced'}
                          onChange={(event) => setPreRaceSetup(prev => ({ ...prev, [id]: { ...prev[id], activeAeroMode: event.target.value as ActiveAeroMode } }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        >
                          <option value="low_drag">Low Drag</option>
                          <option value="balanced">Balanced</option>
                          <option value="high_downforce">High Downforce</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">PU effect</span>
                        {setup.powerUnitPhilosophy === 'top_speed' ? 'Higher terminal speed, weaker corner rotation.' : setup.powerUnitPhilosophy === 'corner_focus' ? 'Stronger cornering, more drag on straights.' : 'Neutral ICE/gear balance.'}
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">Battery effect</span>
                        {setup.batteryAllocationMode === 'attack' ? 'More deployment and lower regen reserve.' : setup.batteryAllocationMode === 'conservative' ? 'More harvesting, smaller attack bursts.' : 'Balanced deploy and recharge.'}
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">Aero effect</span>
                        {setup.activeAeroMode === 'low_drag' ? 'Better straight-line speed, less loaded in turns.' : setup.activeAeroMode === 'high_downforce' ? 'More grip in corners, slower at vmax.' : 'Neutral aero platform.'}
                      </div>
                    </div>

                    {readiness ? (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest">Training Readiness</div>
                          <div className="text-[10px] text-gray-400">Strength {Math.round(readiness.strength)}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-gray-400 uppercase tracking-widest">Confidence</span>
                              <span className="text-gray-300">{Math.round(readiness.morale)}%</span>
                            </div>
                            <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                              <div
                                className="h-full transition-all duration-300"
                                style={{
                                  width: `${readiness.morale}%`,
                                  backgroundColor: getConfidenceBarColor(readiness.morale)
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-gray-400 uppercase tracking-widest">Focus</span>
                              <span className="text-gray-300">{Math.round(readiness.concentration)}%</span>
                            </div>
                            <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                              <div
                                className="h-full transition-all duration-300"
                                style={{
                                  width: `${readiness.concentration}%`,
                                  backgroundColor: getFocusBarColor(readiness.concentration)
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                          <span className="text-gray-400">Fatigue {Math.round(readiness.fatigue)}%</span>
                          <span className={clsx('font-bold', getWearyColor(readiness.wearyState))}>{readiness.wearyState}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                        No online training sync data for this driver.
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Starting Tyres</div>
                        <select
                          value={setup.tyreCompound}
                          onChange={(event) => setPreRaceSetup(prev => ({ ...prev, [id]: { ...prev[id], tyreCompound: event.target.value as TyreCompound } }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        >
                          <option value="soft">Soft</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Fuel (L)</div>
                        <input
                          type="number"
                          min={0}
                          max={150}
                          step={0.1}
                          value={setup.fuelLoad}
                          onChange={(event) => setPreRaceSetup(prev => ({ ...prev, [id]: { ...prev[id], fuelLoad: Number(event.target.value) } }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Pit Window Start</div>
                        <input
                          type="number"
                          min={1}
                          max={totalLaps}
                          step={1}
                          value={setup.pitWindowStart ?? ''}
                          onChange={(event) => setPreRaceSetup(prev => ({
                            ...prev,
                            [id]: {
                              ...prev[id],
                              pitWindowStart: event.target.value === '' ? undefined : Number(event.target.value)
                            }
                          }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Pit Window End</div>
                        <input
                          type="number"
                          min={1}
                          max={totalLaps}
                          step={1}
                          value={setup.pitWindowEnd ?? ''}
                          onChange={(event) => setPreRaceSetup(prev => ({
                            ...prev,
                            [id]: {
                              ...prev[id],
                              pitWindowEnd: event.target.value === '' ? undefined : Number(event.target.value)
                            }
                          }))}
                          className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                        />
                      </div>
                    </div>

                    <div className={clsx(
                      'rounded border px-3 py-2 text-[10px] font-bold uppercase tracking-widest',
                      plannedDryRuleStatus.tone
                    )}>
                      {plannedDryRuleStatus.label}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">Theoretical time</span>
                        <div className="font-bold text-white text-xs">{formatRaceTime(theoreticalRace.totalSeconds)}</div>
                        <div className="mt-1 text-[9px] text-gray-500">Grip-based stint estimate</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">Pit loss</span>
                        <div className="font-bold text-white text-xs">+{theoreticalRace.pitLossSeconds.toFixed(1)}s</div>
                        <div className="mt-1 text-[9px] text-gray-500">× {theoreticalRace.pitStops} stop{theoreticalRace.pitStops === 1 ? '' : 's'}</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                        <span className="block text-gray-500 uppercase tracking-widest mb-1">Baseline lap</span>
                        <div className="font-bold text-white text-xs">{theoreticalRace.baselineLapTimeSeconds.toFixed(2)}s</div>
                        <div className="mt-1 text-[9px] text-gray-500">Before grip loss</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Stints</div>
                        <button
                          onClick={() => setPreRaceSetup(prev => {
                            const current = prev[id].stints;
                            if (current.length >= 4) return prev;
                            const lastEnd = current[current.length - 1]?.endLap || Math.max(1, Math.floor(totalLaps / 2));
                            const nextEnd = Math.min(totalLaps, lastEnd + Math.max(1, Math.floor(totalLaps / 6)));
                            const fallbackCompound = current[current.length - 1]?.compound ?? prev[id].tyreCompound;
                            const nextStints: StrategyStint[] = [
                              ...current,
                              { compound: fallbackCompound, startLap: lastEnd, endLap: nextEnd }
                            ];
                            return { ...prev, [id]: { ...prev[id], stints: normalizeStints(nextStints) } };
                          })}
                          className="px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-widest bg-black/40 text-gray-400 border-white/10 hover:text-white"
                        >
                          Add Stint
                        </button>
                      </div>
                      <div className="space-y-2">
                        {setup.stints.map((stint, index) => (
                          <div key={`${id}-stint-${index}`} className="space-y-1">
                            <div className="grid grid-cols-12 gap-2 items-center text-xs">
                              <div className="col-span-4">
                                <select
                                  value={stint.compound}
                                  onChange={(event) => setPreRaceSetup(prev => {
                                    const next = [...prev[id].stints];
                                    next[index] = { ...next[index], compound: event.target.value as TyreCompound };
                                    return { ...prev, [id]: { ...prev[id], stints: normalizeStints(next) } };
                                  })}
                                  className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                                >
                                  <option value="soft">Soft</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                              </div>
                              <div className="col-span-3">
                                <input
                                  type="number"
                                  min={1}
                                  max={totalLaps}
                                  step={1}
                                  value={stint.endLap}
                                  onChange={(event) => setPreRaceSetup(prev => {
                                    const value = event.target.valueAsNumber;
                                    if (Number.isNaN(value)) return prev;
                                    const next = [...prev[id].stints];
                                    next[index] = { ...next[index], endLap: value };
                                    return { ...prev, [id]: { ...prev[id], stints: normalizeStints(next) } };
                                  })}
                                  className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                                />
                              </div>
                              <div className="col-span-3 text-[10px] text-gray-400 uppercase tracking-widest">
                                {formatRaceTime(theoreticalRace.stintTimes[index] ?? 0)}
                              </div>
                              <div className="col-span-2 flex justify-end">
                                <button
                                  onClick={() => setPreRaceSetup(prev => {
                                    const next = prev[id].stints.filter((_, i) => i !== index);
                                    return { ...prev, [id]: { ...prev[id], stints: normalizeStints(next) } };
                                  })}
                                  className="px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-widest bg-black/40 text-gray-400 border-white/10 hover:text-white"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            {getStintWarning(normalizeStints(setup.stints), index) && (
                              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                                {getStintWarning(normalizeStints(setup.stints), index)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Tyre Degradation</div>
                      <div className="h-32 bg-[#111] border border-white/10 rounded-lg p-2">
                        {wearSeries.length > 0 && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={wearSeries}>
                              <XAxis dataKey="lap" tick={{ fill: '#6b7280', fontSize: 10 }} />
                              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }}
                                formatter={(value: number | string) => [`${Number(value).toFixed(1)}%`, 'Wear']}
                              />
                              {setup.stints.map((stint, index) => (
                                <Line
                                  key={`line-${index}`}
                                  type="monotone"
                                  dataKey={`stint-${index}`}
                                  stroke={compoundColor[stint.compound]}
                                  strokeWidth={2}
                                  dot={false}
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
