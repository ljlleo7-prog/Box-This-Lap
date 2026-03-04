import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { TCC_API } from '../lib/tcc-api';
import { supabase } from '../lib/supabase';

const FACILITY_CONFIG: Record<string, { label: string; cost: number; }> = {
  factory: { label: 'Factory', cost: 100 },
  aero: { label: 'Wind Tunnel', cost: 150 },
  powertrain: { label: 'Powertrain', cost: 150 },
  simulator: { label: 'Simulator', cost: 120 },
  pit_crew: { label: 'Pit Crew', cost: 80 },
  logistics: { label: 'Logistics', cost: 90 },
};

export const Facilities: React.FC = () => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<any[]>([]);
  const [wallet, setWallet] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in.');
        return;
      }
      const { data: championships } = await TCC_API.getChampionships();
      if (!championships?.length) {
        setError('No championships found.');
        return;
      }
      const champId = championships[0].id;
      const { data: myTeam } = await TCC_API.getMyTeam(champId);
      if (!myTeam) {
        setError('You do not own a team yet.');
        return;
      }
      setTeamId(myTeam.id);
      const fac = await TCC_API.getFacilities(myTeam.id);
      const walletRes = await TCC_API.getWalletBalance();
      if (fac.data) {
        setLevels(fac.data.levels || {});
        setQueue(fac.data.upgrade_queue || []);
      }
      if (walletRes.data) setWallet(walletRes.data.token_balance || 0);
    } catch (e) {
      setError('Failed to load facilities.');
    } finally {
      setLoading(false);
    }
  };

  const enqueue = async (facility: string) => {
    if (!teamId) return;
    const res = await TCC_API.enqueueFacilityUpgrade(teamId, facility);
    if (res.error) {
      setError('Upgrade failed.');
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
        <div className="text-gray-400">Wallet: <span className="text-white font-bold">{wallet} TKN</span></div>
        <GlassButton onClick={completeReady}>Complete Ready Upgrades</GlassButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(FACILITY_CONFIG).map(([key, cfg]) => (
          <GlassCard key={key} className="p-6">
            <h3 className="text-lg font-bold text-white mb-2">{cfg.label}</h3>
            <p className="text-sm text-gray-400 mb-4">Level {levels?.[key] ?? 1}</p>
            <GlassButton onClick={() => enqueue(key)}>
              Upgrade ({cfg.cost} TKN)
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
