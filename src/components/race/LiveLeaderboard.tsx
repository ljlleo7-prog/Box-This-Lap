import React from 'react';
import { useRaceStore } from '../../store/raceStore';
import { clsx } from 'clsx';
import { DRIVERS } from '../../data/initialData';
import { formatTime, formatGap } from '../../utils/format';
import { motion, AnimatePresence } from 'framer-motion';

export const LiveLeaderboard: React.FC = () => {
  const raceState = useRaceStore(state => state.raceState);
  
  // Track previous positions for change detection
  const prevPositionsRef = React.useRef<Record<string, number>>({});
  const [changes, setChanges] = React.useState<Record<string, { type: 'up' | 'down', time: number }>>({});
  
  // Detect position changes
  React.useEffect(() => {
    if (!raceState) return;

    const newChanges: Record<string, { type: 'up' | 'down', time: number }> = {};
    let hasNewChanges = false;
    
    // We iterate over the CURRENT vehicles to check against PREVIOUS positions
    raceState.vehicles.forEach(v => {
      const prevPos = prevPositionsRef.current[v.id];
      // Only register change if we had a previous position and it's different
      if (prevPos !== undefined && prevPos !== v.position) {
        const type = prevPos > v.position ? 'up' : 'down';
        newChanges[v.id] = { type, time: Date.now() };
        hasNewChanges = true;
      }
      prevPositionsRef.current[v.id] = v.position;
    });

    if (hasNewChanges) {
      setChanges(prev => ({ ...prev, ...newChanges }));
    }
  }, [raceState?.vehicles]);

  if (!raceState) return null;

  // Create a sorted copy of vehicles for rendering
  const sortedVehicles = [...raceState.vehicles].sort((a, b) => a.position - b.position);

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
      
      <AnimatePresence mode='popLayout'>
        {sortedVehicles.map(vehicle => {
            const driver = DRIVERS.find(d => d.id === vehicle.driverId);
            if (!driver) return null;
            
            const change = changes[vehicle.id];
            // Flash lasts 2 seconds
            const isFlashing = change && (Date.now() - change.time < 2000);
            
            // Define flash background color
            let flashBg = undefined;
            if (isFlashing) {
                flashBg = change.type === 'up' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
            }

            return (
              <motion.div 
                layout
                key={vehicle.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ 
                    opacity: 1, 
                    y: 0,
                    backgroundColor: flashBg || '#222'
                }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-12 gap-2 items-center p-2 rounded border-l-4 text-xs relative overflow-hidden"
                style={{ 
                    borderLeftColor: driver.color,
                }}
              >
                <div className="col-span-1 font-bold text-center text-gray-400 flex items-center justify-center gap-1">
                    {vehicle.position}
                    {isFlashing && (
                        <motion.span 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1.2 }}
                            className={clsx("text-[8px]", change.type === 'up' ? "text-green-500" : "text-red-500")}
                        >
                            {change.type === 'up' ? '▲' : '▼'}
                        </motion.span>
                    )}
                </div>
                <div className="col-span-1 text-center font-bold font-mono uppercase text-white">{driver.id}</div>
                <div className="col-span-4 font-medium truncate text-gray-200">{driver.name}</div>
                <div className={clsx("col-span-2 text-right font-mono", vehicle.drsOpen ? "text-green-500 font-bold" : "text-[#00FFFF]")}>
                   {vehicle.position === 1 ? 'Leader' : formatGap(vehicle.gapToAhead)}
                   {vehicle.drsOpen && <span className="ml-1 text-[8px] bg-green-500 text-black px-1 rounded align-top">DRS</span>}
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
              </motion.div>
            );
        })}
      </AnimatePresence>
    </div>
  );
};
