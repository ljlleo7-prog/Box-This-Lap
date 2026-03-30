import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSaveGame, saveSaveGame } from '../lib/localSaves';
import type { CrewState, CrewTrainingPlan, CrewTrainingType, CrewSpecialization, CrewDepartment } from '../types/championship';
import { getTotalXPForLevel, getCrewTrainingDuration, getCrewTrainingCost, getCrewTrainingXP, getPitStopTimeBonus } from '../lib/crewDevelopment';

const DEPARTMENT_NAMES: Record<CrewDepartment, string> = {
  race_engineering: 'Race Engineering',
  strategy: 'Strategy',
  aero: 'Aerodynamics',
  power_unit: 'Power Unit',
  pit_crew: 'Pit Crew',
  operations: 'Operations',
};

export const CrewManagement = () => {
  const navigate = useNavigate();
  const [crewStates, setCrewStates] = useState<CrewState[]>([]);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [showSpecializationModal, setShowSpecializationModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<CrewDepartment | null>(null);
  const [trainingType, setTrainingType] = useState<CrewTrainingType>('efficiency');
  const [selectedSpecialization, setSelectedSpecialization] = useState<CrewSpecialization>('speed');

  useEffect(() => {
    const saveGame = loadSaveGame();
    if (!saveGame.championship) {
      navigate('/career');
      return;
    }

    const playerTeam = saveGame.championship.teams.find(t => t.teamId === saveGame.championship!.selectedTeamId);
    if (playerTeam) {
      setCrewStates(playerTeam.crew);
    }
  }, [navigate]);

  const handleStartTraining = (department: CrewDepartment) => {
    setSelectedDepartment(department);
    setShowTrainingModal(true);
  };

  const handleSelectSpecialization = (department: CrewDepartment) => {
    setSelectedDepartment(department);
    setShowSpecializationModal(true);
  };

  const confirmTraining = () => {
    if (!selectedDepartment) return;

    const saveGame = loadSaveGame();
    if (!saveGame.championship) return;

    const playerTeam = saveGame.championship.teams.find(t => t.teamId === saveGame.championship!.selectedTeamId);
    if (!playerTeam) return;

    const crewIndex = playerTeam.crew.findIndex(c => c.department === selectedDepartment);
    if (crewIndex === -1) return;

    const duration = getCrewTrainingDuration(trainingType);
    const trainingPlan: CrewTrainingPlan = {
      type: trainingType,
      daysRemaining: duration,
    };

    playerTeam.crew[crewIndex].trainingPlan = trainingPlan;
    saveGame.championship.updatedAt = new Date().toISOString();

    saveSaveGame(saveGame);
    setCrewStates([...playerTeam.crew]);
    setShowTrainingModal(false);
  };

  const confirmSpecialization = () => {
    if (!selectedDepartment) return;

    const saveGame = loadSaveGame();
    if (!saveGame.championship) return;

    const playerTeam = saveGame.championship.teams.find(t => t.teamId === saveGame.championship!.selectedTeamId);
    if (!playerTeam) return;

    const crewIndex = playerTeam.crew.findIndex(c => c.department === selectedDepartment);
    if (crewIndex === -1) return;

    playerTeam.crew[crewIndex].specialization = selectedSpecialization;
    saveGame.championship.updatedAt = new Date().toISOString();

    saveSaveGame(saveGame);
    setCrewStates([...playerTeam.crew]);
    setShowSpecializationModal(false);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <button onClick={() => navigate('/career')} className="text-blue-600 hover:underline">
          ← Back to Career
        </button>
        <h1 className="text-3xl font-bold mt-2">Crew Management</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {crewStates.map((crew) => {
          const nextLevelXP = getTotalXPForLevel(crew.level + 1);
          const xpProgress = crew.level >= 10 ? 100 : (crew.xp / nextLevelXP) * 100;
          const isPitCrew = crew.department === 'pit_crew';
          const pitStopBonus = isPitCrew ? getPitStopTimeBonus(crew.level, crew.efficiency, crew.speedBonus ?? 0, crew.specialization) : 0;

          return (
            <div key={crew.department} className="border rounded-lg p-6 bg-white shadow">
              <div className="mb-4">
                <h2 className="text-xl font-bold">{DEPARTMENT_NAMES[crew.department]}</h2>
                <div className="text-sm text-gray-600 mt-1">
                  Level {crew.level} | XP: {crew.xp}/{nextLevelXP}
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

              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div>Efficiency: {crew.efficiency}%</div>
                <div>Morale: {crew.morale}</div>
                <div>Workload: {crew.workload}%</div>
                {crew.specialization && (
                  <div className="col-span-2 font-semibold text-blue-600">
                    Spec: {crew.specialization}
                  </div>
                )}
              </div>

              {isPitCrew && (
                <div className="bg-green-50 p-2 rounded mb-4 text-sm">
                  <div className="font-semibold">Pit Stop Bonus</div>
                  <div>-{(pitStopBonus * 100).toFixed(1)}% stop time</div>
                  <div className="text-xs text-gray-600">
                    ~{(2.5 * (1 - pitStopBonus)).toFixed(2)}s avg stop
                  </div>
                </div>
              )}

              {crew.trainingPlan ? (
                <div className="bg-blue-50 p-3 rounded mb-2">
                  <div className="font-semibold text-sm">Training in Progress</div>
                  <div className="text-sm">{crew.trainingPlan.type}</div>
                  <div className="text-sm text-gray-600">
                    {crew.trainingPlan.daysRemaining} days remaining
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleStartTraining(crew.department)}
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 mb-2"
                >
                  Start Training
                </button>
              )}

              {crew.level >= 5 && !crew.specialization && (
                <button
                  onClick={() => handleSelectSpecialization(crew.department)}
                  className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
                >
                  Choose Specialization
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showTrainingModal && selectedDepartment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Start Training</h2>
            <p className="text-sm text-gray-600 mb-4">
              {DEPARTMENT_NAMES[selectedDepartment]}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Training Type</label>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value as CrewTrainingType)}
                className="w-full border rounded p-2"
              >
                <option value="efficiency">Efficiency (+5% efficiency)</option>
                <option value="speed">Speed (Faster work)</option>
                <option value="morale">Morale (+10 morale)</option>
              </select>
            </div>

            <div className="bg-gray-50 p-3 rounded mb-4 text-sm">
              <div>Duration: {getCrewTrainingDuration(trainingType)} days</div>
              <div>Cost: ${(getCrewTrainingCost(trainingType) / 1000).toFixed(0)}k</div>
              <div>XP Gain: +{getCrewTrainingXP({ type: trainingType, daysRemaining: 0 })}</div>
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

      {showSpecializationModal && selectedDepartment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4">Choose Specialization</h2>
            <p className="text-sm text-gray-600 mb-4">
              {DEPARTMENT_NAMES[selectedDepartment]} - Level 5 Unlocked
            </p>

            <div className="space-y-3 mb-4">
              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="specialization"
                  value="speed"
                  checked={selectedSpecialization === 'speed'}
                  onChange={(e) => setSelectedSpecialization(e.target.value as CrewSpecialization)}
                  className="mr-3"
                />
                <div>
                  <div className="font-semibold">Speed</div>
                  <div className="text-sm text-gray-600">Work faster, complete tasks quicker</div>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="specialization"
                  value="consistency"
                  checked={selectedSpecialization === 'consistency'}
                  onChange={(e) => setSelectedSpecialization(e.target.value as CrewSpecialization)}
                  className="mr-3"
                />
                <div>
                  <div className="font-semibold">Consistency</div>
                  <div className="text-sm text-gray-600">Reduce errors, more reliable performance</div>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="specialization"
                  value="adaptability"
                  checked={selectedSpecialization === 'adaptability'}
                  onChange={(e) => setSelectedSpecialization(e.target.value as CrewSpecialization)}
                  className="mr-3"
                />
                <div>
                  <div className="font-semibold">Adaptability</div>
                  <div className="text-sm text-gray-600">Better under pressure, handle changes well</div>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowSpecializationModal(false)}
                className="flex-1 border border-gray-300 py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSpecialization}
                className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
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