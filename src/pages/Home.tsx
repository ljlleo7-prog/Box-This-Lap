import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Trophy, ArrowRight, Activity, Zap } from 'lucide-react';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassCard } from '../components/ui/GlassCard';

export default function Home() {
  const navigate = useNavigate();
  const [universalId, setUniversalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Find the Universal Championship (ID '0000...' or by name/null creator)
    const fetchUniversal = async () => {
      try {
        const { data, error } = await supabase
          .from('tcc_championships')
          .select('id')
          .or('id.eq.00000000-0000-0000-0000-000000000000,name.eq.Official Supabase Championship')
          .single();
        
        if (data) {
          setUniversalId(data.id);
        }
      } catch (err) {
        console.error('Error fetching universal championship:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUniversal();
  }, []);

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 bg-[url('https://images.unsplash.com/photo-1532906619279-a764d306b998?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center relative">
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-[#121212] backdrop-blur-sm"></div>
      
      <div className="relative z-10 max-w-2xl w-full text-center space-y-12 animate-in fade-in zoom-in duration-700">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-f1-red/10 border border-f1-red/20 text-f1-red text-xs font-rajdhani font-bold tracking-widest uppercase mb-4">
            <Zap size={12} /> Early Access v0.1.0
          </div>
          <h1 className="text-7xl md:text-8xl font-orbitron font-black text-white italic tracking-tighter leading-[0.8]">
            BOX THIS <span className="text-transparent bg-clip-text bg-gradient-to-r from-f1-red to-red-600">LAP</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 font-rajdhani font-light max-w-lg mx-auto leading-relaxed">
            The Ultimate F1 Strategy & Management Simulation
          </p>
        </div>

        <div className="grid gap-6 max-w-md mx-auto">
          {loading ? (
            <div className="p-8 text-f1-red animate-pulse font-mono tracking-widest border border-f1-red/20 rounded-lg bg-f1-red/5">
                CONNECTING TO PADDOCK...
            </div>
          ) : universalId ? (
            <GlassCard 
              hoverEffect={true}
              onClick={() => navigate(`/championships/${universalId}`)}
              className="!p-8 group cursor-pointer border-white/10 hover:border-f1-red bg-f1-carbon/80"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="text-f1-red text-xs font-bold tracking-[0.2em] mb-2">OFFICIAL SERIES</div>
                  <div className="text-3xl font-black text-white flex items-center gap-3">
                    <Trophy size={28} className="text-yellow-400" /> 
                    <span>Supabase Cup</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-f1-red group-hover:text-white transition-all duration-300">
                    <ArrowRight size={24} />
                </div>
              </div>
            </GlassCard>
          ) : (
            <div className="bg-red-900/50 border border-red-500 p-6 rounded-2xl text-red-200 backdrop-blur-md">
              Universal Championship not found. Please run migrations.
            </div>
          )}

          <GlassButton
            variant="secondary"
            onClick={() => navigate('/championships')}
            className="w-full py-4 text-lg"
            icon={<Activity size={20} />}
          >
            Browse All Championships
          </GlassButton>
        </div>
        
        <div className="pt-12 flex justify-center gap-8 text-gray-500 text-xs font-orbitron tracking-widest">
            <span>POWERED BY SUPABASE</span>
            <span>•</span>
            <span>GEEKS PRODUCTION STUDIO</span>
        </div>
      </div>
    </div>
  );
}
