import React from 'react';
import { Flag, MapPin, Zap } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { LiveLeaderboard } from '../race/LiveLeaderboard';
import { CircularTrackMap } from '../CircularTrackMap';
import { TelemetryPanel } from '../race/TelemetryPanel';
import { TRACKS } from '../../data/tracks';
import { useRaceStore } from '../../store/raceStore';
import { useLiveRaceDisplayVehicles } from '../../hooks/useLiveRaceDisplayVehicles';
import type { RaceState, TrackTelemetryMetadata } from '../../types';

interface RaceWeekendShellProps {
  raceState: RaceState;
  trackName: string;
  telemetryMetadata?: TrackTelemetryMetadata;
  playerDriverIds: string[];
  rightPanel: React.ReactNode;
}

export const RaceWeekendShell: React.FC<RaceWeekendShellProps> = ({ raceState, trackName, telemetryMetadata, playerDriverIds, rightPanel }) => {
  const isAuthoritative = useRaceStore((state) => state.isAuthoritative);
  const liveSessionType = useRaceStore((state) => state.liveSessionType);
  const liveRevision = useRaceStore((state) => state.liveRevision);
  const activeTrack = TRACKS.find((track) => track.id === raceState.trackId);
  const displayVehicles = useLiveRaceDisplayVehicles({
    vehicles: raceState.vehicles,
    totalDistance: activeTrack?.totalDistance ?? 0,
    isAuthoritative,
    liveSessionType,
    liveRevision,
    raceStatus: raceState.status,
  });

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6 flex-1 min-h-0">
      <GlassCard className="col-span-12 md:col-span-3 !p-0 flex flex-col overflow-hidden h-[500px] md:h-auto">
        <div className="p-4 border-b border-white/10 bg-white/5">
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
            <Flag size={14} /> Leaderboard
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          <LiveLeaderboard />
        </div>
      </GlassCard>

      <div className="col-span-12 md:col-span-6 flex flex-col gap-4 md:gap-6 min-h-0">
        <GlassCard className="h-80 flex flex-col !p-0 relative overflow-hidden">
          <div className="absolute top-4 left-4 z-10">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
              <MapPin size={14} /> Track Map
            </h3>
            <div className="text-white font-bold text-lg mt-1">{trackName}</div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <CircularTrackMap vehicles={displayVehicles} trackId={raceState.trackId} />
          </div>
        </GlassCard>

        <GlassCard className="flex-1 min-h-[300px] !p-0 flex flex-col">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
              <Zap size={14} /> Live Telemetry
            </h3>
          </div>
          <div className="flex-1 p-4">
            <TelemetryPanel raceState={raceState} defaultDriverIds={playerDriverIds} telemetryMetadata={telemetryMetadata} />
          </div>
        </GlassCard>
      </div>

      <GlassCard className="col-span-12 md:col-span-3 !p-0 flex flex-col">
        {rightPanel}
      </GlassCard>
    </div>
  );
};
