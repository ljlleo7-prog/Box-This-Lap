import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { DRIVERS } from '../data/initialData';
import { TEAM_TEMPLATES } from '../data/teams';
import { TCC_API } from '../lib/tcc-api';
import { useChampionshipStore } from '../store/championshipStore';
import { createEmptySchedule } from '../lib/driverDevelopment';
import { useI18n } from '../i18n/I18nProvider';

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
  const { t } = useI18n();
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
      <PageHeader title={t('teamHub.title')} description={t('teamHub.description')} />

      {trainingSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 mb-2 dark:text-white">{t('teamHub.cashAvailable')}</h3>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">{trainingSummary.cashBalance.toLocaleString()} {t('common.cashUnit')}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{t('teamHub.cashAvailableHint')}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 mb-2 dark:text-white">{t('teamHub.teamBudget')}</h3>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">{trainingSummary.teamBudget.toLocaleString()} {t('common.cashUnit')}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">{t('teamHub.teamBudgetHint')}</p>
          </div>
        </div>
      )}

      {mode === 'online' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 mb-2 dark:text-white">{t('teamHub.activeOnlineTeam')}</h3>
            {loadingOnlineTeam ? (
              <p className="text-zinc-500 dark:text-zinc-400">{t('teamHub.loadingTeam')}</p>
            ) : onlineTeam ? (
              <>
                <p className="text-white font-semibold">{onlineTeam.name}</p>
                <p className="text-gray-400 text-sm">{t('teamHub.syncedToChampionship')} {championshipId}</p>
                <p className="text-gray-500 text-sm mt-2">{t('teamHub.trainingRound')} {onlineRound}</p>
              </>
            ) : (
              <>
                <p className="text-zinc-500 dark:text-zinc-400">{t('teamHub.noLinkedTeam')}</p>
                {teamName && <p className="text-gray-500 text-sm mt-2">{t('teamHub.currentContext')} {teamName}</p>}
              </>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 mb-2 dark:text-white">{t('teamHub.development')}</h3>
            <p className="text-gray-400 mb-4">{t('teamHub.developmentHint')}</p>
            <div className="flex gap-3">
              <button onClick={() => navigate('/research')} className="text-sm text-blue-400 hover:text-blue-300">
                {t('teamHub.openResearch')}
              </button>
              <button onClick={() => navigate('/facilities')} className="text-sm text-blue-400 hover:text-blue-300">
                {t('teamHub.openFacilities')}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-bold text-zinc-900 mb-2 dark:text-white">{t('teamHub.championship')}</h3>
            <p className="text-gray-400 mb-4">{t('teamHub.championshipHint')}</p>
            <button
              onClick={() => championshipId && navigate(`/championships/${championshipId}`)}
              className="text-sm text-blue-400 hover:text-blue-300"
              disabled={!championshipId}
            >
              {t('teamHub.backToChampionship')}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">{t('teamHub.drivers')}</h3>
            <button
              onClick={() => navigate('/training-calendar')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {t('teamHub.openCalendar')}
            </button>
          </div>

          {trainingSummary ? (
            <div className="space-y-3">
              {trainingSummary.driverSummaries.map((driver) => (
                <div key={driver.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{driver.name}</div>
                      <div className="text-sm text-gray-400">
                        {t('teamHub.strength')} {driver.strength} • {t('teamHub.fatigue')} {driver.fatigue} • {driver.wearyState}
                      </div>
                    </div>
                    <div className="text-sm text-gray-300">{driver.filledSlots} {t('teamHub.slotsPlanned')}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">{t('teamHub.noDriverData')}</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">{t('teamHub.pitCrewTraining')}</h3>
            <button
              onClick={() => navigate('/training-calendar')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {t('teamHub.openCalendar')}
            </button>
          </div>

          {trainingSummary?.pitCrew ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="font-semibold text-white">{t('teamHub.pitCrew')}</div>
                <div className="mt-2 text-sm text-gray-400">
                  {t('teamHub.level')} {trainingSummary.pitCrew.level} • {t('teamHub.errorRate')} {trainingSummary.pitCrew.errorRate} • {t('teamHub.speedBonus')} +{trainingSummary.pitCrew.speedBonus.toFixed(1)}%
                </div>
                <div className="mt-2 text-sm text-gray-300">
                  {trainingSummary.pitCrew.filledSlots} {t('teamHub.slotsThisRound')}
                </div>
              </div>
              <p className="text-sm text-gray-400">
                {t('teamHub.scheduleHint')}
              </p>
            </div>
          ) : (
            <p className="text-zinc-500 dark:text-zinc-400">{t('teamHub.noPitCrewData')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
