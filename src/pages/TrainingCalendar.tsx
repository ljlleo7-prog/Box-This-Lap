import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSaveGame } from '../lib/localSaves';
import { DRIVERS } from '../data/initialData';
import type { OfflineDriverState, CrewState, DaySchedule, DriverActivity, PitCrewActivity } from '../types/championship';
import { processDriverSchedule, createEmptySchedule } from '../lib/driverDevelopment';
import { processPitCrewSchedule } from '../lib/crewDevelopment';
import { useChampionshipStore } from '../store/championshipStore';
import { TCC_API } from '../lib/tcc-api';
import { GlassCard } from '../components/ui/GlassCard';

const getRoundStartDate = (season: number, currentRound: number): Date => {
  const seasonStart = new Date(season, 2, 1);
  const start = new Date(seasonStart);
  start.setDate(seasonStart.getDate() + (currentRound - 1) * 14);
  return start;
};

const formatCalendarDate = (date: Date): { month: string; day: string; weekday: string } => ({
  month: date.toLocaleDateString(undefined, { month: 'short' }),
  day: date.toLocaleDateString(undefined, { day: 'numeric' }),
  weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
});

const ONLINE_RACE_DAYS = [12, 13, 14];

type TabType = 'driver1' | 'driver2' | 'pitcrew';

type OnlineDriverRecord = {
  id: string;
  name: string;
  morale?: number;
};

const buildDefaultOnlineDriverState = (driver: OnlineDriverRecord): OfflineDriverState => ({
  driverId: driver.id,
  morale: Math.round(driver.morale ?? 75),
  trust: 70,
  readiness: 80,
  confidence: 75,
  setupKnowledge: 50,
  fatigue: 0,
  xp: 0,
  level: 1,
  strength: 75,
  wearyState: 'fresh',
  trainingSchedule: createEmptySchedule(ONLINE_RACE_DAYS),
});

const buildDefaultOnlinePitCrewState = (): CrewState => ({
  department: 'pit_crew',
  level: 1,
  workload: 50,
  efficiency: 75,
  morale: 75,
  xp: 0,
  errorRate: 50,
  speedBonus: 0,
  trainingSchedule: createEmptySchedule(ONLINE_RACE_DAYS),
});

const getOnlineRound = (weekends: any[] | null | undefined): number => {
  if (!weekends || weekends.length === 0) return 1;
  const upcomingWeekend = weekends.find((weekend) => !['completed', 'race_complete', 'cancelled'].includes(weekend.status));
  if (upcomingWeekend?.round_number) return upcomingWeekend.round_number;
  return weekends[weekends.length - 1]?.round_number ? weekends[weekends.length - 1].round_number + 1 : 1;
};

export const TrainingCalendar = () => {
  const navigate = useNavigate();
  const mode = useChampionshipStore((state) => state.mode);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const teamId = useChampionshipStore((state) => state.teamId);
  const activeLocalChampionship = useChampionshipStore((state) => state.activeChampionship);
  const setActiveLocalContext = useChampionshipStore((state) => state.setActiveLocalContext);
  const [activeTab, setActiveTab] = useState<TabType>('driver1');
  const [driver1State, setDriver1State] = useState<OfflineDriverState | null>(null);
  const [driver2State, setDriver2State] = useState<OfflineDriverState | null>(null);
  const [pitCrewState, setPitCrewState] = useState<CrewState | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [season, setSeason] = useState(2026);
  const [onlineDrivers, setOnlineDrivers] = useState<OnlineDriverRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasHydratedScheduleRef = useRef(false);
  const lastSavedScheduleSnapshotRef = useRef<string>('');
  const autosaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      if (mode === 'online') {
        if (!championshipId || !teamId) {
          setDriver1State(null);
          setDriver2State(null);
          setPitCrewState(null);
          setOnlineDrivers([]);
          setLoading(false);
          return;
        }

        try {
          const [{ data: myTeam }, { data: weekends }, { data: plans }] = await Promise.all([
            TCC_API.getMyTeam(championshipId),
            TCC_API.getChampionshipWeekends(championshipId),
            TCC_API.getTeamTrainingPlans(championshipId, teamId, currentRound),
          ]);

          const resolvedRound = getOnlineRound(weekends);
          if (resolvedRound !== currentRound) {
            setCurrentRound(resolvedRound);
            const refreshedPlans = await TCC_API.getTeamTrainingPlans(championshipId, teamId, resolvedRound);
            const activePlans = refreshedPlans.data ?? [];
            const drivers = (myTeam?.tcc_drivers ?? []).slice(0, 2).map((driver: any) => ({
              id: driver.id,
              name: driver.name,
              morale: driver.morale,
            }));

            setOnlineDrivers(drivers);
            setDriver1State(drivers[0] ? {
              ...buildDefaultOnlineDriverState(drivers[0]),
              trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'driver' && plan.subject_id === drivers[0].id)?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
            } : null);
            setDriver2State(drivers[1] ? {
              ...buildDefaultOnlineDriverState(drivers[1]),
              trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'driver' && plan.subject_id === drivers[1].id)?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
            } : null);
            setPitCrewState({
              ...buildDefaultOnlinePitCrewState(),
              trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'pit_crew' && plan.subject_id === 'pit_crew')?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
            });
            setSeason(new Date().getFullYear());
            setLoading(false);
            return;
          }

          const activePlans = plans ?? [];
          const drivers = (myTeam?.tcc_drivers ?? []).slice(0, 2).map((driver: any) => ({
            id: driver.id,
            name: driver.name,
            morale: driver.morale,
          }));

          setOnlineDrivers(drivers);
          setDriver1State(drivers[0] ? {
            ...buildDefaultOnlineDriverState(drivers[0]),
            trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'driver' && plan.subject_id === drivers[0].id)?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
          } : null);
          setDriver2State(drivers[1] ? {
            ...buildDefaultOnlineDriverState(drivers[1]),
            trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'driver' && plan.subject_id === drivers[1].id)?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
          } : null);
          setPitCrewState({
            ...buildDefaultOnlinePitCrewState(),
            trainingSchedule: activePlans.find((plan: any) => plan.subject_type === 'pit_crew' && plan.subject_id === 'pit_crew')?.schedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
          });
          setSeason(new Date().getFullYear());
        } catch (error) {
          console.error('Failed to load online training calendar', error);
          setDriver1State(null);
          setDriver2State(null);
          setPitCrewState(null);
          setOnlineDrivers([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (mode === 'local') {
        const saveGame = loadSaveGame();
        const localChampionship = saveGame.championship ?? activeLocalChampionship;
        if (!localChampionship) {
          setLoading(false);
          navigate('/championships');
          return;
        }

        const playerTeam = localChampionship.teams.find(
          (t) => t.teamId === localChampionship.selectedTeamId
        );
        if (playerTeam) {
          setDriver1State(playerTeam.drivers[0] || null);
          setDriver2State(playerTeam.drivers[1] || null);
          setPitCrewState(playerTeam.crew.find((c) => c.department === 'pit_crew') || null);
          setCurrentRound(localChampionship.currentRound);
          setSeason(localChampionship.season);
          setLoading(false);
          return;
        }
      }

      setLoading(false);
      navigate('/championships');
    };

    loadData();
  }, [activeLocalChampionship, championshipId, currentRound, mode, navigate, teamId]);

  const getCurrentState = () => {
    if (activeTab === 'driver1') return driver1State;
    if (activeTab === 'driver2') return driver2State;
    return pitCrewState;
  };

  const getCurrentSchedule = (): DaySchedule[] => {
    const state = getCurrentState();
    return state?.trainingSchedule || [];
  };

  const handleSlotClick = (dayIndex: number, slot: 'am' | 'pm') => {
    const schedule = getCurrentSchedule();
    const day = schedule[dayIndex];

    if (day.isRaceDay) return;

    const currentActivity = slot === 'am' ? day.amActivity : day.pmActivity;
    const activities = activeTab === 'pitcrew'
      ? ['drills', 'exercise', 'chill']
      : ['simulation', 'exercise', 'chill'];

    const currentIndex = activities.indexOf(currentActivity);
    const nextActivity = activities[(currentIndex + 1) % activities.length];

    const updatedSchedule = [...schedule];
    if (slot === 'am') {
      updatedSchedule[dayIndex] = { ...day, amActivity: nextActivity as any };
    } else {
      updatedSchedule[dayIndex] = { ...day, pmActivity: nextActivity as any };
    }

    updateSchedule(updatedSchedule);
  };

  const updateSchedule = (newSchedule: DaySchedule[]) => {
    if (activeTab === 'driver1' && driver1State) {
      setDriver1State({ ...driver1State, trainingSchedule: newSchedule });
    } else if (activeTab === 'driver2' && driver2State) {
      setDriver2State({ ...driver2State, trainingSchedule: newSchedule });
    } else if (activeTab === 'pitcrew' && pitCrewState) {
      setPitCrewState({ ...pitCrewState, trainingSchedule: newSchedule });
    }
  };

  const persistSchedules = useCallback(async (showMessage: boolean): Promise<boolean> => {
    if (mode === 'local') {
      const saveGame = loadSaveGame();
      if (!saveGame.championship) return false;

      const playerTeam = saveGame.championship.teams.find(
        (t) => t.teamId === saveGame.championship!.selectedTeamId
      );
      if (!playerTeam) return false;

      if (driver1State) playerTeam.drivers[0] = driver1State;
      if (driver2State) playerTeam.drivers[1] = driver2State;
      if (pitCrewState) {
        const crewIndex = playerTeam.crew.findIndex((c) => c.department === 'pit_crew');
        if (crewIndex !== -1) playerTeam.crew[crewIndex] = pitCrewState;
      }

      saveGame.championship.updatedAt = new Date().toISOString();
      setActiveLocalContext(saveGame.championship);
      if (showMessage) alert('Schedule saved!');
      return true;
    }

    if (!championshipId || !teamId) return false;

    setSaving(true);
    try {
      const payload = [
        driver1State && onlineDrivers[0] ? {
          championship_id: championshipId,
          team_id: teamId,
          round_number: currentRound,
          subject_type: 'driver',
          subject_id: onlineDrivers[0].id,
          schedule: driver1State.trainingSchedule,
          updated_at: new Date().toISOString(),
        } : null,
        driver2State && onlineDrivers[1] ? {
          championship_id: championshipId,
          team_id: teamId,
          round_number: currentRound,
          subject_type: 'driver',
          subject_id: onlineDrivers[1].id,
          schedule: driver2State.trainingSchedule,
          updated_at: new Date().toISOString(),
        } : null,
        pitCrewState ? {
          championship_id: championshipId,
          team_id: teamId,
          round_number: currentRound,
          subject_type: 'pit_crew',
          subject_id: 'pit_crew',
          schedule: pitCrewState.trainingSchedule ?? createEmptySchedule(ONLINE_RACE_DAYS),
          updated_at: new Date().toISOString(),
        } : null,
      ].filter(Boolean);
      const { error } = await TCC_API.upsertTeamTrainingPlans(payload);
      if (error) throw error;
      if (showMessage) alert('Online training schedule saved!');
      return true;
    } catch (error) {
      console.error('Failed to save online training schedule', error);
      if (showMessage) alert('Failed to save training schedule');
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    championshipId,
    currentRound,
    driver1State,
    driver2State,
    mode,
    onlineDrivers,
    pitCrewState,
    setActiveLocalContext,
    teamId,
  ]);

  const handleSave = async () => {
    await persistSchedules(true);
  };

  const scheduleSnapshot = useMemo(
    () => JSON.stringify({
      mode,
      currentRound,
      driver1: driver1State?.trainingSchedule ?? null,
      driver2: driver2State?.trainingSchedule ?? null,
      pitCrew: pitCrewState?.trainingSchedule ?? null,
    }),
    [currentRound, driver1State?.trainingSchedule, driver2State?.trainingSchedule, mode, pitCrewState?.trainingSchedule]
  );

  useEffect(() => {
    if (loading) return;
    if (!driver1State && !driver2State && !pitCrewState) return;

    if (!hasHydratedScheduleRef.current) {
      hasHydratedScheduleRef.current = true;
      lastSavedScheduleSnapshotRef.current = scheduleSnapshot;
      return;
    }

    if (scheduleSnapshot === lastSavedScheduleSnapshotRef.current) return;

    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      void persistSchedules(false).then((saved) => {
        if (saved) {
          lastSavedScheduleSnapshotRef.current = scheduleSnapshot;
        }
      });
    }, 450);
  }, [driver1State, driver2State, loading, persistSchedules, pitCrewState, scheduleSnapshot]);

  useEffect(() => () => {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }
  }, []);

  const getActivityLabel = (activity: DriverActivity | PitCrewActivity | null): string => {
    if (!activity) return 'Chill';
    if (activity === 'simulation') return 'Sim';
    if (activity === 'drills') return 'Drill';
    if (activity === 'exercise') return 'Exe';
    if (activity === 'chill') return 'Chill';
    return '-';
  };

  const getActivityColor = (activity: DriverActivity | PitCrewActivity | null): string => {
    if (!activity) return 'bg-purple-500/15 text-purple-700 dark:text-purple-200';
    if (activity === 'simulation' || activity === 'drills') return 'bg-blue-500/15 text-blue-700 dark:text-blue-200';
    if (activity === 'exercise') return 'bg-green-500/15 text-green-700 dark:text-green-200';
    if (activity === 'chill') return 'bg-purple-500/15 text-purple-700 dark:text-purple-200';
    return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400';
  };

  const calculatePreview = () => {
    const state = getCurrentState();
    if (!state || !state.trainingSchedule) return null;

    if (activeTab === 'pitcrew') {
      const results = processPitCrewSchedule(state as CrewState, state.trainingSchedule);
      return {
        xp: results.xpGain,
        fatigue: results.fatigueChange,
        errorRate: results.errorRateChange,
        speedBonus: results.speedBonusChange,
      };
    }

    const results = processDriverSchedule(state as OfflineDriverState, state.trainingSchedule);
    return {
      xp: results.xpGain,
      fatigue: results.fatigueChange,
      strength: results.strengthChange,
    };
  };

  const preview = calculatePreview();
  const schedule = getCurrentSchedule();
  const state = getCurrentState();
  const roundStartDate = getRoundStartDate(season, currentRound);

  const getDriverName = (driverState: OfflineDriverState | null, fallbackIndex?: number) => {
    if (!driverState) return 'Unknown';
    const onlineDriverName = typeof fallbackIndex === 'number' ? onlineDrivers[fallbackIndex]?.name : null;
    if (onlineDriverName) return onlineDriverName;
    const driver = DRIVERS.find(d => d.id === driverState.driverId);
    return driver?.name || driverState.driverId;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="p-6">
        <div className="text-center text-zinc-500 dark:text-zinc-400">No training data available.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 text-zinc-900 dark:text-zinc-100">
      <div className="mb-6">
        <button onClick={() => navigate(mode === 'online' ? '/team-hub' : '/career')} className="text-blue-400 hover:text-blue-300 mb-2">
          ← Back to {mode === 'online' ? 'Team Hub' : 'Career'}
        </button>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Training Calendar</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Round {currentRound} → Round {currentRound + 1} • {roundStartDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-white/10">
        <button
          onClick={() => setActiveTab('driver1')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'driver1'
              ? 'border-b-2 border-blue-400 text-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {getDriverName(driver1State, 0)}
        </button>
        <button
          onClick={() => setActiveTab('driver2')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'driver2'
              ? 'border-b-2 border-blue-400 text-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {getDriverName(driver2State, 1)}
        </button>
        <button
          onClick={() => setActiveTab('pitcrew')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'pitcrew'
              ? 'border-b-2 border-blue-400 text-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Pit Crew
        </button>
      </div>

      <GlassCard className="mb-6 !p-0">
        <div className="grid grid-cols-7 gap-2 p-6">
          {schedule.map((day, index) => {
            const currentDate = new Date(roundStartDate);
            currentDate.setDate(roundStartDate.getDate() + index);
            const formattedDate = formatCalendarDate(currentDate);

            return (
              <div key={day.dayNumber} className="border border-white/10 rounded bg-[#0b0b0b] overflow-hidden">
                <div className="bg-[#1a1a1a] p-2 text-center font-semibold text-sm text-white border-b border-white/10">
                  <div>{formattedDate.month} {formattedDate.day}</div>
                  <div className="text-[10px] text-gray-500 font-normal">{formattedDate.weekday}</div>
                </div>

                {day.isRaceDay ? (
                  <div className="p-4 text-center bg-[#111]">
                    <div className="text-4xl">🏁</div>
                    <div className="text-xs text-gray-400 mt-1">Race Day</div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleSlotClick(index, 'am')}
                      className={`w-full p-3 text-center text-sm font-semibold border-b border-white/10 hover:opacity-80 ${getActivityColor(day.amActivity)}`}
                    >
                      <div className="text-xs text-gray-500">AM</div>
                      <div>{getActivityLabel(day.amActivity)}</div>
                    </button>
                    <button
                      onClick={() => handleSlotClick(index, 'pm')}
                      className={`w-full p-3 text-center text-sm font-semibold hover:opacity-80 ${getActivityColor(day.pmActivity)}`}
                    >
                      <div className="text-xs text-gray-500">PM</div>
                      <div>{getActivityLabel(day.pmActivity)}</div>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {preview && (
        <GlassCard className="mb-6 !p-0">
          <div className="bg-[#111827] border border-blue-500/20 rounded-lg p-6">
            <h3 className="font-bold text-lg mb-4 text-white">Projected Changes</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-400">XP Gain</div>
                <div className="text-2xl font-bold text-green-400">+{preview.xp}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Fatigue</div>
                <div className={`text-2xl font-bold ${preview.fatigue > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {preview.fatigue > 0 ? '+' : ''}{preview.fatigue}
                </div>
              </div>
              {activeTab === 'pitcrew' ? (
                <>
                  <div>
                    <div className="text-sm text-gray-400">Error Rate</div>
                    <div className={`text-2xl font-bold ${preview.errorRate < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {preview.errorRate}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Speed Bonus</div>
                    <div className="text-2xl font-bold text-green-400">+{preview.speedBonus.toFixed(1)}%</div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-sm text-gray-400">Strength</div>
                  <div className={`text-2xl font-bold ${preview.strength > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {preview.strength > 0 ? '+' : ''}{preview.strength.toFixed(1)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard className="mb-6 !p-0">
        <div className="p-4">
          <h4 className="font-semibold mb-2 text-white">Activities</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-300">
            {activeTab === 'pitcrew' ? (
              <>
                <div><span className="font-semibold">Drill:</span> +3 XP, -2 error, +2 fatigue</div>
                <div><span className="font-semibold">Exe:</span> +1 XP, +0.5% speed, +3 fatigue</div>
                <div><span className="font-semibold">Chill:</span> -5 fatigue</div>
              </>
            ) : (
              <>
                <div><span className="font-semibold">Sim:</span> +3 XP, +2 fatigue</div>
                <div><span className="font-semibold">Exe:</span> +1 XP, +1.5 strength, +3 fatigue</div>
                <div><span className="font-semibold">Chill:</span> -5 fatigue</div>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
        <button
          onClick={() => navigate(mode === 'online' ? '/team-hub' : '/career')}
          className="px-6 py-3 border border-white/10 text-gray-200 rounded-lg font-semibold hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
