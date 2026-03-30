import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { loadSaveGame } from '../lib/localSaves';
import { DRIVERS } from '../data/initialData';
import { useChampionshipStore } from '../store/championshipStore';

export const TeamHub: React.FC = () => {
  const navigate = useNavigate();
  const mode = useChampionshipStore((state) => state.mode);
  const activeLocalChampionship = useChampionshipStore((state) => state.activeChampionship);

  const trainingSummary = useMemo(() => {
    if (mode === 'online') {
      return null;
    }

    if (mode === 'local' && activeLocalChampionship) {
      const playerTeam = activeLocalChampionship.teams.find(
        (team) => team.teamId === activeLocalChampionship.selectedTeamId
      );
      if (!playerTeam) return null;

      const pitCrew = playerTeam.crew.find((crew) => crew.department === 'pit_crew');

      const driverSummaries = playerTeam.drivers.map((driverState) => {
        const driver = DRIVERS.find((entry) => entry.id === driverState.driverId);
        const filledSlots = driverState.trainingSchedule.reduce((sum, day) => {
          if (day.isRaceDay) return sum;
          return sum + (day.amActivity ? 1 : 0) + (day.pmActivity ? 1 : 0);
        }, 0);

        return {
          id: driverState.driverId,
          name: driver?.name ?? driverState.driverId,
          strength: driverState.strength,
          fatigue: driverState.fatigue,
          wearyState: driverState.wearyState,
          filledSlots,
        };
      });

      const pitCrewFilledSlots = (pitCrew?.trainingSchedule ?? []).reduce((sum, day) => {
        if (day.isRaceDay) return sum;
        return sum + (day.amActivity ? 1 : 0) + (day.pmActivity ? 1 : 0);
      }, 0);

      return {
        driverSummaries,
        pitCrew: pitCrew
          ? {
              level: pitCrew.level,
              errorRate: pitCrew.errorRate ?? 50,
              speedBonus: pitCrew.speedBonus ?? 0,
              filledSlots: pitCrewFilledSlots,
            }
          : null,
      };
    }

    return null;
  }, [activeLocalChampionship, mode]);

  return (
    <div className="space-y-6">
      <PageHeader title="Team Hub" description="Manage your team roster, staff, and training" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Drivers</h3>
            <button
              onClick={() => navigate('/training-calendar')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Open calendar
            </button>
          </div>

          {trainingSummary ? (
            <div className="space-y-3">
              {trainingSummary.driverSummaries.map((driver) => (
                <div key={driver.id} className="bg-[#0d0d0d] rounded-lg border border-[#333] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{driver.name}</div>
                      <div className="text-sm text-gray-400">
                        Strength {driver.strength} • Fatigue {driver.fatigue} • {driver.wearyState}
                      </div>
                    </div>
                    <div className="text-sm text-gray-300">{driver.filledSlots} slots planned</div>
                  </div>
                </div>
              ))}
            </div>
          ) : mode === 'online' ? (
            <p className="text-gray-400">Driver training is only available in local championships.</p>
          ) : (
            <p className="text-gray-400">Create a local championship to manage driver training.</p>
          )}
        </div>

        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Pit Crew Training</h3>
            <button
              onClick={() => navigate('/training-calendar')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Open calendar
            </button>
          </div>

          {trainingSummary?.pitCrew ? (
            <div className="space-y-3">
              <div className="bg-[#0d0d0d] rounded-lg border border-[#333] p-4">
                <div className="font-semibold text-white">Pit Crew</div>
                <div className="mt-2 text-sm text-gray-400">
                  Level {trainingSummary.pitCrew.level} • Error Rate {trainingSummary.pitCrew.errorRate} • Speed Bonus +{trainingSummary.pitCrew.speedBonus.toFixed(1)}%
                </div>
                <div className="mt-2 text-sm text-gray-300">
                  {trainingSummary.pitCrew.filledSlots} slots planned this round
                </div>
              </div>
              <p className="text-sm text-gray-400">
                Schedule drills, exercise, and recovery directly from the training calendar.
              </p>
            </div>
          ) : mode === 'online' ? (
            <p className="text-gray-400">Pit crew training is only available in local championships.</p>
          ) : (
            <p className="text-gray-400">Pit crew management appears here once a local championship is active.</p>
          )}
        </div>
      </div>
    </div>
  );
};
