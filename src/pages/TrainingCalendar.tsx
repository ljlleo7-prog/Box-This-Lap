import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSaveGame, saveSaveGame } from '../lib/localSaves';
import { DRIVERS } from '../data/initialData';
import type { OfflineDriverState, CrewState, DaySchedule, DriverActivity, PitCrewActivity } from '../types/championship';
import { processDriverSchedule } from '../lib/driverDevelopment';
import { processPitCrewSchedule } from '../lib/crewDevelopment';
import { useChampionshipStore } from '../store/championshipStore';

const getRoundStartDate = (season: number, currentRound: number): Date => {
  const seasonStart = new Date(season, 2, 1); // Mar 1 local time as a simple season anchor
  const start = new Date(seasonStart);
  start.setDate(seasonStart.getDate() + (currentRound - 1) * 14);
  return start;
};

const formatCalendarDate = (date: Date): { month: string; day: string; weekday: string } => ({
  month: date.toLocaleDateString(undefined, { month: 'short' }),
  day: date.toLocaleDateString(undefined, { day: 'numeric' }),
  weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
});

type TabType = 'driver1' | 'driver2' | 'pitcrew';

export const TrainingCalendar = () => {
  const navigate = useNavigate();
  const mode = useChampionshipStore((state) => state.mode);
  const activeLocalChampionship = useChampionshipStore((state) => state.activeChampionship);
  const [activeTab, setActiveTab] = useState<TabType>('driver1');
  const [driver1State, setDriver1State] = useState<OfflineDriverState | null>(null);
  const [driver2State, setDriver2State] = useState<OfflineDriverState | null>(null);
  const [pitCrewState, setPitCrewState] = useState<CrewState | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [season, setSeason] = useState(2026);

  useEffect(() => {
    if (mode === 'online') {
      navigate('/team-hub');
      return;
    }

    if (mode === 'local' && activeLocalChampionship) {
      const playerTeam = activeLocalChampionship.teams.find(
        (t) => t.teamId === activeLocalChampionship.selectedTeamId
      );
      if (playerTeam) {
        setDriver1State(playerTeam.drivers[0] || null);
        setDriver2State(playerTeam.drivers[1] || null);
        setPitCrewState(playerTeam.crew.find((c) => c.department === 'pit_crew') || null);
        setCurrentRound(activeLocalChampionship.currentRound);
        setSeason(activeLocalChampionship.season);
        return;
      }
    }

    navigate('/career');
  }, [activeLocalChampionship, mode, navigate]);

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
      ? ['drills', 'exercise', 'chill', null]
      : ['simulation', 'exercise', 'chill', null];

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

  const handleSave = () => {
    if (mode !== 'local' || !activeLocalChampionship) return;

    const saveGame = loadSaveGame();
    if (!saveGame.championship) return;

    const playerTeam = saveGame.championship.teams.find(
      (t) => t.teamId === saveGame.championship!.selectedTeamId
    );
    if (!playerTeam) return;

    if (driver1State) playerTeam.drivers[0] = driver1State;
    if (driver2State) playerTeam.drivers[1] = driver2State;
    if (pitCrewState) {
      const crewIndex = playerTeam.crew.findIndex((c) => c.department === 'pit_crew');
      if (crewIndex !== -1) playerTeam.crew[crewIndex] = pitCrewState;
    }

    saveGame.championship.updatedAt = new Date().toISOString();
    saveSaveGame(saveGame);
    alert('Schedule saved!');
  };

  const getActivityLabel = (activity: DriverActivity | PitCrewActivity | null): string => {
    if (!activity) return '-';
    if (activity === 'simulation') return 'Sim';
    if (activity === 'drills') return 'Drill';
    if (activity === 'exercise') return 'Exe';
    if (activity === 'chill') return 'Chill';
    return '-';
  };

  const getActivityColor = (activity: DriverActivity | PitCrewActivity | null): string => {
    if (!activity) return 'bg-gray-100 text-gray-400';
    if (activity === 'simulation' || activity === 'drills') return 'bg-blue-100 text-blue-700';
    if (activity === 'exercise') return 'bg-green-100 text-green-700';
    if (activity === 'chill') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100';
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
    } else {
      const results = processDriverSchedule(state as OfflineDriverState, state.trainingSchedule);
      return {
        xp: results.xpGain,
        fatigue: results.fatigueChange,
        strength: results.strengthChange,
      };
    }
  };

  const preview = calculatePreview();
  const schedule = getCurrentSchedule();
  const state = getCurrentState();
  const roundStartDate = getRoundStartDate(season, currentRound);

  if (!state) {
    return (
      <div className="p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const getDriverName = (driverState: OfflineDriverState | null) => {
    if (!driverState) return 'Unknown';
    const driver = DRIVERS.find(d => d.id === driverState.driverId);
    return driver?.name || driverState.driverId;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <button onClick={() => navigate('/career')} className="text-blue-600 hover:underline mb-2">
          ← Back to Career
        </button>
        <h1 className="text-3xl font-bold">Training Calendar</h1>
        <p className="text-gray-600">
          Round {currentRound} → Round {currentRound + 1} • {roundStartDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('driver1')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'driver1'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          {getDriverName(driver1State)}
        </button>
        <button
          onClick={() => setActiveTab('driver2')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'driver2'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          {getDriverName(driver2State)}
        </button>
        <button
          onClick={() => setActiveTab('pitcrew')}
          className={`px-4 py-2 font-semibold ${
            activeTab === 'pitcrew'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Pit Crew
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-7 gap-2">
          {schedule.map((day, index) => {
            const currentDate = new Date(roundStartDate);
            currentDate.setDate(roundStartDate.getDate() + index);
            const formattedDate = formatCalendarDate(currentDate);

            return (
            <div key={day.dayNumber} className="border rounded">
              <div className="bg-gray-100 p-2 text-center font-semibold text-sm">
                <div>{formattedDate.month} {formattedDate.day}</div>
                <div className="text-[10px] text-gray-500 font-normal">{formattedDate.weekday}</div>
              </div>

              {day.isRaceDay ? (
                <div className="p-4 text-center">
                  <div className="text-4xl">🏁</div>
                  <div className="text-xs text-gray-600 mt-1">Race Day</div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleSlotClick(index, 'am')}
                    className={`w-full p-3 text-center text-sm font-semibold border-b hover:opacity-80 ${getActivityColor(day.amActivity)}`}
                  >
                    <div className="text-xs text-gray-600">AM</div>
                    <div>{getActivityLabel(day.amActivity)}</div>
                  </button>
                  <button
                    onClick={() => handleSlotClick(index, 'pm')}
                    className={`w-full p-3 text-center text-sm font-semibold hover:opacity-80 ${getActivityColor(day.pmActivity)}`}
                  >
                    <div className="text-xs text-gray-600">PM</div>
                    <div>{getActivityLabel(day.pmActivity)}</div>
                  </button>
                </>
              )}
            </div>
          )})}
        </div>
      </div>

      {/* Stats Preview */}
      {preview && (
        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-lg mb-4">Projected Changes</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">XP Gain</div>
              <div className="text-2xl font-bold text-green-600">+{preview.xp}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Fatigue</div>
              <div className={`text-2xl font-bold ${preview.fatigue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {preview.fatigue > 0 ? '+' : ''}{preview.fatigue}
              </div>
            </div>
            {activeTab === 'pitcrew' ? (
              <>
                <div>
                  <div className="text-sm text-gray-600">Error Rate</div>
                  <div className={`text-2xl font-bold ${preview.errorRate < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {preview.errorRate}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Speed Bonus</div>
                  <div className="text-2xl font-bold text-green-600">+{preview.speedBonus.toFixed(1)}%</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-sm text-gray-600">Strength</div>
                <div className={`text-2xl font-bold ${preview.strength > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {preview.strength > 0 ? '+' : ''}{preview.strength.toFixed(1)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h4 className="font-semibold mb-2">Activities</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={handleSave}
          className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
        >
          Save Schedule
        </button>
        <button
          onClick={() => navigate('/career')}
          className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
