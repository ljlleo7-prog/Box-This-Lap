import React, { useEffect, useState } from 'react';
import { TCC_API } from '../lib/tcc-api';
import { useNavigate } from 'react-router-dom';
import { Plus, Trophy, Calendar, Users, ChevronRight, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';

export const Championships: React.FC = () => {
  const [championships, setChampionships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newChampName, setNewChampName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadChampionships();
  }, []);

  const loadChampionships = async () => {
    try {
      const { data, error } = await TCC_API.getChampionships();
      if (error) throw error;
      setChampionships(data || []);
    } catch (err) {
      console.error('Failed to load championships:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChampName.trim()) return;

    setCreating(true);
    try {
      const result = await TCC_API.createChampionship(newChampName);
      // Result contains the new championship object
      if (result && result.championship) {
        setChampionships([...championships, result.championship]);
        setNewChampName('');
      } else {
        // Fallback reload if response structure varies
        loadChampionships();
      }
    } catch (err) {
      console.error('Failed to create championship:', err);
      alert('Failed to create championship');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-7xl mx-auto min-h-screen animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter mb-2">
            CHAMPIONSHIPS
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            Manage your racing leagues, track seasons, and dominate the competition.
          </p>
        </div>
        
        <GlassCard className="!p-2 flex gap-2 w-full md:w-auto">
          <input
            type="text"
            value={newChampName}
            onChange={(e) => setNewChampName(e.target.value)}
            placeholder="New Championship Name"
            className="bg-transparent border-none text-white px-4 py-2 focus:outline-none placeholder-gray-500 min-w-[200px]"
            disabled={creating}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate(e)}
          />
          <GlassButton
            onClick={(e) => handleCreate(e as any)}
            disabled={creating || !newChampName.trim()}
            isLoading={creating}
            icon={!creating && <Plus size={18} />}
          >
            Create
          </GlassButton>
        </GlassCard>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-f1-red" size={48} />
        </div>
      ) : championships.length === 0 ? (
        <GlassCard className="text-center py-24 border-dashed border-white/10">
          <Trophy size={64} className="mx-auto mb-6 text-gray-700" />
          <h3 className="text-xl font-bold text-white mb-2">No Championships Found</h3>
          <p className="text-gray-500 mb-8">Create your first championship to get started!</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {championships.map((champ) => (
            <GlassCard 
              key={champ.id}
              hoverEffect={true}
              onClick={() => navigate(`/championships/${champ.id}`)}
              className="group cursor-pointer min-h-[200px] flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#00FFFF]/10 flex items-center justify-center text-[#00FFFF] group-hover:scale-110 transition-transform duration-300">
                        <Trophy size={24} />
                    </div>
                    <span className={clsx(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                    champ.status === 'active' 
                        ? "bg-green-500/10 text-green-400 border-green-500/30" 
                        : "bg-gray-800 text-gray-400 border-gray-700"
                    )}>
                    {champ.status}
                    </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-[#00FFFF] transition-colors line-clamp-2">
                    {champ.name}
                </h3>
                <div className="flex items-center gap-4 text-sm text-gray-400 mb-6">
                    <span className="flex items-center gap-1"><Calendar size={14} /> Season {champ.id === '00000000-0000-0000-0000-000000000000' ? 2024 : new Date(champ.created_at).getFullYear()}</span>
                    <span className="flex items-center gap-1"><Users size={14} /> 10 Teams</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <span className="text-xs font-mono text-gray-500">ID: {champ.id.slice(0, 8)}...</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#00FFFF] group-hover:text-black transition-all">
                      <ChevronRight size={16} />
                  </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};
