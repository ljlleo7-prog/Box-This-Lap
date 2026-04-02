import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassButton } from '../components/ui/GlassButton';
import { useNavigate } from 'react-router-dom';
import { TCC_API } from '../lib/tcc-api';
import { loadSaveGame } from '../lib/localSaves';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/I18nProvider';

export const Dashboard: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [onlineChampionship, setOnlineChampionship] = useState<any | null>(null);
  const [onlineTeam, setOnlineTeam] = useState<any | null>(null);
  const [localChampionship] = useState(loadSaveGame().championship);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        await TCC_API.ensurePlayerProfile();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: championships } = await TCC_API.getChampionships();
        const list = championships ?? [];

        for (const championship of list) {
          if (championship.created_by === user?.id) {
            setOnlineChampionship(championship);
            const { data: myTeam } = await TCC_API.getMyTeam(championship.id);
            if (myTeam) {
              setOnlineTeam(myTeam);
            }
            return;
          }

          const { data: myTeam } = await TCC_API.getMyTeam(championship.id);
          if (!myTeam) continue;

          setOnlineChampionship(championship);
          setOnlineTeam(myTeam);
          return;
        }
      } catch (error) {
        console.error('Failed to load dashboard data', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const activeTitle = onlineChampionship?.name ?? localChampionship?.name ?? null;
  const activeMode = onlineChampionship
    ? t('dashboard.onlineChampionship')
    : localChampionship
      ? t('dashboard.localChampionship')
      : null;
  const teamStatus = onlineTeam?.name
    ? `${onlineTeam.name}`
    : localChampionship
      ? localChampionship.teams.find((team) => team.teamId === localChampionship.selectedTeamId)?.teamName ?? t('dashboard.teamAssigned')
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">{t('dashboard.activeChampionship')}</h3>
          {loading ? (
            <p className="text-gray-400">{t('dashboard.loadingChampionship')}</p>
          ) : activeTitle ? (
            <>
              <p className="text-white font-semibold">{activeTitle}</p>
              <p className="text-gray-400 text-sm">{activeMode}</p>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">{t('dashboard.noActiveChampionship')}</p>
              <GlassButton onClick={() => navigate('/championships')} variant="secondary">
                {t('dashboard.openChampionships')}
              </GlassButton>
            </>
          )}
        </div>
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">{t('dashboard.nextRace')}</h3>
          {onlineChampionship ? (
            <p className="text-gray-400">{t('dashboard.scheduleOnline')}</p>
          ) : localChampionship ? (
            <p className="text-gray-400">{t('dashboard.scheduleLocal')}</p>
          ) : (
            <p className="text-gray-400">{t('dashboard.schedulePending')}</p>
          )}
        </div>
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">{t('dashboard.teamStatus')}</h3>
          {teamStatus ? (
            <p className="text-gray-400">{teamStatus}</p>
          ) : (
            <p className="text-gray-400">{t('dashboard.notSigned')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
