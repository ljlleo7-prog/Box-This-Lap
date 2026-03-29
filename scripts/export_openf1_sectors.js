import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEED_CURVES_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'speed_curves.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'sectoring_calculated.json');
const TRACKS_INDEX_PATH = path.join(ROOT_DIR, 'src', 'data', 'tracks', 'index.ts');

const openF1Aliases = {
  'silverstone-gp': ['Silverstone'],
  'monza-gp': ['Monza'],
  'spa-gp': ['Spa-Francorchamps', 'Spa'],
  'china-gp': ['Shanghai'],
  'singapore-gp': ['Singapore', 'Marina Bay'],
  'bahrain-gp': ['Sakhir', 'Bahrain'],
  'abu-dhabi-gp': ['Yas Marina', 'Abu Dhabi'],
  'monaco-gp': ['Monte Carlo', 'Monaco'],
  'melbourne-gp': ['Melbourne', 'Albert Park'],
  'mexico-city-gp': ['Mexico City', 'Mexico'],
  'catalunya-gp': ['Barcelona', 'Catalunya'],
  'montreal-gp': ['Montreal', 'Canada'],
  'spielberg-gp': ['Spielberg', 'Red Bull Ring'],
  'austin-gp': ['Austin', 'COTA'],
  'interlagos-gp': ['Interlagos', 'Sao Paulo'],
  'las-vegas-gp': ['Las Vegas'],
  'qatar-gp': ['Lusail', 'Qatar']
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const resolveOpenF1Key = (trackId, trackName, collection) => {
  const entries = Object.entries(collection ?? {});
  if (!entries.length) return null;
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
  return selected?.[0] ?? null;
};

const parseTrackImports = (indexText) => {
  const importRegex = /import\s+\{\s*([A-Z0-9_]+)\s*\}\s+from\s+'\.\/([^']+)'/g;
  const importMap = new Map();
  let match;
  while ((match = importRegex.exec(indexText)) !== null) {
    importMap.set(match[1], match[2]);
  }
  const tracksBlock =
    indexText.match(/const TRACKS_BASE: Track\[]\s*=\s*\[([\s\S]*?)\]/) ||
    indexText.match(/export const TRACKS: Track\[]\s*=\s*\[([\s\S]*?)\]/);
  if (!tracksBlock) return [];
  const names = tracksBlock[1]
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return names
    .map(name => ({ name, file: importMap.get(name) }))
    .filter(item => item.file);
};

const parseTrackFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf-8');
  const idMatch = raw.match(/id:\s*'([^']+)'/);
  const nameMatch = raw.match(/name:\s*'([^']+)'/);
  const distanceMatch = raw.match(/totalDistance:\s*([0-9.]+)/);
  if (!idMatch || !nameMatch || !distanceMatch) return null;
  return {
    id: idMatch[1],
    name: nameMatch[1],
    totalDistance: Number(distanceMatch[1])
  };
};

const resolveOpenF1Curve = (trackId, trackName, totalDistance, curves) => {
  const curveKey = resolveOpenF1Key(trackId, trackName, curves.commonCurves ?? {});
  if (!curveKey) return { curveKey: null, points: [] };
  return {
    curveKey,
    points: (curves.commonCurves?.[curveKey] ?? [])
      .filter(point => point.avgSpeedKph !== null)
      .map(point => ({
        dist: point.normDist * totalDistance,
        speedKph: point.avgSpeedKph ?? 0
      }))
  };
};

const smoothSpeeds = (points, windowSize) => {
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

const findApexes = (dist, speed, minSpacing) => {
  const candidates = [];
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
  const filtered = [];
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

const buildSegmentsFromCurve = (points, totalDistance, minSpacing) => {
  if (points.length < 5) return [];
  const ordered = [...points].sort((a, b) => a.dist - b.dist);
  const dist = ordered.map(point => point.dist);
  const rawSpeed = ordered.map(point => point.speedKph);
  if (rawSpeed[0] === undefined) {
    console.error("rawSpeed[0] is undefined! ordered[0]:", ordered[0]);
  }
  const speed = smoothSpeeds(ordered, 3);
  const maxSpeed = Math.max(...speed);
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return [];
  const apexes = findApexes(dist, speed, minSpacing);
  const corners = [];
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
      maxSpeed: localMax
    });
  });
  const segments = [];
  const ranges = corners.sort((a, b) => a.start - b.start);
  const addSegment = (start, end, type, avgSpeedKph, maxSpeedKph, minSpeedKph, startSpeedKph, endSpeedKph) => {
    if (end <= start + 1) return;
    segments.push({ start, end, type, avgSpeedKph, maxSpeedKph, minSpeedKph, startSpeedKph, endSpeedKph });
  };
  const segmentStats = (start, end) => {
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < dist.length; i += 1) {
      if (dist[i] < start || dist[i] > end) continue;
      // Use rawSpeed to get the actual min and max, not the smoothed ones
      const val = rawSpeed[i];
      sum += val;
      count += 1;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const avg = count ? sum / count : 0;
    return { avg, min, max };
  };
  const getSpeedAt = (distance) => {
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < dist.length; i++) {
      const diff = Math.abs(dist[i] - distance);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return speed[closestIdx];
  };

  let cursor = 0;
  ranges.forEach(range => {
    if (cursor < range.start) {
      const stats = segmentStats(cursor, range.start);
      const isAccelerating = stats.max > stats.min + 30; // 30 km/h acceleration means it's a straight
      const straightish = isAccelerating || (stats.avg >= maxSpeed * 0.75);
      addSegment(cursor, range.start, straightish ? 'straight' : 'corner_high_speed', stats.avg, stats.max, stats.min, getSpeedAt(cursor), getSpeedAt(range.start));
    }
    
    // Instead of entry/apex/exit, just add ONE corner segment
    const stats = segmentStats(range.start, range.end);
    const classify = (speedKph) => {
      if (speedKph < 140) return 'corner_low_speed';
      if (speedKph < 210) return 'corner_medium_speed';
      return 'corner_high_speed';
    };
    addSegment(range.start, range.end, classify(stats.min), stats.avg, stats.max, stats.min, getSpeedAt(range.start), getSpeedAt(range.end));
    cursor = range.end;
  });
  if (cursor < totalDistance) {
    const stats = segmentStats(cursor, totalDistance);
    const isAccelerating = stats.max > stats.min + 30;
    const straightish = isAccelerating || (stats.avg >= maxSpeed * 0.75);
    addSegment(cursor, totalDistance, straightish ? 'straight' : 'corner_high_speed', stats.avg, stats.max, stats.min, getSpeedAt(cursor), getSpeedAt(totalDistance));
  }
  return segments;
};

const buildOpenF1Sectors = (trackId, trackName, totalDistance, curves) => {
  const { curveKey, points: curve } = resolveOpenF1Curve(trackId, trackName, totalDistance, curves);
  if (!curve.length) return { curveKey, sectors: [] };
  const spacingCandidates = [60, 55, 50, 45, 40, 35, 30].map(divisor => totalDistance / divisor);
  let bestSegments = [];
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
  if (!bestSegments.length) return { curveKey, sectors: [] };
  const maxSpeedOverall = Math.max(...curve.map(point => point.speedKph));
  const sectors = [];
  bestSegments.forEach((segment, index) => {
    if (Number.isNaN(segment.avgSpeedKph)) {
        console.error("NaN avgSpeedKph at index", index, segment);
    }
    const startDistance = index === 0 ? 0 : sectors[index - 1].endDistance;
    const rawEnd = Math.round(segment.end);
    const endDistance = index === bestSegments.length - 1
      ? totalDistance
      : Math.max(startDistance + 1, Math.min(rawEnd, totalDistance));
    const avgSpeedKph = segment.avgSpeedKph || 0;
    const difficulty = segment.type === 'straight'
      ? 0.1
      : clamp(0.25 + (1 - avgSpeedKph / maxSpeedOverall) * 0.8, 0.25, 0.95);
    let maxSpeed = undefined;
    let targetSpeed = undefined;
    if (segment.type !== 'straight') {
      const curveBase = segment.type === 'corner_high_speed' ? 0.1 : segment.type === 'corner_medium_speed' ? 0.15 : 0.2;
      const curveFactor = 1 - (Math.pow(difficulty, 1.3) * curveBase);
      const desired = segment.avgSpeedKph / 3.6;
      maxSpeed = curveFactor > 0 ? Math.min(130, desired / curveFactor) : desired;
      
      if (segment.minSpeedKph > 0 && segment.minSpeedKph !== Infinity) {
        targetSpeed = segment.minSpeedKph / 3.6;
      } else {
        targetSpeed = maxSpeed;
      }
    } else {
      maxSpeed = (segment.maxSpeedKph || segment.avgSpeedKph) / 3.6;
      targetSpeed = maxSpeed;
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
      startSpeed: segment.startSpeedKph ? segment.startSpeedKph / 3.6 : undefined,
      endSpeed: segment.endSpeedKph ? segment.endSpeedKph / 3.6 : undefined
    });
  });
  if (sectors.length && sectors[sectors.length - 1].endDistance !== totalDistance) {
    sectors[sectors.length - 1].endDistance = totalDistance;
  }
  return { curveKey, sectors };
};

const loadTracks = async () => {
  const indexText = await fs.readFile(TRACKS_INDEX_PATH, 'utf-8');
  const imports = parseTrackImports(indexText);
  const tracks = [];
  for (const item of imports) {
    const filePath = path.join(path.dirname(TRACKS_INDEX_PATH), `${item.file}.ts`);
    const track = await parseTrackFile(filePath);
    if (track) tracks.push(track);
  }
  return tracks;
};

const summarizeCoverage = (sectors, totalDistance) => {
  if (!sectors.length || !totalDistance) {
    return {
      coveredDistance: 0,
      coveredRatio: 0,
      hasFullDistance: false,
      sectorCount: sectors.length
    };
  }
  const coveredDistance = sectors.reduce((sum, sector) => {
    const span = Math.max(0, Math.min(totalDistance, sector.endDistance) - Math.max(0, sector.startDistance));
    return sum + span;
  }, 0);
  const lastEnd = sectors[sectors.length - 1]?.endDistance ?? 0;
  return {
    coveredDistance,
    coveredRatio: totalDistance > 0 ? coveredDistance / totalDistance : 0,
    hasFullDistance: Math.abs(lastEnd - totalDistance) <= 1 && coveredDistance >= totalDistance - sectors.length,
    sectorCount: sectors.length
  };
};

const resolveCurveStats = (curveKey, curves) => {
  if (!curveKey) return null;
  const statsByYear = curves.stats ?? {};
  const matches = [];
  Object.entries(statsByYear).forEach(([season, circuits]) => {
    const stats = circuits?.[curveKey];
    if (stats) {
      matches.push({ season, ...stats });
    }
  });
  if (!matches.length) return null;
  const lapCount = matches.reduce((sum, item) => sum + (item.lapCount ?? 0), 0);
  const weightedAverage = key => {
    if (!lapCount) return null;
    const total = matches.reduce((sum, item) => sum + ((item[key] ?? 0) * (item.lapCount ?? 0)), 0);
    return total / lapCount;
  };
  const sumCounts = key => matches.reduce((acc, item) => {
    Object.entries(item[key] ?? {}).forEach(([countKey, countValue]) => {
      acc[countKey] = (acc[countKey] ?? 0) + (countValue ?? 0);
    });
    return acc;
  }, {});
  return {
    seasons: matches.map(item => item.season),
    lapCount,
    avgLapTime: weightedAverage('avgLapTime'),
    avgSpeedKph: weightedAverage('avgSpeedKph'),
    avgMaxSpeedKph: weightedAverage('avgMaxSpeedKph'),
    lapTypeCounts: sumCounts('lapTypeCounts'),
    pushStrengthCounts: sumCounts('pushStrengthCounts')
  };
};

const main = async () => {
  const raw = await fs.readFile(SPEED_CURVES_PATH, 'utf-8');
  const curves = JSON.parse(raw);
  const tracks = await loadTracks();
  const sectorsByTrack = {};
  tracks.forEach(track => {
    const { curveKey, sectors } = buildOpenF1Sectors(track.id, track.name, track.totalDistance, curves);
    if (sectors.length) {
      const coverage = summarizeCoverage(sectors, track.totalDistance);
      const curveStats = resolveCurveStats(curveKey, curves);
      sectorsByTrack[track.id] = {
        trackId: track.id,
        name: track.name,
        totalDistance: track.totalDistance,
        source: 'openf1-calculated',
        generatedAt: new Date().toISOString(),
        curveKey,
        sessionTypes: curves.meta?.sessionTypes ?? [],
        hotlapOnly: curves.meta?.hotlapOnly ?? true,
        seasons: curveStats?.seasons ?? [],
        lapCount: curveStats?.lapCount ?? 0,
        avgLapTime: curveStats?.avgLapTime ?? null,
        avgSpeedKph: curveStats?.avgSpeedKph ?? null,
        avgMaxSpeedKph: curveStats?.avgMaxSpeedKph ?? null,
        lapTypeCounts: curveStats?.lapTypeCounts ?? {},
        pushStrengthCounts: curveStats?.pushStrengthCounts ?? {},
        coverage,
        sectorCount: sectors.length,
        sectors
      };
    }
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'openf1-calculated',
    sessionTypes: curves.meta?.sessionTypes ?? [],
    hotlapOnly: curves.meta?.hotlapOnly ?? true,
    sectorsByTrack
  };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  const trackCount = Object.keys(sectorsByTrack).length;
  console.log(`Exported ${trackCount} track sector maps to ${OUTPUT_PATH}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
