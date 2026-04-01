import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { DRIVERS } from '../data/initialData';
import { TEAM_TEMPLATES } from '../data/teams';
import { TCC_API } from '../lib/tcc-api';
import { useChampionshipStore } from '../store/championshipStore';
import { createEmptySchedule } from '../lib/driverDevelopment';

const countFilledSlots = (schedule: any[] = []) =>
  schedule.reduce((sum, day) => {
    if (day.isRaceDay) return sum;
    return sum + (day.amActivity ? 1 : 0) + (day.pmActivity ? 1 : 0);
  }, 0);

const getOnlineRound = (weekends: any[] | null | undefined): number => {
  if (!weekends || weekends.length === 0) return 1;
  const upcomingWeekend = weekends.find((weekend) => !['completed', 'race_complete', 'cancelled'].includes(weekend.status));
  if (upcomingWeekend?.round_number) return upcomingWeekend.round_number;
  return weekends[weekends.length - 1]?.round_number ? weekends[weekends.length - 1].round_number + 1 : 1;
};

export const TeamHub: React.FC = () => {
  const navigate = useNavigate();
  const mode = useChampionshipStore((state) => state.mode);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const teamName = useChampionshipStore((state) => state.teamName);
  const teamId = useChampionshipStore((state) => state.teamId);
  const activeLocalChampionship = useChampionshipStore((state) => state.activeChampionship);
  const [onlineTeam, setOnlineTeam] = useState<any | null>(null);
  const [onlineRound, setOnlineRound] = useState(1);
  const [onlinePlans, setOnlinePlans] = useState<any[]>([]);
  const [onlineCash, setOnlineCash] = useState(0);
  const [loadingOnlineTeam, setLoadingOnlineTeam] = useState(false);

  useEffect(() => {
    const loadOnlineTeam = async () => {
      if (mode !== 'online' || !championshipId || !teamId) {
        setOnlineTeam(null);
        setOnlinePlans([]);
        setOnlineCash(0);
        return;
      }

      setLoadingOnlineTeam(true);
      try {
        const [{ data: team }, { data: weekends }, walletRes] = await Promise.all([
          TCC_API.getMyTeam(championshipId),
          TCC_API.getChampionshipWeekends(championshipId),
          TCC_API.getWalletBalance(championshipId),
        ]);

        const resolvedRound = getOnlineRound(weekends);
        setOnlineRound(resolvedRound);
        const { data: plans } = await TCC_API.getTeamTrainingPlans(championshipId, teamId, resolvedRound);
        setOnlineTeam(team ?? null);
        setOnlinePlans(plans ?? []);
        setOnlineCash(walletRes.data?.wallet?.cash_balance || 0);
      } catch (error) {
        console.error('Failed to load online team hub data', error);
        setOnlineTeam(null);
        setOnlinePlans([]);
        setOnlineCash(0);
      } finally {
        setLoadingOnlineTeam(false);
      }
    };

    loadOnlineTeam();
  }, [championshipId, mode, teamId]);

  const trainingSummary = useMemo(() => {
    if (mode === 'online') {
      if (!onlineTeam) return null;

      const drivers = (onlineTeam.tcc_drivers ?? []).slice(0, 2).map((driver: any) => {
        const driverPlan = onlinePlans.find((plan) => plan.subject_type === 'driver' && plan.subject_id === driver.id);
        const schedule = driverPlan?.schedule ?? createEmptySchedule([12, 13, 14]);

        return {
          id: driver.id,
          name: driver.name,
          strength: Math.round(driver.skills?.pace ?? 75),
          fatigue: 0,
          wearyState: 'fresh',
          filledSlots: countFilledSlots(schedule),
        };
      });

      const pitCrewSchedule = onlinePlans.find((plan) => plan.subject_type === 'pit_crew' && plan.subject_id === 'pit_crew')?.schedule
        ?? createEmptySchedule([12, 13, 14]);
      const pitCrewFacility = onlineTeam.tcc_facilities?.levels?.pit_crew ?? 1;

      return {
        driverSummaries: drivers,
        pitCrew: {
          level: pitCrewFacility,
          errorRate: 50,
          speedBonus: 0,
          filledSlots: countFilledSlots(pitCrewSchedule),
        },
        cashBalance: onlineCash,
        teamBudget: onlineTeam.budget ?? 0,
      };
    }

    if (activeLocalChampionship) {
      const playerTeam = activeLocalChampionship.teams.find(
        (team) => team.teamId === activeLocalChampionship.selectedTeamId
      );
      if (!playerTeam) return null;

      const pitCrew = playerTeam.crew.find((crew) => crew.department === 'pit_crew');
      const templateBudget = TEAM_TEMPLATES.find((team) => team.name === playerTeam.teamName)?.budget ?? 0;

      const driverSummaries = playerTeam.drivers.map((driverState) => {
        const driver = DRIVERS.find((entry) => entry.id === driverState.driverId);
        const filledSlots = countFilledSlots(driverState.trainingSchedule);

        return {
          id: driverState.driverId,
          name: driver?.name ?? driverState.driverId,
          strength: driverState.strength,
          fatigue: driverState.fatigue,
          wearyState: driverState.wearyState,
          filledSlots,
        };
      });

      const pitCrewFilledSlots = countFilledSlots(pitCrew?.trainingSchedule ?? []);

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
        cashBalance: templateBudget,
        teamBudget: templateBudget,
      };
    }

    return null;
  }, [activeLocalChampionship, mode, onlinePlans, onlineTeam]);

  return (
    <div className="space-y-6">
      <PageHeader title="Team Hub" description="Manage your team roster, staff, and training" />

      {trainingSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
            <h3 className="text-lg font-bold text-white mb-2">Cash Available</h3>
            <p className="text-3xl font-black text-white">{trainingSummary.cashBalance.toLocaleString()} CASH</p>
            <p className="text-sm text-gray-400 mt-2">Working budget for development and facilities.</p>
          </div>
          <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
            <h3 className="text-lg font-bold text-white mb-2">Team Budget</h3>
            <p className="text-3xl font-black text-white">{trainingSummary.teamBudget.toLocaleString()} CASH</p>
            <p className="text-sm text-gray-400 mt-2">Initial allocation tied to the selected team.</p>
          </div>
        </div>
      )}

      {mode === 'online' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
            <h3 className="text-lg font-bold text-white mb-2">Active Online Team</h3>
            {loadingOnlineTeam ? (
              <p className="text-gray-400">Loading team...</p>
            ) : onlineTeam ? (
              <>
                <p className="text-white font-semibold">{onlineTeam.name}</p>
                <p className="text-gray-400 text-sm">Championship synced to {championshipId}</p>
                <p className="text-gray-500 text-sm mt-2">Training round {onlineRound}</p>
              </>
            ) : (
              <>
                <p className="text-gray-400">No team is linked to this championship yet.</p>
                {teamName && <p className="text-gray-500 text-sm mt-2">Current context: {teamName}</p>}
              </>
            )}
          </div>

          <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
            <h3 className="text-lg font-bold text-white mb-2">Development</h3>
            <p className="text-gray-400 mb-4">R&D and facilities stay tied to this active online championship.</p>
            <div className="flex gap-3">
              <button onClick={() => navigate('/research')} className="text-sm text-blue-400 hover:text-blue-300">
                Open R&D
              </button>
              <button onClick={() => navigate('/facilities')} className="text-sm text-blue-400 hover:text-blue-300">
                Open Facilities
              </button>
            </div>
          </div>

          <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
            <h3 className="text-lg font-bold text-white mb-2">Championship</h3>
            <p className="text-gray-400 mb-4">Use the current championship context across all online tabs.</p>
            <button
              onClick={() => championshipId && navigate(`/championships/${championshipId}`)}
              className="text-sm text-blue-400 hover:text-blue-300"
              disabled={!championshipId}
            >
              Back to championship
            </button>
          </div>
        </div>
      )}

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
          ) : (
            <p className="text-gray-400">No driver training data available yet.</p>
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
          ) : (
            <p className="text-gray-400">No pit crew training data available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
