import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { TCC_API } from '../lib/tcc-api';
import { supabase } from '../lib/supabase';
import { useChampionshipStore } from '../store/championshipStore';

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
        setError('Please sign in.');
        return;
      }
      if (mode === 'local') {
        setError('Facilities are only available in online championships.');
        return;
      }
      if (!activeChampionshipId) {
        setError('Select a championship first.');
        return;
      }
      setChampionshipId(activeChampionshipId);
      const { data: myTeam } = await TCC_API.getMyTeam(activeChampionshipId);
      if (!myTeam) {
        setError('You do not own a team yet.');
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
      }
    } catch {
      setError('Failed to load facilities.');
    } finally {
      setLoading(false);
    }
  };

  const convertToCash = async () => {
    if (!championshipId) return;
    if (!Number.isFinite(tokenToConvert) || tokenToConvert <= 0) {
      setError('Enter a valid token amount.');
      return;
    }
    setConverting(true);
    setError(null);
    try {
      const { data, error: convertError } = await TCC_API.convertTokensToCash(championshipId, tokenToConvert);
      if (convertError) throw convertError;
      if (!data?.success) {
        setError(data?.message || 'Conversion failed.');
        return;
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  const enqueue = async (facility: string) => {
    if (!teamId) return;
    const res = await TCC_API.enqueueFacilityUpgrade(teamId, facility);
    if (res.error || (res.data && !res.data.success)) {
      setError(res.data?.message || 'Upgrade failed.');
      return;
    }
    await load();
  };

  const completeReady = async () => {
    if (!teamId) return;
    await TCC_API.completeReadyUpgrades(teamId);
    await load();
  };

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Facilities" description="Upgrade your team infrastructure" />
      <div className="flex items-center justify-between">
        <div className="text-gray-400">
          Wallet:
          <span className="text-white font-bold ml-2">{tokenBalance} TKN</span>
          <span className="text-gray-500 mx-2">|</span>
          <span className="text-white font-bold">{cashBalance.toLocaleString()} CASH</span>
        </div>
        <GlassButton onClick={completeReady}>Complete Ready Upgrades</GlassButton>
      </div>
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <div className="text-xs text-gray-500 mb-1">Token Price</div>
            <div className="text-white font-bold">1 TKN = {Math.round(cashPerToken).toLocaleString()} CASH</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Weekly Remaining</div>
            <div className="text-white font-bold">{Math.floor(weeklyRemaining)} TKN</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Season Cap Remaining</div>
            <div className="text-white font-bold">{seasonRemainingCash.toLocaleString()} CASH</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Convert TKN → CASH</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={tokenToConvert}
                onChange={(e) => setTokenToConvert(Number(e.target.value))}
                className="w-24 bg-[#1a1a1a] border border-white/10 text-white p-2 rounded-lg focus:border-f1-red outline-none"
              />
              <GlassButton onClick={convertToCash} isLoading={converting}>Convert</GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(FACILITY_CONFIG).map(([key, cfg]) => (
          <GlassCard key={key} className="p-6">
            <h3 className="text-lg font-bold text-white mb-2">{cfg.label}</h3>
            <p className="text-sm text-gray-400 mb-4">Level {levels?.[key] ?? 1}</p>
            <GlassButton onClick={() => enqueue(key)} disabled={cashBalance < cfg.costCash}>
              Upgrade ({cfg.costCash.toLocaleString()} CASH)
            </GlassButton>
          </GlassCard>
        ))}
      </div>
      <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
        <h3 className="text-lg font-bold text-white mb-2">Upgrade Queue</h3>
        {queue.length === 0 ? (
          <p className="text-gray-400">No upgrades queued.</p>
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
