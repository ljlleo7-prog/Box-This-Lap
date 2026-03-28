import type { TrackSector } from '../types';

export type OpenF1CurvePoint = { normDist: number; avgSpeedKph: number | null };
export type OpenF1Curves = { commonCurves?: Record<string, OpenF1CurvePoint[]> };

type CurvePoint = { dist: number; speedKph: number };

const openF1Aliases: Record<string, string[]> = {
  'silverstone-gp': ['Silverstone'],
  'monza-gp': ['Monza'],
  'spa-gp': ['Spa-Francorchamps', 'Spa'],
  'china-gp': ['Shanghai'],
  'singapore-gp': ['Singapore', 'Marina Bay'],
  'bahrain-gp': ['Sakhir', 'Bahrain'],
  'abu-dhabi-gp': ['Yas Marina', 'Abu Dhabi'],
  'monaco-gp': ['Monte Carlo', 'Monaco'],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const resolveOpenF1Curve = (trackId: string, trackName: string, totalDistance: number, curves: OpenF1Curves) => {
  const entries = Object.entries(curves.commonCurves ?? {});
  if (!entries.length) return [];

  const alias = openF1Aliases[trackId] ?? [];
  const targets = [trackName, trackId, ...alias].filter(Boolean);
  const normalizedTargets = targets.map(normalizeName);

  let selected = entries.find(([key]) => normalizedTargets.includes(normalizeName(key)));
  if (!selected) {
    selected = entries.find(([key]) => {
      const normalizedKey = normalizeName(key);
      return normalizedTargets.some(target => normalizedKey.includes(target) || target.includes(normalizedKey));
    });
  }
  if (!selected) return [];

  return selected[1]
    .filter(point => point.avgSpeedKph !== null)
    .map(point => ({
      dist: point.normDist * totalDistance,
      speedKph: point.avgSpeedKph ?? 0,
    }));
};

export const smoothSpeeds = (points: CurvePoint[], windowSize: number) => {
  const speeds = points.map(point => point.speedKph);
  return speeds.map((_, index) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, index - windowSize);
    const end = Math.min(speeds.length - 1, index + windowSize);
    for (let i = start; i <= end; i += 1) {
      sum += speeds[i];
      count += 1;
    }
    return count ? sum / count : speeds[index];
  });
};

export const findApexes = (dist: number[], speed: number[], minSpacing: number) => {
  const candidates: number[] = [];
  for (let i = 2; i < speed.length - 2; i += 1) {
    if (
      speed[i] <= speed[i - 1] &&
      speed[i] <= speed[i + 1] &&
      speed[i] <= speed[i - 2] &&
      speed[i] <= speed[i + 2]
    ) {
      let localMax = speed[i];
      const start = Math.max(0, i - 8);
      const end = Math.min(speed.length - 1, i + 8);
      for (let j = start; j <= end; j += 1) {
        if (speed[j] > localMax) localMax = speed[j];
      }
      if (localMax - speed[i] >= 12) candidates.push(i);
    }
  }

  const filtered: number[] = [];
  candidates.forEach(index => {
    if (!filtered.length) {
      filtered.push(index);
      return;
    }
    const last = filtered[filtered.length - 1];
    if (dist[index] - dist[last] < minSpacing) {
      if (speed[index] < speed[last]) {
        filtered[filtered.length - 1] = index;
      }
    } else {
      filtered.push(index);
    }
  });

  return filtered;
};

export const buildSegmentsFromCurve = (points: CurvePoint[], totalDistance: number, minSpacing: number) => {
  if (points.length < 5) return [];

  const ordered = [...points].sort((a, b) => a.dist - b.dist);
  const dist = ordered.map(point => point.dist);
  const speed = smoothSpeeds(ordered, 3);
  const maxSpeed = Math.max(...speed);
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return [];

  const apexes = findApexes(dist, speed, minSpacing);
  const corners: Array<{ start: number; end: number; apexStart: number; apexEnd: number; minSpeed: number; maxSpeed: number }> = [];

  apexes.forEach((apex, idx) => {
    const prev = idx > 0 ? apexes[idx - 1] : null;
    const next = idx < apexes.length - 1 ? apexes[idx + 1] : null;
    const leftLimit = prev !== null ? Math.floor((prev + apex) / 2) : 0;
    const rightLimit = next !== null ? Math.ceil((next + apex) / 2) : dist.length - 1;

    let localMax = speed[apex];
    for (let i = leftLimit; i <= rightLimit; i += 1) {
      if (speed[i] > localMax) localMax = speed[i];
    }

    const minSpeed = speed[apex];
    const entryThreshold = minSpeed + 0.9 * (localMax - minSpeed);

    let cornerStart = leftLimit;
    for (let i = apex; i >= leftLimit; i -= 1) {
      if (speed[i] >= entryThreshold) {
        cornerStart = i;
        break;
      }
    }

    let cornerEnd = rightLimit;
    for (let i = apex; i <= rightLimit; i += 1) {
      if (speed[i] >= entryThreshold) {
        cornerEnd = i;
        break;
      }
    }

    const apexThreshold = minSpeed + 0.25 * (localMax - minSpeed);

    let apexStart = cornerStart;
    for (let i = apex; i >= cornerStart; i -= 1) {
      if (speed[i] >= apexThreshold) {
        apexStart = Math.min(apex, i + 1);
        break;
      }
    }

    let apexEnd = cornerEnd;
    for (let i = apex; i <= cornerEnd; i += 1) {
      if (speed[i] >= apexThreshold) {
        apexEnd = Math.max(apex, i - 1);
        break;
      }
    }

    if (apexStart < cornerStart) apexStart = cornerStart;
    if (apexEnd > cornerEnd) apexEnd = cornerEnd;

    corners.push({
      start: dist[cornerStart],
      end: dist[cornerEnd],
      apexStart: dist[apexStart],
      apexEnd: dist[apexEnd],
      minSpeed,
      maxSpeed: localMax,
    });
  });

  const segments: Array<{ start: number; end: number; type: TrackSector['type']; avgSpeedKph: number; maxSpeedKph: number; minSpeedKph: number }> = [];
  const ranges = corners.sort((a, b) => a.start - b.start);

  const addSegment = (start: number, end: number, type: TrackSector['type'], avgSpeedKph: number, maxSpeedKph: number, minSpeedKph: number) => {
    if (end <= start + 1) return;
    segments.push({ start, end, type, avgSpeedKph, maxSpeedKph, minSpeedKph });
  };

  const segmentStats = (start: number, end: number) => {
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < dist.length; i += 1) {
      if (dist[i] < start || dist[i] > end) continue;
      const val = speed[i];
      sum += val;
      count += 1;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const avg = count ? sum / count : 0;
    return { avg, min, max };
  };

  let cursor = 0;
  ranges.forEach(range => {
    if (cursor < range.start) {
      const stats = segmentStats(cursor, range.start);
      const straightish = stats.min >= maxSpeed * 0.88 && stats.max - stats.min <= 30;
      addSegment(cursor, range.start, straightish ? 'straight' : 'corner_high_speed', stats.avg, stats.max, stats.min);
    }

    const entryStats = segmentStats(range.start, range.apexStart);
    const apexStats = segmentStats(range.apexStart, range.apexEnd);
    const exitStats = segmentStats(range.apexEnd, range.end);
    const classify = (speedKph: number): TrackSector['type'] => {
      if (speedKph < 140) return 'corner_low_speed';
      if (speedKph < 210) return 'corner_medium_speed';
      return 'corner_high_speed';
    };

    addSegment(range.start, range.apexStart, classify(entryStats.avg), entryStats.avg, entryStats.max, entryStats.min);
    addSegment(range.apexStart, range.apexEnd, classify(apexStats.avg), apexStats.avg, apexStats.max, apexStats.min);
    addSegment(range.apexEnd, range.end, classify(exitStats.avg), exitStats.avg, exitStats.max, exitStats.min);
    cursor = range.end;
  });

  if (cursor < totalDistance) {
    const stats = segmentStats(cursor, totalDistance);
    const straightish = stats.min >= maxSpeed * 0.88 && stats.max - stats.min <= 30;
    addSegment(cursor, totalDistance, straightish ? 'straight' : 'corner_high_speed', stats.avg, stats.max, stats.min);
  }

  return segments;
};

export const buildOpenF1Sectors = (trackId: string, trackName: string, totalDistance: number, curves: OpenF1Curves) => {
  const curve = resolveOpenF1Curve(trackId, trackName, totalDistance, curves);
  if (!curve.length) return [];

  const spacingCandidates = [60, 55, 50, 45, 40, 35, 30].map(divisor => totalDistance / divisor);
  let bestSegments: ReturnType<typeof buildSegmentsFromCurve> = [];
  let bestScore = Number.POSITIVE_INFINITY;

  spacingCandidates.forEach(spacing => {
    const segments = buildSegmentsFromCurve(curve, totalDistance, spacing);
    if (!segments.length) return;

    const count = segments.length;
    const target = 45;
    const penalty = count < 40 || count > 50 ? 20 : 0;
    const score = Math.abs(count - target) + penalty;

    if (score < bestScore) {
      bestScore = score;
      bestSegments = segments;
    }
  });

  if (!bestSegments.length) return [];

  const maxSpeedOverall = Math.max(...curve.map(point => point.speedKph));
  const sectors: TrackSector[] = [];

  bestSegments.forEach((segment, index) => {
    const startDistance = index === 0 ? 0 : sectors[index - 1].endDistance;
    const rawEnd = Math.round(segment.end);
    const endDistance = index === bestSegments.length - 1
      ? totalDistance
      : Math.max(startDistance + 1, Math.min(rawEnd, totalDistance));

    const avgSpeedKph = segment.avgSpeedKph || 0;
    const difficulty = segment.type === 'straight'
      ? 0.1
      : clamp(0.25 + (1 - avgSpeedKph / maxSpeedOverall) * 0.8, 0.25, 0.95);

    let maxSpeed = undefined as number | undefined;
    let targetSpeed = undefined as number | undefined;
    if (segment.type !== 'straight') {
      const curveBase = segment.type === 'corner_high_speed' ? 0.1 : segment.type === 'corner_medium_speed' ? 0.15 : 0.2;
      const curveFactor = 1 - (Math.pow(difficulty, 1.3) * curveBase);
      const desired = avgSpeedKph / 3.6;
      maxSpeed = curveFactor > 0 ? Math.min(130, desired / curveFactor) : desired;
      targetSpeed = segment.minSpeedKph > 0 ? segment.minSpeedKph / 3.6 : maxSpeed;
    }

    sectors.push({
      id: `s${index + 1}`,
      name: `S${index + 1}`,
      startDistance,
      endDistance,
      type: segment.type,
      difficulty,
      maxSpeed,
      targetSpeed,
    });
  });

  if (sectors.length && sectors[sectors.length - 1].endDistance !== totalDistance) {
    sectors[sectors.length - 1].endDistance = totalDistance;
  }

  return sectors;
};
