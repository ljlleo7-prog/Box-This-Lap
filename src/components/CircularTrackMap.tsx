import React from 'react';
import { useRaceStore } from '../store/raceStore';
import { motion } from 'framer-motion';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';

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
        {/* Base Track Line (Dark) */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TRACK_RADIUS}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="14"
        />

        {/* Sectors / Corner Types Visualization */}
        {track.sectors.map((sector, idx) => {
             // Calculate start and end angles
             // SVG arc starts at 3 o'clock (0 radians). We want 12 o'clock (-PI/2).
             const startProgress = sector.startDistance / totalDistance;
             const endProgress = sector.endDistance / totalDistance;
             
             // Circumference = 2 * PI * R
             // Dash array logic for stroke-dasharray
             const circumference = 2 * Math.PI * TRACK_RADIUS;
             const sectorLength = (sector.endDistance - sector.startDistance) / totalDistance * circumference;
             const gapLength = circumference - sectorLength;
             const dashOffset = circumference * 0.25 - (startProgress * circumference); 
             
             // Color Mapping
             let color = '#444'; // Straight (Default)
             if (sector.type === 'corner_high_speed') color = '#fbbf24'; // Yellow
             if (sector.type === 'corner_medium_speed') color = '#f97316'; // Orange
             if (sector.type === 'corner_low_speed') color = '#ef4444'; // Red
             if (sector.type === 'straight') color = '#555'; // Grey for straights

             // Check if this sector is part of a DRS Zone
             const isDRS = track.drsZones.some(zone => 
                (sector.startDistance >= zone.activationDistance && sector.startDistance < zone.endDistance) ||
                (sector.endDistance > zone.activationDistance && sector.endDistance <= zone.endDistance)
             );
             if (isDRS && sector.type === 'straight') color = '#22c55e'; // Green for DRS straights

             return (
                 <circle
                    key={`sector-${idx}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={TRACK_RADIUS}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeDasharray={`${sectorLength} ${gapLength}`}
                    strokeDashoffset={dashOffset}
                    className="transition-colors duration-300"
                 />
             );
        })}

        {/* Pit Lane (Blue Line inside) */}
        <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS - 15}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="4"
            strokeDasharray={`${(track.pitLane.entryDistance < track.pitLane.exitDistance 
                ? (track.pitLane.exitDistance - track.pitLane.entryDistance + totalDistance) 
                : (track.pitLane.exitDistance + totalDistance - track.pitLane.entryDistance)
                ) / totalDistance * 2 * Math.PI * (TRACK_RADIUS - 15)} ${2 * Math.PI * (TRACK_RADIUS - 15)}`}
            strokeDashoffset={2 * Math.PI * (TRACK_RADIUS - 15) * 0.25 - (track.pitLane.entryDistance / totalDistance * 2 * Math.PI * (TRACK_RADIUS - 15))}
            opacity="0.6"
        />

        {/* Start/Finish Line */}
        <line
          x1={CENTER}
          y1={CENTER - TRACK_RADIUS - 10}
          x2={CENTER}
          y2={CENTER - TRACK_RADIUS + 10}
          stroke="#fff"
          strokeWidth="2"
        />

        {/* Legend */}
        <g transform="translate(10, 270)">
            <rect x="0" y="0" width="8" height="8" fill="#ef4444" rx="2" />
            <text x="12" y="7" fill="#888" fontSize="8" fontFamily="monospace">Slow</text>
            
            <rect x="40" y="0" width="8" height="8" fill="#f97316" rx="2" />
            <text x="52" y="7" fill="#888" fontSize="8" fontFamily="monospace">Med</text>
            
            <rect x="80" y="0" width="8" height="8" fill="#fbbf24" rx="2" />
            <text x="92" y="7" fill="#888" fontSize="8" fontFamily="monospace">Fast</text>

            <rect x="120" y="0" width="8" height="8" fill="#22c55e" rx="2" />
            <text x="132" y="7" fill="#888" fontSize="8" fontFamily="monospace">DRS</text>
        </g>

        {/* Cars */}
        {vehicles.map((vehicle) => {
          const driver = DRIVERS.find(d => d.id === vehicle.driverId);
          const color = driver?.color || '#fff';
          
          // Calculate angle: 0 at top (-90deg), clockwise
          const progress = vehicle.distanceOnLap / totalDistance;
          const angle = (progress * 2 * Math.PI) - (Math.PI / 2);
          
          // Use smaller radius if in pit
          const radius = vehicle.isInPit ? TRACK_RADIUS - 15 : TRACK_RADIUS;
          
          const x = CENTER + radius * Math.cos(angle);
          const y = CENTER + radius * Math.sin(angle);

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
