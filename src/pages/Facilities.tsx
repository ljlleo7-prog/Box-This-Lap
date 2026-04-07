import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { TCC_API } from '../lib/tcc-api';
import { supabase } from '../lib/supabase';
import { useChampionshipStore } from '../store/championshipStore';
import { useI18n } from '../i18n/I18nProvider';

type UpgradeQueueItem = {
  id: string;
  facility: string;
  target_level: number;
  completes_at: string;
};

const FACILITY_CONFIG: Record<string, { label: string; costCash: number; }> = {
  factory: { label: 'Factory', costCash: 1200000 },
  aero: { label: 'Wind Tunnel', costCash: 1500000 },
  powertrain: { label: 'Powertrain', costCash: 1450000 },
  simulator: { label: 'Simulator', costCash: 1000000 },
  pit_crew: { label: 'Pit Crew', costCash: 800000 },
  logistics: { label: 'Logistics', costCash: 700000 },
};

export const Facilities: React.FC = () => {
  const { t } = useI18n();
  const activeChampionshipId = useChampionshipStore((state) => state.championshipId);
  const mode = useChampionshipStore((state) => state.mode);
  const [championshipId, setChampionshipId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<UpgradeQueueItem[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [cashPerToken, setCashPerToken] = useState<number>(10000);
  const [weeklyRemaining, setWeeklyRemaining] = useState<number>(0);
  const [seasonRemainingCash, setSeasonRemainingCash] = useState<number>(0);
  const [dailyBudgetCash, setDailyBudgetCash] = useState<number | null>(null);
  const [dailyBudgetRemainingCash, setDailyBudgetRemainingCash] = useState<number | null>(null);
  const [weeklyBudgetCash, setWeeklyBudgetCash] = useState<number | null>(null);
  const [weeklyBudgetRemainingCash, setWeeklyBudgetRemainingCash] = useState<number | null>(null);
  const [budgetDate, setBudgetDate] = useState<string | null>(null);
  const [budgetWeek, setBudgetWeek] = useState<string | null>(null);
  const [budgetTimezone, setBudgetTimezone] = useState<string>('UTC');
  const [isBetaEconomy, setIsBetaEconomy] = useState(false);
  const [tokenToConvert, setTokenToConvert] = useState<number>(100);
  const [converting, setConverting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [activeChampionshipId, mode]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError(t('facilities.error.signIn'));
        return;
      }
      if (mode === 'local') {
        setError(t('facilities.error.onlineOnly'));
        return;
      }
      if (!activeChampionshipId) {
        setError(t('facilities.error.selectChampionship'));
        return;
      }
      setChampionshipId(activeChampionshipId);
      const { data: myTeam } = await TCC_API.getMyTeam(activeChampionshipId);
      if (!myTeam) {
        setError(t('facilities.error.noTeam'));
        return;
      }
      setTeamId(myTeam.id);
      const fac = await TCC_API.getFacilities(myTeam.id);
      const walletRes = await TCC_API.getWalletBalance(activeChampionshipId);
      if (fac.data) {
        setLevels(fac.data.levels || {});
        setQueue(fac.data.upgrade_queue || []);
      }
      if (walletRes.data?.success) {
        setTokenBalance(walletRes.data.wallet?.token_balance || 0);
        setCashBalance(walletRes.data.wallet?.cash_balance || 0);
        setCashPerToken(walletRes.data.pricing?.cash_per_token || 10000);
        setWeeklyRemaining(walletRes.data.caps?.weekly_investment_remaining_tkn || 0);
        setSeasonRemainingCash(walletRes.data.caps?.seasonal_converted_cash_remaining || 0);
        setDailyBudgetCash(walletRes.data.caps?.daily_budget_cash ?? null);
        setDailyBudgetRemainingCash(walletRes.data.caps?.daily_budget_remaining_cash ?? null);
        setWeeklyBudgetCash(walletRes.data.caps?.weekly_budget_cash ?? null);
        setWeeklyBudgetRemainingCash(walletRes.data.caps?.weekly_budget_remaining_cash ?? null);
        setBudgetDate(walletRes.data.economy?.budget_date ?? null);
        setBudgetWeek(walletRes.data.economy?.budget_week ?? null);
        setBudgetTimezone(walletRes.data.economy?.budget_timezone || 'UTC');
        setIsBetaEconomy(walletRes.data.economy?.mode === 'beta_calendar_budget');
      }
    } catch {
      setError(t('facilities.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const convertToCash = async () => {
    if (!championshipId) return;
    if (!Number.isFinite(tokenToConvert) || tokenToConvert <= 0) {
      setError(t('facilities.error.validTokenAmount'));
      return;
    }
    setConverting(true);
    setError(null);
    try {
      const { data, error: convertError } = await TCC_API.convertTokensToCash(championshipId, tokenToConvert);
      if (convertError) throw convertError;
      if (!data?.success) {
        setError(data?.message || t('facilities.error.conversionFailed'));
        return;
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('facilities.error.conversionFailed'));
    } finally {
      setConverting(false);
    }
  };

  const enqueue = async (facility: string) => {
    if (!teamId) return;
    const res = await TCC_API.enqueueFacilityUpgrade(teamId, facility);
    if (res.error || (res.data && !res.data.success)) {
      setError(res.data?.message || t('facilities.error.upgradeFailed'));
      return;
    }
    await load();
  };

  const completeReady = async () => {
    if (!teamId) return;
    await TCC_API.completeReadyUpgrades(teamId);
    await load();
  };

  if (loading) return <div className="p-6 text-zinc-500 dark:text-zinc-400">{t('common.loading')}</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={t('facilities.title')} description={t('facilities.description')} />
      <div className="flex items-center justify-between">
        <div className="text-zinc-500 dark:text-zinc-400">
          {isBetaEconomy ? (
            <>
              {t('facilities.budget')}:
              <span className="text-white font-bold ml-2">{cashBalance.toLocaleString()} {t('common.cashUnit')}</span>
            </>
          ) : (
            <>
              {t('facilities.wallet')}:
              <span className="text-white font-bold ml-2">{tokenBalance} TKN</span>
              <span className="text-gray-500 mx-2">|</span>
              <span className="font-bold text-zinc-900 dark:text-white">{cashBalance.toLocaleString()} {t('common.cashUnit')}</span>
            </>
          )}
        </div>
        <GlassButton onClick={completeReady}>{t('facilities.completeReady')}</GlassButton>
      </div>
      <GlassCard className="p-6">
        {isBetaEconomy ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.dailyBudget')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{(dailyBudgetCash ?? 0).toLocaleString()} {t('common.cashUnit')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.dailyRemaining')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{(dailyBudgetRemainingCash ?? 0).toLocaleString()} {t('common.cashUnit')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.weeklyRemaining')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{(weeklyBudgetRemainingCash ?? 0).toLocaleString()} {t('common.cashUnit')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.budgetWindow')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{budgetDate ?? '—'}</div>
              <div className="text-xs text-gray-500 mt-1">{budgetWeek ?? '—'} · {budgetTimezone}</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.tokenPrice')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">1 TKN = {Math.round(cashPerToken).toLocaleString()} {t('common.cashUnit')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.weeklyRemaining')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{Math.floor(weeklyRemaining)} TKN</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.seasonCapRemaining')}</div>
              <div className="font-bold text-zinc-900 dark:text-white">{seasonRemainingCash.toLocaleString()} {t('common.cashUnit')}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t('facilities.convertTokenToCash')}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={tokenToConvert}
                  onChange={(e) => setTokenToConvert(Number(e.target.value))}
                  className="w-24 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900 outline-none focus:border-f1-red dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white"
                />
                <GlassButton onClick={convertToCash} isLoading={converting}>{t('facilities.convert')}</GlassButton>
              </div>
            </div>
          </div>
        )}
      </GlassCard>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(FACILITY_CONFIG).map(([key, cfg]) => (
          <GlassCard key={key} className="p-6">
            <h3 className="text-lg font-bold text-white mb-2">{cfg.label}</h3>
            <p className="text-sm text-gray-400 mb-4">{t('facilities.level')} {levels?.[key] ?? 1}</p>
            <GlassButton onClick={() => enqueue(key)} disabled={cashBalance < cfg.costCash}>
              {t('facilities.upgrade')} ({cfg.costCash.toLocaleString()} {t('common.cashUnit')})
            </GlassButton>
          </GlassCard>
        ))}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-bold text-white mb-2">{t('facilities.upgradeQueue')}</h3>
        {queue.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">{t('facilities.noQueuedUpgrades')}</p>
        ) : (
          <div className="space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-300">
                <span>{FACILITY_CONFIG[item.facility]?.label ?? item.facility}</span>
                <span>→ L{item.target_level}</span>
                <span>{new Date(item.completes_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
