import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSaveGame } from '../lib/localSaves';
import { DRIVERS } from '../data/initialData';
import type { OfflineDriverState, DriverTrainingPlan, TrainingIntensity, DriverTrainingType } from '../types/championship';
import { getWearyState, getTotalXPForLevel, getTrainingDuration, getTrainingXP, getTrainingFatigue } from '../lib/driverDevelopment';

export const DriverDevelopment = () => {
  const navigate = useNavigate();
  const [driverStates, setDriverStates] = useState<OfflineDriverState[]>([]);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [trainingType, setTrainingType] = useState<DriverTrainingType>('pace');
  const [trainingIntensity, setTrainingIntensity] = useState<TrainingIntensity>('moderate');

  useEffect(() => {
    const saveGame = loadSaveGame();
    if (!saveGame.championship) {
      navigate('/career');
      return;
    }

    const playerTeam = saveGame.championship.teams.find(t => t.teamId === saveGame.championship!.selectedTeamId);
    if (playerTeam) {
      setDriverStates(playerTeam.drivers);
    }
  }, [navigate]);

  const getDriverInfo = (driverId: string) => {
    return DRIVERS.find(d => d.id === driverId);
  };

  const getWearyColor = (state: string) => {
    switch (state) {
      case 'fresh': return 'text-green-600';
      case 'tired': return 'text-yellow-600';
      case 'exhausted': return 'text-orange-600';
      case 'burnt-out': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const handleStartTraining = (driverId: string) => {
    setSelectedDriverId(driverId);
    setShowTrainingModal(true);
  };

  const confirmTraining = () => {
    if (!selectedDriverId) return;

    const saveGame = loadSaveGame();
    if (!saveGame.championship) return;

    const playerTeam = saveGame.championship.teams.find(t => t.teamId === saveGame.championship!.selectedTeamId);
    if (!playerTeam) return;

    const driverIndex = playerTeam.drivers.findIndex(d => d.driverId === selectedDriverId);
    if (driverIndex === -1) return;

    const duration = getTrainingDuration(trainingType, trainingIntensity);
    const trainingPlan: DriverTrainingPlan = {
      type: trainingType,
      intensity: trainingIntensity,
      daysRemaining: duration,
    };

    playerTeam.drivers[driverIndex].trainingPlan = trainingPlan;
    saveGame.championship.updatedAt = new Date().toISOString();

    localStorage.setItem('offline-save-game', JSON.stringify(saveGame));
    setDriverStates([...playerTeam.drivers]);
    setShowTrainingModal(false);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <button onClick={() => navigate('/career')} className="text-blue-600 hover:underline">
          ← Back to Career
        </button>
        <h1 className="text-3xl font-bold mt-2">Driver Development</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {driverStates.map((driverState) => {
          const driver = getDriverInfo(driverState.driverId);
          if (!driver) return null;

          const nextLevelXP = getTotalXPForLevel(driverState.level + 1);
          const xpProgress = driverState.level >= 10 ? 100 : (driverState.xp / nextLevelXP) * 100;

          return (
            <div key={driverState.driverId} className="border rounded-lg p-6 bg-white shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{driver.name}</h2>
                  <div className="text-sm text-gray-600 mt-1">
                    Level {driverState.level} | XP: {driverState.xp}/{nextLevelXP}
                  </div>
                </div>
                <div className={`text-lg font-semibold ${getWearyColor(driverState.wearyState)}`}>
                  {driverState.wearyState.toUpperCase()}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>XP Progress</span>
                  <span>{Math.round(xpProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, xpProgress)}%` }}
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Fatigue</span>
                  <span>{driverState.fatigue}/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      driverState.fatigue >= 86 ? 'bg-red-600' :
                      driverState.fatigue >= 61 ? 'bg-orange-600' :
                      driverState.fatigue >= 31 ? 'bg-yellow-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${driverState.fatigue}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div>Racecraft: {driver.skill.racecraft}</div>
                <div>Consistency: {driver.skill.consistency}</div>
                <div>Tyre Mgmt: {driver.skill.tyreManagement}</div>
                <div>Wet Weather: {driver.skill.wetWeather}</div>
              </div>

              {driverState.trainingPlan ? (
                <div className="bg-blue-50 p-3 rounded">
                  <div className="font-semibold text-sm">Training in Progress</div>
                  <div className="text-sm">
                    {driverState.trainingPlan.type.replace('_', ' ')} ({driverState.trainingPlan.intensity})
                  </div>
                  <div className="text-sm text-gray-600">
                    {driverState.trainingPlan.daysRemaining} days remaining
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleStartTraining(driverState.driverId)}
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Start Training
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showTrainingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Start Training</h2>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Training Type</label>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value as DriverTrainingType)}
                className="w-full border rounded p-2"
              >
                <option value="pace">Pace</option>
                <option value="consistency">Consistency</option>
                <option value="tyre_management">Tyre Management</option>
                <option value="wet_weather">Wet Weather</option>
                <option value="racecraft">Racecraft</option>
                <option value="fitness">Fitness (Reduces Fatigue)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Intensity</label>
              <select
                value={trainingIntensity}
                onChange={(e) => setTrainingIntensity(e.target.value as TrainingIntensity)}
                className="w-full border rounded p-2"
                disabled={trainingType === 'fitness'}
              >
                <option value="light">Light (7 days)</option>
                <option value="moderate">Moderate (10 days)</option>
                <option value="intense">Intense (14 days)</option>
              </select>
            </div>

            <div className="bg-gray-50 p-3 rounded mb-4 text-sm">
              <div>Duration: {getTrainingDuration(trainingType, trainingIntensity)} days</div>
              <div>XP Gain: +{getTrainingXP({ type: trainingType, intensity: trainingIntensity, daysRemaining: 0 })}</div>
              <div>Fatigue: {getTrainingFatigue({ type: trainingType, intensity: trainingIntensity, daysRemaining: 0 }) > 0 ? '+' : ''}{getTrainingFatigue({ type: trainingType, intensity: trainingIntensity, daysRemaining: 0 })}</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTrainingModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmTraining}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
