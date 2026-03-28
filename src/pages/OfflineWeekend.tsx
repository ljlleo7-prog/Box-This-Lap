import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, RadioTower, Wrench } from 'lucide-react';
import { GlassButton } from '../components/ui/GlassButton';
import { GlassCard } from '../components/ui/GlassCard';

export const OfflineWeekend: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-full p-8 flex items-center justify-center">
      <div className="w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-f1-red/30 bg-f1-red/10 text-f1-red text-xs font-bold tracking-[0.2em] uppercase">
              <RadioTower size={12} /> Offline Weekend Shell
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-orbitron font-black italic text-white tracking-tight">
                Weekend Operations
              </h1>
              <p className="mt-3 max-w-2xl text-gray-300 text-lg">
                This shell will become the local weekend orchestration surface for practice, qualifying, race prep, and session-to-session persistence.
              </p>
            </div>
          </div>

          <GlassButton onClick={() => navigate('/offline')} className="inline-flex items-center gap-2">
            <ChevronLeft size={16} /> Back to Offline Championship
          </GlassButton>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <GlassCard className="space-y-4 border-white/10">
            <div className="flex items-center gap-3 text-white">
              <CalendarDays className="text-cyan-400" />
              <h2 className="text-lg font-bold">Weekend flow</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-300 list-disc pl-5">
              <li>Load the current round and track context</li>
              <li>Advance through practice, qualifying, and race</li>
              <li>Persist setup choices and session summaries</li>
            </ul>
          </GlassCard>

          <GlassCard className="space-y-4 border-white/10">
            <div className="flex items-center gap-3 text-white">
              <Wrench className="text-yellow-400" />
              <h2 className="text-lg font-bold">State inputs</h2>
            </div>
            <ul className="space-y-2 text-sm text-gray-300 list-disc pl-5">
              <li>Weekend store as active session source</li>
              <li>Championship store for round and standings context</li>
              <li>Local save helpers for durability between visits</li>
            </ul>
          </GlassCard>

          <GlassCard className="space-y-4 border-white/10">
            <div className="flex items-center gap-3 text-white">
              <RadioTower className="text-f1-red" />
              <h2 className="text-lg font-bold">Next handoff</h2>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              The next implementation step is connecting this route to weekend bootstrap logic, then feeding the existing race simulator with offline championship context instead of backend-authenticated flows.
            </p>
            <GlassButton onClick={() => navigate('/race-dev')} className="w-full">
              Open Race Sandbox
            </GlassButton>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
