import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flag, FolderOpen, Trophy } from 'lucide-react';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassCard } from '../components/ui/GlassCard';

export const OfflineChampionship: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-full p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-f1-red/30 bg-f1-red/10 text-f1-red text-xs font-bold tracking-[0.2em] uppercase">
            <Flag size={12} /> Offline MVP Path
          </div>
          <h1 className="text-4xl md:text-5xl font-orbitron font-black italic text-white tracking-tight">
            Offline Championship
          </h1>
          <p className="max-w-2xl mx-auto text-gray-300 text-lg">
            This route is the new local-first entry point for the race-weekend simulator MVP. It will host offline championship creation, save loading, standings, and round progression without requiring Supabase.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <GlassCard className="space-y-4 border-white/10">
            <div className="flex items-center gap-3 text-white">
              <Trophy className="text-yellow-400" />
              <h2 className="text-xl font-bold">Planned responsibilities</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-300 list-disc pl-5">
              <li>Create a local championship save</li>
              <li>Resume an existing offline save</li>
              <li>Show round progression and standings</li>
              <li>Enter the next weekend without backend auth</li>
            </ul>
          </GlassCard>

          <GlassCard className="space-y-4 border-white/10">
            <div className="flex items-center gap-3 text-white">
              <FolderOpen className="text-f1-red" />
              <h2 className="text-xl font-bold">Current status</h2>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              This is currently a structural shell only. The next implementation step is wiring this route to local save data, offline championship state, and weekend launch flow.
            </p>
            <GlassButton onClick={() => navigate('/offline/weekend')} className="w-full">
              Open Offline Weekend Shell
            </GlassButton>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
