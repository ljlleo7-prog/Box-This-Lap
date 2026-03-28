import type { Track, TrackProfile, TrackProfileLookahead, TrackProfilePhase, TrackProfileSample, TrackSector } from '../types';

const STRAIGHT_BASE_SPEED = 87;
const CORNER_BASE_SPEED: Record<TrackSector['type'], number> = {
  straight: STRAIGHT_BASE_SPEED,
  corner_high_speed: 73,
  corner_medium_speed: 55,
  corner_low_speed: 35,
};

const APPROACH_DECEL_LIMIT = 14;
const EXIT_ACCEL_LIMIT = 8.5;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1);

const wrapDistance = (distance: number, totalDistance: number): number => {
  const wrapped = distance % totalDistance;
  return wrapped < 0 ? wrapped + totalDistance : wrapped;
};

const getSectorBaseSpeed = (sector: TrackSector): number => {
  if (typeof sector.targetSpeed === 'number') {
    return sector.targetSpeed;
  }
  if (typeof sector.maxSpeed === 'number') {
    return sector.maxSpeed;
  }

  const fallback = CORNER_BASE_SPEED[sector.type] ?? 55;
  if (sector.type === 'straight') {
    const straightDifficultyPenalty = (sector.difficulty ?? 0.1) * 4;
    return fallback - straightDifficultyPenalty;
  }

  const typePenalty = sector.type === 'corner_high_speed'
    ? 11
    : sector.type === 'corner_medium_speed'
      ? 18
      : 24;
  const difficultyPenalty = Math.pow(clamp(sector.difficulty ?? 0.5, 0, 1), 1.2) * typePenalty;
  return Math.max(18, fallback - difficultyPenalty);
};

const getPhaseSpeed = (sector: TrackSector, phase: TrackProfilePhase): number => {
  const base = getSectorBaseSpeed(sector);
  if (sector.type === 'straight') {
    return base;
  }

  const difficulty = clamp(sector.difficulty ?? 0.5, 0, 1);
  const entryFactor = sector.type === 'corner_high_speed'
    ? 1.09
    : sector.type === 'corner_medium_speed'
      ? 1.05
      : 1.02;
  const exitFactor = sector.type === 'corner_high_speed'
    ? 1.04
    : sector.type === 'corner_medium_speed'
      ? 1.06
      : 1.08;
  const apexDip = sector.type === 'corner_low_speed'
    ? 1 - (0.002 + difficulty * 0.014)
    : sector.type === 'corner_medium_speed'
      ? 1 - (0.004 + difficulty * 0.02)
      : 1 - (0.006 + difficulty * 0.024);

  if (phase === 'entry') {
    return base * entryFactor;
  }

  if (phase === 'apex') {
    return base * apexDip;
  }

  return base * exitFactor;
};


const getCornerShape = (normalizedPosition: number): TrackProfilePhase => {
  if (normalizedPosition < 0.26) return 'entry';
  if (normalizedPosition < 0.62) return 'apex';
  return 'exit';
};

const evaluateSectorSpeed = (track: Track, sector: TrackSector, distance: number): { speed: number; phase: TrackProfilePhase } => {
  if (track.telemetryPoints && track.telemetryPoints.length > 1) {
    const points = track.telemetryPoints;
    let left = points[0];
    let right = points[points.length - 1];
    
    // Find the right interval
    for (let i = 0; i < points.length - 1; i++) {
      if (distance >= points[i].dist && distance <= points[i + 1].dist) {
        left = points[i];
        right = points[i + 1];
        break;
      }
    }
    
    // If distance is past the last point, wrap around to the first point
    if (distance > right.dist) {
      left = right;
      right = { dist: track.totalDistance, speed: points[0].speed };
    }

    const span = right.dist - left.dist;
    const ratio = span > 1e-6 ? clamp((distance - left.dist) / span, 0, 1) : 0;
    const speed = lerp(left.speed, right.speed, ratio);
    
    let phase: TrackProfilePhase = 'apex';
    if (sector.type === 'straight') {
      phase = 'straight';
    } else {
      // Determine if we are braking or accelerating to classify the corner phase correctly
      // We look ahead to the next bin to see if speed is increasing
      const nextRight = points[(points.indexOf(right) + 1) % points.length];
      const speedDiff = nextRight.speed - right.speed;
      
      if (speedDiff > 0.3) {
        phase = 'exit'; // Speed is increasing, we are exiting the corner
      } else if (speedDiff < -0.3) {
        phase = 'entry'; // Speed is decreasing, we are entering the corner
      } else {
        phase = 'apex'; // Speed is relatively stable, we are at the apex
      }
    }
    
    return { speed, phase };
  }

  // If the sector is telemetry-derived (has startSpeed and endSpeed), we can just use them to interpolate!
  if (typeof sector.startSpeed === 'number' && typeof sector.endSpeed === 'number') {
    const sectorLength = Math.max(1, sector.endDistance - sector.startDistance);
    const t = clamp((distance - sector.startDistance) / sectorLength, 0, 1);
    
    // For corners, linearly interpolating from start to end cuts across the apex.
    // We should dip down to the targetSpeed (which is the minSpeed of the sector) in the middle.
    const minSpeed = sector.targetSpeed ?? Math.min(sector.startSpeed, sector.endSpeed);
    
    let speed: number;
    // Only use V-shape if there is a meaningful dip (more than 3 m/s difference)
    if (minSpeed < Math.min(sector.startSpeed, sector.endSpeed) - 3) {
      if (t < 0.5) {
        speed = lerp(sector.startSpeed, minSpeed, smoothstep(t * 2));
      } else {
        speed = lerp(minSpeed, sector.endSpeed, smoothstep((t - 0.5) * 2));
      }
    } else {
      // Use linear instead of smoothstep to avoid slow acceleration at the start of exit sectors
      speed = lerp(sector.startSpeed, sector.endSpeed, t);
    }
    return { speed, phase: sector.type === 'straight' ? 'straight' : 'apex' };
  }

  if (sector.type === 'straight') {
    return { speed: getSectorBaseSpeed(sector), phase: 'straight' };
  }

  // Fallback if the sector is telemetry-derived but only has targetSpeed
  if (typeof sector.targetSpeed === 'number') {
    return { speed: sector.targetSpeed, phase: 'apex' };
  }

  const sectorLength = Math.max(1, sector.endDistance - sector.startDistance);
  const normalized = clamp((distance - sector.startDistance) / sectorLength, 0, 1);
  const phase = getCornerShape(normalized);

  const entrySpeed = getPhaseSpeed(sector, 'entry');
  const apexSpeed = getPhaseSpeed(sector, 'apex');
  const exitSpeed = getPhaseSpeed(sector, 'exit');
  const difficulty = clamp(sector.difficulty ?? 0.5, 0, 1);

  let speed: number;
  if (normalized < 0.26) {
    speed = lerp(entrySpeed, apexSpeed, smoothstep(normalized / 0.26));
  } else if (normalized < 0.62) {
    const local = (normalized - 0.26) / 0.36;
    const pinch = 1 - Math.pow(Math.sin(local * Math.PI), 2) * (0.015 + difficulty * 0.03);
    speed = apexSpeed * pinch;
  } else {
    speed = lerp(apexSpeed, exitSpeed, smoothstep((normalized - 0.62) / 0.38));
  }

  return { speed, phase };
};


const findSectorIndex = (track: Track, distance: number): number => {
  const wrapped = wrapDistance(distance, track.totalDistance);
  const index = track.sectors.findIndex(sector => wrapped >= sector.startDistance && wrapped < sector.endDistance);
  return index >= 0 ? index : track.sectors.length - 1;
};

const blendNeighbors = (track: Track, samples: TrackProfileSample[], sampleSpacing: number): TrackProfileSample[] => {
  const envelope = samples.map((sample, index) => {
    const previous = samples[(index - 1 + samples.length) % samples.length];
    const next = samples[(index + 1) % samples.length];
    const sector = track.sectors[sample.sectorIndex];
    if (typeof sector.startSpeed === 'number') {
      // It's already continuously interpolated from telemetry, no need for edge blending
      return { ...sample };
    }

    const sectorLength = Math.max(sampleSpacing, sector.endDistance - sector.startDistance);
    const distIntoSector = wrapDistance(sample.distance - sector.startDistance, track.totalDistance);
    const distToSectorEnd = Math.max(0, sector.endDistance - sample.distance);
    const entryWindow = Math.max(sampleSpacing * 4, Math.min(140, sectorLength * 0.35));
    const exitWindow = Math.max(sampleSpacing * 5, Math.min(180, sectorLength * 0.45));

    let blendedSpeed = sample.speed;
    if (distIntoSector < entryWindow) {
      const t = smoothstep(1 - (distIntoSector / entryWindow));
      blendedSpeed = lerp(sample.speed, previous.speed, t * (sector.type === 'straight' ? 0.2 : 0.55));
    }
    if (distToSectorEnd < exitWindow) {
      const t = smoothstep(1 - (distToSectorEnd / exitWindow));
      blendedSpeed = lerp(blendedSpeed, next.speed, t * (sector.type === 'straight' ? 0.25 : 0.5));
    }

    return {
      ...sample,
      speed: blendedSpeed,
    };
  });

  // If the track is using telemetry derived sectors, the raw speeds are already 
  // perfectly interpolated from the actual telemetry. The 5-point moving average 
  // would artificially flatten the peaks and raise the apexes.
  const hasTelemetrySectors = track.sectors.some(s => typeof s.startSpeed === 'number');
  if (hasTelemetrySectors || (track.telemetryPoints && track.telemetryPoints.length > 0)) {
    return envelope;
  }

  return envelope.map((sample, index) => {
    const prev2 = envelope[(index - 2 + envelope.length) % envelope.length].speed;
    const prev1 = envelope[(index - 1 + envelope.length) % envelope.length].speed;
    const next1 = envelope[(index + 1) % envelope.length].speed;
    const next2 = envelope[(index + 2) % envelope.length].speed;

    return {
      ...sample,
      speed: clamp((prev2 * 0.1) + (prev1 * 0.2) + (sample.speed * 0.4) + (next1 * 0.2) + (next2 * 0.1), 12, 110),
    };
  });
};


export const buildTrackProfile = (track: Track, sampleSpacing = 5): TrackProfile => {
  const totalDistance = Math.max(sampleSpacing, track.totalDistance);
  const sampleCount = Math.max(8, Math.ceil(totalDistance / sampleSpacing));
  const samples: TrackProfileSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const distance = Math.min(index * sampleSpacing, totalDistance - 0.001);
    const sectorIndex = findSectorIndex(track, distance);
    const sector = track.sectors[sectorIndex];
    const { speed, phase } = evaluateSectorSpeed(track, sector, distance);

    samples.push({
      distance,
      speed,
      sectorIndex,
      sectorId: sector.id,
      phase,
    });
  }

  return {
    sampleSpacing,
    totalDistance: track.totalDistance,
    samples: blendNeighbors(track, samples, sampleSpacing),
  };
};

export const lookupTrackProfileSample = (profile: TrackProfile, distance: number): TrackProfileSample => {
  const wrapped = wrapDistance(distance, profile.totalDistance);
  const index = Math.min(profile.samples.length - 1, Math.floor(wrapped / profile.sampleSpacing));
  return profile.samples[index];
};

export const lookupTrackProfileSpeed = (profile: TrackProfile, distance: number): number => {
  const wrapped = wrapDistance(distance, profile.totalDistance);
  const baseIndex = Math.floor(wrapped / profile.sampleSpacing);
  const nextIndex = (baseIndex + 1) % profile.samples.length;
  const left = profile.samples[Math.min(baseIndex, profile.samples.length - 1)];
  const right = profile.samples[nextIndex];
  const localDistance = wrapped - left.distance;
  const span = nextIndex === 0
    ? profile.totalDistance - left.distance
    : Math.max(profile.sampleSpacing, right.distance - left.distance);
  const ratio = clamp(localDistance / Math.max(1e-6, span), 0, 1);
  return lerp(left.speed, right.speed, ratio);
};

export const getTrackProfileLookahead = (
  profile: TrackProfile,
  distance: number,
  lookaheadDistance: number,
  predicate?: (sample: TrackProfileSample) => boolean
): TrackProfileLookahead | null => {
  const maxDistance = Math.max(profile.sampleSpacing, lookaheadDistance);
  for (let step = profile.sampleSpacing; step <= maxDistance; step += profile.sampleSpacing) {
    const probeDistance = distance + step;
    const sample = lookupTrackProfileSample(profile, probeDistance);
    if (!predicate || predicate(sample)) {
      return { sample, distanceAhead: step };
    }
  }
  return null;
};

export const getTrackProfileMinimumSpeedAhead = (
  profile: TrackProfile,
  distance: number,
  lookaheadDistance: number
): TrackProfileLookahead | null => {
  const maxDistance = Math.max(profile.sampleSpacing, lookaheadDistance);
  let best: TrackProfileLookahead | null = null;
  for (let step = profile.sampleSpacing; step <= maxDistance; step += profile.sampleSpacing) {
    const sample = lookupTrackProfileSample(profile, distance + step);
    if (!best || sample.speed < best.sample.speed) {
      best = { sample, distanceAhead: step };
    }
  }
  return best;
};
