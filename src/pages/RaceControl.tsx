import React, { useEffect } from 'react';
import { useRaceStore } from '../store/raceStore';
import { useGameLoop } from '../hooks/useGameLoop';
import { LiveLeaderboard } from '../components/race/LiveLeaderboard';
import { TelemetryPanel } from '../components/race/TelemetryPanel';
import { CircularTrackMap } from '../components/CircularTrackMap';

import { TRACKS } from '../data/tracks';

export const RaceControl: React.FC = () => {
  const { 
    initRace, 
    startRace, 
    isPlaying, 
    raceState, 
    setTrack, 
    selectedTrackId,
    toggleWeatherMode,
    fetchRealWeather
  } = useRaceStore();
  
  // Start game loop
  useGameLoop();
  
  // Initialize race on mount or when track changes
  useEffect(() => {
    initRace();
  }, [initRace, selectedTrackId]);

  // Real Weather Auto-Fetch
  useEffect(() => {
      if (raceState?.weatherMode === 'real') {
          fetchRealWeather(); // Initial fetch
          const interval = setInterval(fetchRealWeather, 60000); // Every minute
          return () => clearInterval(interval);
      }
  }, [raceState?.weatherMode, fetchRealWeather]);

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold">Race Control Center</h2>
                <div className="text-sm text-gray-400 font-mono mt-1">
                    {raceState ? `Lap ${raceState.currentLap}/${raceState.totalLaps} • ${raceState.trackTemp}°C • ${raceState.weather.toUpperCase()} • ${raceState.safetyCar !== 'none' ? raceState.safetyCar.toUpperCase() : 'GREEN'}` : 'Initializing...'}
                </div>
            </div>
            
            {/* Track Selector */}
            <select 
                value={selectedTrackId}
                onChange={(e) => setTrack(e.target.value)}
                disabled={isPlaying}
                className="bg-[#222] text-white border border-[#444] rounded px-3 py-1 text-sm disabled:opacity-50"
            >
                {TRACKS.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
            
            {/* Weather Mode Toggle */}
            <button
                onClick={toggleWeatherMode}
                className={`px-3 py-1 rounded text-xs font-bold uppercase border transition-colors ${
                    raceState?.weatherMode === 'real' 
                    ? 'bg-blue-900 border-blue-500 text-blue-100' 
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                }`}
                title="Toggle Real Weather API"
            >
                {raceState?.weatherMode === 'real' ? 'Real Weather' : 'Sim Weather'}
            </button>
        </div>
        
        <button 
          onClick={startRace}
          disabled={isPlaying}
          className="px-6 py-2 bg-[#00FFFF] text-black font-bold rounded hover:bg-[#ccffff] disabled:opacity-50 transition-colors"
        >
          {isPlaying ? 'RACING' : 'START RACE'}
        </button>
      </header>

      {raceState && raceState.safetyCar !== 'none' && (
        <div className={`w-full py-2 px-4 rounded font-bold text-center uppercase tracking-widest ${
            raceState.safetyCar === 'red-flag' ? 'bg-red-600 text-white animate-pulse' : 'bg-yellow-400 text-black'
        }`}>
            {raceState.safetyCar === 'red-flag' ? 'RED FLAG - SESSION SUSPENDED' : 
             raceState.safetyCar === 'sc' ? 'SAFETY CAR DEPLOYED' : 'VIRTUAL SAFETY CAR'}
        </div>
      )}
      
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
            <div className="bg-[#111] rounded-xl border border-[#333] h-80 p-4 flex flex-col">
                 <h3 className="text-gray-400 text-sm mb-2 uppercase tracking-widest font-mono">Track Map</h3>
                 <div className="flex-1 flex items-center justify-center overflow-hidden">
                    <CircularTrackMap />
                </div>
            </div>
             
             {/* Telemetry Panel */}
             <div className="flex-1 min-h-0">
                 {raceState && <TelemetryPanel raceState={raceState} />}
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
