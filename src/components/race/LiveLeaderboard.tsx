import React from 'react';
import { useRaceStore } from '../../store/raceStore';
import { clsx } from 'clsx';
import { DRIVERS } from '../../data/initialData';
import { formatTime, formatGap } from '../../utils/format';

export const LiveLeaderboard: React.FC = () => {
  const raceState = useRaceStore(state => state.raceState);
  
  if (!raceState) return null;

  // Sort by position just in case, though engine should handle it
  const vehicles = [...raceState.vehicles].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full pr-2">
      <div className="grid grid-cols-12 gap-2 items-center px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">
          <div className="col-span-1 text-center">Pos</div>
          <div className="col-span-1 text-center">No</div>
          <div className="col-span-4">Driver</div>
          <div className="col-span-2 text-right">Gap</div>
          <div className="col-span-2 text-center">Tyre</div>
          <div className="col-span-2 text-right">Last Lap</div>
      </div>
      
      {vehicles.map(vehicle => {
        const driver = DRIVERS.find(d => d.id === vehicle.driverId);
        if (!driver) return null;
        
        return (
          <div 
            key={vehicle.id} 
            className="grid grid-cols-12 gap-2 items-center bg-[#222] p-2 rounded border-l-4 text-xs transition-all duration-300"
            style={{ borderLeftColor: driver.color }}
          >
            <div className="col-span-1 font-bold text-center text-gray-400">{vehicle.position}</div>
            <div className="col-span-1 text-center font-bold font-mono uppercase text-white">{driver.id}</div>
            <div className="col-span-4 font-medium truncate text-gray-200">{driver.name}</div>
            <div className="col-span-2 text-right font-mono text-[#00FFFF]">
               {formatGap(vehicle.gapToLeader)}
            </div>
             <div className="col-span-2 text-center flex items-center justify-center gap-1">
               <span className={clsx(
                   "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-black",
                   vehicle.tyreCompound === 'soft' && "bg-red-500",
                   vehicle.tyreCompound === 'medium' && "bg-yellow-400",
                   vehicle.tyreCompound === 'hard' && "bg-white",
                   vehicle.tyreCompound === 'wet' && "bg-blue-500",
               )}>
                   {vehicle.tyreCompound[0]}
               </span>
               <span className="text-gray-500 text-[10px]">{Math.floor(vehicle.tyreAgeLaps)}L</span>
            </div>
             <div className="col-span-2 text-right font-mono text-gray-400">
               {formatTime(vehicle.lastLapTime)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
