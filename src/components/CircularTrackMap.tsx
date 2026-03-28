import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import { motion } from 'framer-motion';
import { DRIVERS } from '../data/initialData';
import { TRACKS } from '../data/tracks';

const TRACK_RADIUS = 120;
const CENTER = 150;

function normalizeDistance(value: number, totalDistance: number): number {
  return ((value % totalDistance) + totalDistance) % totalDistance;
}

function deterministicDriverFactor(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return 0.94 + ((hash % 1000) / 1000) * 0.12;
}

export interface TrackMapVehicle {
  id: string;
  driverId: string;
  distanceOnLap: number;
  isInPit: boolean;
}

interface CircularTrackMapProps {
  vehicles?: TrackMapVehicle[];
  trackId?: string;
  title?: string;
  timeScale?: number;
}

interface RenderVehicleState {
  distanceOnLap: number;
  isInPit: boolean;
}

export const CircularTrackMap: React.FC<CircularTrackMapProps> = ({ vehicles: externalVehicles, trackId: externalTrackId, title = 'Live Tracker', timeScale = 1 }) => {
  const raceState = useRaceStore(state => state.raceState);
  const vehicles = useMemo(() => externalVehicles ?? raceState?.vehicles ?? [], [externalVehicles, raceState?.vehicles]);
  const trackId = externalTrackId ?? raceState?.trackId ?? TRACKS[0].id;
  const track = TRACKS.find(t => t.id === trackId) || TRACKS[0];
  const totalDistance = track.totalDistance;
  const [renderStateByVehicle, setRenderStateByVehicle] = useState<Record<string, RenderVehicleState>>({});
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const vehicleTargets = useMemo(() => {
    const map: Record<string, TrackMapVehicle> = {};
    vehicles.forEach((vehicle) => {
      map[vehicle.id] = vehicle;
    });
    return map;
  }, [vehicles]);
  const sectorMeta = useMemo(() => {
    const sectors = [...track.sectors].sort((a, b) => a.startDistance - b.startDistance);
    return sectors.map((sector) => {
      const speedMultiplier = sector.type === 'straight'
        ? 1.12
        : sector.type === 'corner_high_speed'
          ? 0.97
          : sector.type === 'corner_medium_speed'
            ? 0.84
            : 0.72;
      return {
        start: sector.startDistance,
        end: sector.endDistance,
        speedMultiplier,
      };
    });
  }, [track]);

  useEffect(() => {
    setRenderStateByVehicle((current) => {
      const next: Record<string, RenderVehicleState> = {};
      vehicles.forEach((vehicle) => {
        next[vehicle.id] = current[vehicle.id] ?? {
          distanceOnLap: normalizeDistance(vehicle.distanceOnLap, totalDistance),
          isInPit: vehicle.isInPit,
        };
      });
      return next;
    });
  }, [vehicles, totalDistance]);

  useEffect(() => {
    const getSectorMultiplier = (distanceOnLap: number): number => {
      const normalized = normalizeDistance(distanceOnLap, totalDistance);
      const sector = sectorMeta.find((item) => {
        if (item.start <= item.end) return normalized >= item.start && normalized < item.end;
        return normalized >= item.start || normalized < item.end;
      });
      return sector?.speedMultiplier ?? 1;
    };

    const animate = (timestamp: number) => {
      const last = lastFrameTimeRef.current ?? timestamp;
      const deltaSeconds = Math.max(0, Math.min((timestamp - last) / 1000, 0.08));
      const simDeltaSeconds = deltaSeconds * Math.max(timeScale, 0.1);
      lastFrameTimeRef.current = timestamp;
      setRenderStateByVehicle((current) => {
        const next = { ...current };
        Object.values(vehicleTargets).forEach((vehicle) => {
          const currentState = next[vehicle.id] ?? {
            distanceOnLap: normalizeDistance(vehicle.distanceOnLap, totalDistance),
            isInPit: vehicle.isInPit,
          };
          let currentDistance = currentState.distanceOnLap;
          const targetDistance = normalizeDistance(vehicle.distanceOnLap, totalDistance);
          const driverFactor = deterministicDriverFactor(vehicle.driverId);
          const pitSpeed = (totalDistance / 240) * driverFactor;
          const pitEntry = track.pitLane.entryDistance;
          const pitExit = track.pitLane.exitDistance;
          if (currentState.isInPit) {
            if (!vehicle.isInPit) {
              const toExit = normalizeDistance(pitExit - currentDistance, totalDistance);
              const step = Math.min(toExit, pitSpeed * simDeltaSeconds);
              currentDistance = normalizeDistance(currentDistance + step, totalDistance);
              const canExit = toExit <= Math.max(5, pitSpeed * simDeltaSeconds * 1.5);
              next[vehicle.id] = {
                distanceOnLap: canExit ? pitExit : currentDistance,
                isInPit: !canExit,
              };
              return;
            }
            const forwardGap = normalizeDistance(targetDistance - currentDistance, totalDistance);
            const backwardGap = forwardGap - totalDistance;
            const signedGap = Math.abs(backwardGap) < forwardGap ? backwardGap : forwardGap;
            const step = signedGap * Math.min(1, simDeltaSeconds * 4.6);
            next[vehicle.id] = {
              distanceOnLap: normalizeDistance(currentDistance + step, totalDistance),
              isInPit: true,
            };
            return;
          }
          const sectorMultiplier = getSectorMultiplier(currentDistance);
          const baseLapSeconds = 92;
          const baseSpeed = totalDistance / baseLapSeconds;
          const targetGap = vehicle.isInPit ? 0 : normalizeDistance(targetDistance - currentDistance, totalDistance);
          const correctionSpeed = Math.min(targetGap, totalDistance * 0.05) * 0.32;
          const speed = baseSpeed * sectorMultiplier * driverFactor + correctionSpeed;
          currentDistance = normalizeDistance(currentDistance + speed * simDeltaSeconds, totalDistance);
          if (vehicle.isInPit) {
            const toEntry = normalizeDistance(pitEntry - currentDistance, totalDistance);
            const canEnter = toEntry <= Math.max(6, speed * simDeltaSeconds * 1.6);
            next[vehicle.id] = {
              distanceOnLap: canEnter ? pitEntry : currentDistance,
              isInPit: canEnter,
            };
            return;
          }
          next[vehicle.id] = {
            distanceOnLap: currentDistance,
            isInPit: false,
          };
        });
        return next;
      });
      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameTimeRef.current = null;
    };
  }, [totalDistance, vehicleTargets, sectorMeta, timeScale, track.pitLane.entryDistance, track.pitLane.exitDistance]);

  return (
    <div className="relative w-[300px] h-[300px] bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center shadow-lg">
        <h3 className="absolute top-4 left-4 text-xs font-mono text-neutral-500 uppercase tracking-wider">{title}</h3>
      {!vehicles.length && (
        <span className="text-gray-500 font-mono text-sm">Waiting for race...</span>
      )}
      {!!vehicles.length && (
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
            strokeDasharray={`${
                (track.pitLane.entryDistance < track.pitLane.exitDistance 
                    ? (track.pitLane.exitDistance - track.pitLane.entryDistance) 
                    : (track.pitLane.exitDistance + totalDistance - track.pitLane.entryDistance)
                ) / totalDistance * 2 * Math.PI * (TRACK_RADIUS - 15)} ${2 * Math.PI * (TRACK_RADIUS - 15)}`}
            strokeDashoffset={
                // Start at 12 o'clock (0.25 offset)
                // Rotate CW by entry distance angle
                (0.25 - (track.pitLane.entryDistance / totalDistance)) * 2 * Math.PI * (TRACK_RADIUS - 15)
            }
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
          const renderState = renderStateByVehicle[vehicle.id];
          const distanceOnLap = renderState?.distanceOnLap ?? vehicle.distanceOnLap;
          const progress = distanceOnLap / totalDistance;
          const angle = (progress * 2 * Math.PI) - (Math.PI / 2);
          
          // Use smaller radius if in pit
          const radius = (renderState?.isInPit ?? vehicle.isInPit) ? TRACK_RADIUS - 15 : TRACK_RADIUS;
          
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
                transition={{ duration: Math.max(0.06, 1 / Math.max(timeScale, 1)), ease: "linear" }}
                />
                {/* Driver Code Tooltip on Hover could go here */}
            </g>
          );
        })}
      </svg>
      )}
    </div>
  );
};
