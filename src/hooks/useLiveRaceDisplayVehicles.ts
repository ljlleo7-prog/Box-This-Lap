import { useEffect, useMemo, useRef, useState } from 'react';
import type { VehicleState } from '../types';
import type { LiveSessionType } from '../lib/tcc-api';
import type { TrackMapVehicle } from '../components/CircularTrackMap';

interface UseLiveRaceDisplayVehiclesParams {
  vehicles: VehicleState[];
  totalDistance: number;
  isAuthoritative: boolean;
  liveSessionType: LiveSessionType | null;
  liveRevision: number;
  raceStatus: 'pre-race' | 'racing' | 'finished';
}

interface DisplayVehicleState {
  distanceOnLap: number;
  isInPit: boolean;
  lapCount: number;
  speed: number;
}

const normalizeDistance = (value: number, totalDistance: number) => ((value % totalDistance) + totalDistance) % totalDistance;

const getSignedDistanceDelta = (from: number, to: number, totalDistance: number) => {
  const normalizedFrom = normalizeDistance(from, totalDistance);
  const normalizedTo = normalizeDistance(to, totalDistance);
  const forward = normalizeDistance(normalizedTo - normalizedFrom, totalDistance);
  const backward = forward - totalDistance;
  return Math.abs(backward) < forward ? backward : forward;
};

export const useLiveRaceDisplayVehicles = ({
  vehicles,
  totalDistance,
  isAuthoritative,
  liveSessionType,
  liveRevision,
  raceStatus,
}: UseLiveRaceDisplayVehiclesParams): TrackMapVehicle[] => {
  const followerSmoothingEnabled = !isAuthoritative && liveSessionType === 'race' && raceStatus === 'racing' && totalDistance > 0;
  const [displayStateByVehicle, setDisplayStateByVehicle] = useState<Record<string, DisplayVehicleState>>({});
  const targetsRef = useRef<Record<string, DisplayVehicleState>>({});
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastRevisionRef = useRef<number>(liveRevision);

  useEffect(() => {
    const nextTargets = Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, {
      distanceOnLap: normalizeDistance(vehicle.distanceOnLap, totalDistance),
      isInPit: vehicle.isInPit,
      lapCount: vehicle.lapCount,
      speed: vehicle.speed,
    }]));
    targetsRef.current = nextTargets;

    setDisplayStateByVehicle((current) => {
      if (!followerSmoothingEnabled) {
        return nextTargets;
      }

      const hasRevisionJump = liveRevision !== lastRevisionRef.current;
      lastRevisionRef.current = liveRevision;
      const nextState: Record<string, DisplayVehicleState> = {};

      vehicles.forEach((vehicle) => {
        const target = nextTargets[vehicle.id];
        const existing = current[vehicle.id];
        if (!existing) {
          nextState[vehicle.id] = target;
          return;
        }

        const signedDelta = getSignedDistanceDelta(existing.distanceOnLap, target.distanceOnLap, totalDistance);
        const mustSnap =
          !hasRevisionJump ||
          existing.isInPit !== target.isInPit ||
          existing.lapCount !== target.lapCount ||
          Math.abs(signedDelta) > totalDistance * 0.18 ||
          raceStatus !== 'racing';

        nextState[vehicle.id] = mustSnap
          ? target
          : {
              ...existing,
              isInPit: target.isInPit,
              lapCount: target.lapCount,
              speed: target.speed,
            };
      });

      return nextState;
    });
  }, [vehicles, totalDistance, followerSmoothingEnabled, liveRevision, raceStatus]);

  useEffect(() => {
    if (!followerSmoothingEnabled) {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameTimeRef.current = null;
      return;
    }

    const animate = (timestamp: number) => {
      const last = lastFrameTimeRef.current ?? timestamp;
      const deltaSeconds = Math.max(0, Math.min((timestamp - last) / 1000, 0.05));
      lastFrameTimeRef.current = timestamp;

      setDisplayStateByVehicle((current) => {
        const next: Record<string, DisplayVehicleState> = {};

        Object.entries(targetsRef.current).forEach(([vehicleId, target]) => {
          const existing = current[vehicleId] ?? target;
          if (target.isInPit || existing.isInPit) {
            const pitDelta = getSignedDistanceDelta(existing.distanceOnLap, target.distanceOnLap, totalDistance);
            next[vehicleId] = {
              ...target,
              distanceOnLap: normalizeDistance(existing.distanceOnLap + pitDelta * Math.min(1, deltaSeconds * 5), totalDistance),
            };
            return;
          }

          const signedDelta = getSignedDistanceDelta(existing.distanceOnLap, target.distanceOnLap, totalDistance);
          const projectedDistance = existing.distanceOnLap + Math.max(0, target.speed) * deltaSeconds;
          const correction = signedDelta * Math.min(1, deltaSeconds * 2.4);

          next[vehicleId] = {
            ...target,
            distanceOnLap: normalizeDistance(projectedDistance + correction, totalDistance),
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
  }, [followerSmoothingEnabled, totalDistance]);

  return useMemo(() => vehicles.map((vehicle) => {
    const display = displayStateByVehicle[vehicle.id];
    return {
      id: vehicle.id,
      driverId: vehicle.driverId,
      distanceOnLap: display?.distanceOnLap ?? normalizeDistance(vehicle.distanceOnLap, totalDistance),
      isInPit: display?.isInPit ?? vehicle.isInPit,
    };
  }), [displayStateByVehicle, totalDistance, vehicles]);
};
