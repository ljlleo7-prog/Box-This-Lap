import React from 'react';
import { useRaceStore } from '../store/raceStore';
import { motion } from 'framer-motion';
import { DRIVERS, TRACKS } from '../data/initialData';

const TRACK_RADIUS = 120;
const CENTER = 150;

export const CircularTrackMap: React.FC = () => {
  const raceState = useRaceStore(state => state.raceState);
  
  if (!raceState) {
      return (
          <div className="relative w-[300px] h-[300px] bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center shadow-lg">
             <span className="text-gray-500 font-mono text-sm">Waiting for race...</span>
          </div>
      );
  }

  const vehicles = raceState.vehicles;
  const trackId = raceState.trackId;
  
  const track = TRACKS.find(t => t.id === trackId) || TRACKS[0];
  const totalDistance = track.totalDistance;

  return (
    <div className="relative w-[300px] h-[300px] bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center shadow-lg">
        <h3 className="absolute top-4 left-4 text-xs font-mono text-neutral-500 uppercase tracking-wider">Live Tracker</h3>
      <svg width="300" height="300" viewBox="0 0 300 300">
        {/* Track Line */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TRACK_RADIUS}
          fill="none"
          stroke="#333"
          strokeWidth="6"
        />
        
        {/* Sectors (Optional visualization) */}
        {track.sectors.map((sector, idx) => {
             // Simple sector markers
             const startAngle = (sector.startDistance / totalDistance) * 2 * Math.PI - (Math.PI / 2);
             const x = CENTER + TRACK_RADIUS * Math.cos(startAngle);
             const y = CENTER + TRACK_RADIUS * Math.sin(startAngle);
             return (
                 <line key={idx} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#222" strokeWidth="1" opacity="0.5" />
             );
        })}

        {/* Start/Finish Line */}
        <line
          x1={CENTER}
          y1={CENTER - TRACK_RADIUS - 10}
          x2={CENTER}
          y2={CENTER - TRACK_RADIUS + 10}
          stroke="#fff"
          strokeWidth="2"
        />

        {/* Cars */}
        {vehicles.map((vehicle) => {
          const driver = DRIVERS.find(d => d.id === vehicle.driverId);
          const color = driver?.color || '#fff';
          
          // Calculate angle: 0 at top (-90deg), clockwise
          const progress = vehicle.distanceOnLap / totalDistance;
          const angle = (progress * 2 * Math.PI) - (Math.PI / 2);
          
          const x = CENTER + TRACK_RADIUS * Math.cos(angle);
          const y = CENTER + TRACK_RADIUS * Math.sin(angle);

          return (
            <g key={vehicle.id}>
                <motion.circle
                cx={x}
                cy={y}
                r={5}
                fill={color}
                stroke="#000"
                strokeWidth="1.5"
                initial={false}
                animate={{ cx: x, cy: y }}
                transition={{ duration: 0.1, ease: "linear" }}
                />
                {/* Driver Code Tooltip on Hover could go here */}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
