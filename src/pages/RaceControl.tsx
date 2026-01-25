import React, { useEffect } from 'react';
import { useRaceStore } from '../store/raceStore';
import { useGameLoop } from '../hooks/useGameLoop';
import { LiveLeaderboard } from '../components/race/LiveLeaderboard';

export const RaceControl: React.FC = () => {
  const { initRace, startRace, isPlaying, raceState } = useRaceStore();
  
  // Start game loop
  useGameLoop();
  
  useEffect(() => {
    initRace();
  }, [initRace]);

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      <header className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold">Race Control Center</h2>
            <div className="text-sm text-gray-400 font-mono mt-1">
                {raceState ? `Lap ${raceState.currentLap}/${raceState.totalLaps} • ${raceState.trackTemp}°C` : 'Loading...'}
            </div>
        </div>
        
        <button 
          onClick={startRace}
          disabled={isPlaying}
          className="px-6 py-2 bg-[#00FFFF] text-black font-bold rounded hover:bg-[#ccffff] disabled:opacity-50 transition-colors"
        >
          {isPlaying ? 'RACING' : 'START RACE'}
        </button>
      </header>
      
      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left: Leaderboard */}
        <div className="col-span-3 bg-[#111] rounded-xl border border-[#333] p-4 overflow-hidden flex flex-col">
            <h3 className="text-gray-400 text-sm mb-4 uppercase tracking-widest font-mono">Leaderboard</h3>
            <div className="flex-1 min-h-0">
                <LiveLeaderboard />
            </div>
        </div>
        
        {/* Center: Track Map & Telemetry */}
        <div className="col-span-6 flex flex-col gap-6 min-h-0">
            <div className="bg-[#111] rounded-xl border border-[#333] h-64 p-4 flex flex-col">
                 <h3 className="text-gray-400 text-sm mb-2 uppercase tracking-widest font-mono">Track Map</h3>
                 <div className="flex-1 flex items-center justify-center text-gray-600 italic">
                    Map Visualization
                </div>
            </div>
             <div className="bg-[#111] rounded-xl border border-[#333] flex-1 p-4 flex flex-col min-h-0">
                 <h3 className="text-gray-400 text-sm mb-2 uppercase tracking-widest font-mono">Telemetry</h3>
                 <div className="flex-1 flex items-center justify-center text-gray-600 italic">
                    Real-time Data
                </div>
            </div>
        </div>
        
        {/* Right: Strategy & Driver Info */}
        <div className="col-span-3 bg-[#111] rounded-xl border border-[#333] p-4 overflow-hidden flex flex-col">
             <h3 className="text-gray-400 text-sm mb-4 uppercase tracking-widest font-mono">Strategy</h3>
             <div className="flex-1 flex items-center justify-center text-gray-600 italic">
                Strategy Controls
            </div>
        </div>
      </div>
    </div>
  );
};
