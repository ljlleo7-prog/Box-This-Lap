import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TCC_API } from '../lib/tcc-api';
import { Team } from '../types';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { Loader2, DollarSign, Users, TrendingUp, Car } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useChampionshipStore } from '../store/championshipStore';

export const TeamSelection: React.FC = () => {
  const { id: championshipId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setActiveOnlineContext = useChampionshipStore((state) => state.setActiveOnlineContext);

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCashBalance, setWalletCashBalance] = useState<number | null>(null);
  const [isBetaChampionship, setIsBetaChampionship] = useState(false);
  const [selectedTeamBudgetPreview, setSelectedTeamBudgetPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (championshipId) {
      setActiveOnlineContext({ championshipId });
      loadData();
    }
  }, [championshipId, setActiveOnlineContext]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to continue.');
        navigate('/login');
        return;
      }
      const [teamsResponse, walletResponse] = await Promise.all([
        TCC_API.getAvailableTeams(championshipId!),
        TCC_API.getWalletBalance(championshipId!)
      ]);

      if (teamsResponse.error) throw teamsResponse.error;
      if (walletResponse.error) throw walletResponse.error;

      let availableTeams = teamsResponse.data || [];
      if (availableTeams.length === 0 && championshipId === '00000000-0000-0000-0000-000000000000') {
        // Seed Official Championship if empty, then reload
        await supabase.rpc('tcc_seed_universal_if_empty');
        const retry = await TCC_API.getAvailableTeams(championshipId!);
        if (!retry.error) availableTeams = retry.data || [];
      }
      setTeams(availableTeams);
      setWalletBalance(walletResponse.data?.wallet?.token_balance || 0);
      setWalletCashBalance(walletResponse.data?.wallet?.cash_balance || 0);
      setIsBetaChampionship(!!walletResponse.data?.economy?.is_beta);
      setSelectedTeamBudgetPreview(null);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load teams or wallet balance.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (team: Team) => {
    if (!confirm(`Join ${team.name}?`)) {
      return;
    }

    setPurchasing(team.id);
    try {
      const { data, error } = await TCC_API.purchaseTeam(team.id);

      if (error) throw error;

      if (data && data.success) {
        if (isBetaChampionship) {
          setWalletCashBalance(data.cash_awarded ?? team.budget ?? 0);
          setSelectedTeamBudgetPreview(data.cash_awarded ?? team.budget ?? 0);
        }
        setActiveOnlineContext({
          championshipId: championshipId!,
          teamId: team.id,
          teamName: team.name,
        });
        navigate(`/championships/${championshipId}`);
      } else {
        alert(data?.message || 'Failed to purchase team');
      }
    } catch (err) {
      console.error('Purchase failed:', err);
      alert('An error occurred during purchase.');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-f1-red" size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 max-w-7xl mx-auto min-h-screen animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h1 className="text-4xl font-black text-white italic tracking-tighter mb-2">
            SELECT YOUR TEAM
          </h1>
          <p className="text-gray-400 text-lg">
            {isBetaChampionship
              ? 'Choose a team to join this beta championship. Team selection is free and your starting cash comes from that team’s operating budget.'
              : 'Choose a team to compete in this championship. Better teams cost more tokens.'}
          </p>
        </div>
        
        <GlassCard className="!p-4 flex items-center gap-3 bg-gradient-to-r from-yellow-500/20 to-transparent border-yellow-500/30">
          <div className="bg-yellow-500/20 p-2 rounded-full">
            <DollarSign className="text-yellow-400" size={24} />
          </div>
          <div>
            <div className="text-xs text-yellow-200/70 uppercase font-bold tracking-wider">
              {isBetaChampionship ? 'Starting Cash' : 'Wallet Balance'}
            </div>
            <div className="text-2xl font-black text-white">
              {isBetaChampionship
                ? `${(selectedTeamBudgetPreview ?? walletCashBalance ?? 0).toLocaleString()} CASH`
                : `${walletBalance} TKN`}
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team) => {
          return (
            <GlassCard key={team.id} className="flex flex-col h-full hover:border-white/20 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-white" style={{ color: team.color }}>{team.name}</h3>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono">
                  Rep: {team.reputation}
                </div>
              </div>

              <div className="space-y-4 flex-grow">
                {/* Performance Bars */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-1"><Car size={14} /> Car Perf</span>
                    <span className="text-white">{team.performance.car}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ 
                        width: `${team.performance.car}%`,
                        backgroundColor: team.color 
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-1"><TrendingUp size={14} /> Industry</span>
                    <span className="text-white">{team.performance.industry}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000 bg-blue-500"
                      style={{ width: `${team.performance.industry}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span className="flex items-center gap-1"><Users size={14} /> Drivers</span>
                    <span className="text-white">{team.performance.drivers}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-1000 bg-green-500"
                      style={{ width: `${team.performance.drivers}%` }}
                    />
                  </div>
                </div>
                
                {/* Drivers List */}
                <div className="mt-4 p-3 bg-black/20 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500 mb-2 uppercase font-bold tracking-wider">Drivers</p>
                  <div className="space-y-1">
                    {team.drivers?.map(d => {
                      const rawDriver = d as unknown as { skills?: Record<string, number | string>; basePace?: number };
                      const s = rawDriver.skills || {};
                      const pace = rawDriver.basePace ?? s.pace ?? '—';
                      const consistency = s.consistency ?? '—';
                      const tire = s.tire_management ?? '—';
                      const racecraft = s.racecraft ?? '—';
                      const wet = s.wet_skill ?? '—';
                      return (
                        <div key={d.id} className="text-xs text-gray-300 grid grid-cols-5 gap-2">
                          <span className="truncate">{d.name}</span>
                          <span className="text-gray-500">P {pace}</span>
                          <span className="text-gray-500">C {consistency}</span>
                          <span className="text-gray-500">T {tire}</span>
                          <span className="text-gray-500">R {racecraft} / W {wet}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
                <div className="text-xl font-bold text-yellow-400">
                  {isBetaChampionship
                    ? `${(team.budget || 0).toLocaleString()} CASH budget`
                    : <>{team.token_cost} <span className="text-sm text-yellow-400/70">TKN</span></>}
                </div>
                <GlassButton 
                  onClick={() => handlePurchase(team)}
                  disabled={purchasing === team.id}
                  isLoading={purchasing === team.id}
                  className=""
                >
                  Select Team
                </GlassButton>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
