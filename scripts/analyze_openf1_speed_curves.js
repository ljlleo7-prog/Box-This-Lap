import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'tests', 'openf1_telemetry');
const OUTPUT_DIR = path.join(DATA_DIR, 'analysis');
const DEFAULT_BINS = 200;

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const parseArg = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return fallback;
  return next;
};

const listFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const readJsonl = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) return [];
    return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    return [];
  }
};

const buildBins = (binCount) => ({
  binCount,
  speedSum: Array.from({ length: binCount }, () => 0),
  speedCount: Array.from({ length: binCount }, () => 0)
});

const mergeBins = (target, source) => {
  for (let i = 0; i < target.binCount; i += 1) {
    target.speedSum[i] += source.speedSum[i];
    target.speedCount[i] += source.speedCount[i];
  }
};

const finalizeBins = (bins) => {
  const data = [];
  for (let i = 0; i < bins.binCount; i += 1) {
    const count = bins.speedCount[i];
    data.push({
      normDist: i / (bins.binCount - 1),
      avgSpeedKph: count ? bins.speedSum[i] / count : null
    });
  }
  return data;
};

const classifySessionType = (session) => {
  const name = String(session.session_name || session.session_type || '').toLowerCase();
  if (name.includes('practice') || name.startsWith('fp')) return 'P';
  if (name.includes('qual') || name.startsWith('q')) return 'Q';
  if (name.includes('race') || name.includes('grand prix') || name.includes('sprint')) return 'R';
  return 'OTHER';
};

const buildLapKey = (lap) => `${lap.driver_number}-${lap.lap_number}-${lap.date_start}`;

const classifyLaps = (laps) => {
  const byDriver = new Map();
  for (const lap of laps) {
    const driver = lap.driver_number;
    if (!byDriver.has(driver)) byDriver.set(driver, []);
    byDriver.get(driver).push(lap);
  }

  const classifications = new Map();

  for (const [driver, driverLaps] of byDriver.entries()) {
    const ordered = [...driverLaps].sort((a, b) => {
      const aTime = a.date_start ? new Date(a.date_start).getTime() : 0;
      const bTime = b.date_start ? new Date(b.date_start).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return (a.lap_number || 0) - (b.lap_number || 0);
    });

    const pitInKeys = new Set();
    for (let i = 0; i < ordered.length; i += 1) {
      const lap = ordered[i];
      if (lap.is_pit_out_lap && i > 0) {
        pitInKeys.add(buildLapKey(ordered[i - 1]));
      }
    }

    const returnKey = ordered.length ? buildLapKey(ordered[ordered.length - 1]) : null;
    let bestHotlap = Infinity;

    for (const lap of ordered) {
      const key = buildLapKey(lap);
      let lapType = 'hotlap';
      if (!lap.lap_duration || lap.lap_duration <= 0) {
        lapType = 'invalid';
      } else if (lap.is_pit_out_lap) {
        lapType = 'pit_out';
      } else if (pitInKeys.has(key)) {
        lapType = 'pit_in';
      } else if (lap.lap_number === 1) {
        lapType = 'start';
      } else if (returnKey === key) {
        lapType = 'return';
      }

      if (lapType === 'hotlap') {
        bestHotlap = Math.min(bestHotlap, lap.lap_duration);
      }

      classifications.set(key, { lapType, pushStrength: null });
    }

    if (Number.isFinite(bestHotlap)) {
      for (const lap of ordered) {
        const key = buildLapKey(lap);
        const entry = classifications.get(key);
        if (!entry || entry.lapType !== 'hotlap') continue;
        const ratio = lap.lap_duration / bestHotlap;
        let pushStrength = 'cool';
        if (ratio <= 1.01) pushStrength = 'max';
        else if (ratio <= 1.03) pushStrength = 'push';
        else if (ratio <= 1.06) pushStrength = 'build';
        classifications.set(key, { ...entry, pushStrength });
      }
    }
  }

  return classifications;
};

const indexCarDataByDriver = async (sessionDir) => {
  const files = await listFiles(sessionDir);
  const carDataFiles = files.filter(file => path.basename(file).startsWith('car_data-driver-'));
  const map = new Map();
  for (const filePath of carDataFiles) {
    const match = path.basename(filePath).match(/car_data-driver-(\d+)\.jsonl/);
    if (!match) continue;
    const driverNumber = Number(match[1]);
    const rows = await readJsonl(filePath);
    const parsed = rows.map(row => ({
      timeMs: new Date(row.date).getTime(),
      speedKph: row.speed
    })).sort((a, b) => a.timeMs - b.timeMs);
    map.set(driverNumber, parsed);
  }
  return map;
};

const sliceCarData = (rows, startMs, endMs) => {
  const sliced = [];
  for (const row of rows) {
    if (row.timeMs < startMs) continue;
    if (row.timeMs > endMs) break;
    sliced.push(row);
  }
  return sliced;
};

const buildLapCurve = (rows, binCount) => {
  if (rows.length < 2) return null;
  const speeds = [];
  let distance = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const next = rows[i];
    const dt = (next.timeMs - prev.timeMs) / 1000;
    if (dt <= 0) continue;
    const avgSpeed = ((prev.speedKph + next.speedKph) / 2) * (1000 / 3600);
    distance += avgSpeed * dt;
    speeds.push({ dist: distance, speedKph: next.speedKph });
  }
  if (distance <= 0 || speeds.length === 0) return null;
  const bins = buildBins(binCount);
  for (const point of speeds) {
    const norm = point.dist / distance;
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(norm * (binCount - 1))));
    bins.speedSum[idx] += point.speedKph;
    bins.speedCount[idx] += 1;
  }
  return { bins, totalDistance: distance };
};

const updateStats = (stats, lapCurve, lapDuration, rows) => {
  if (!lapCurve) return;
  const avgSpeed = rows.reduce((sum, row) => sum + row.speedKph, 0) / rows.length;
  const maxSpeed = rows.reduce((max, row) => Math.max(max, row.speedKph), 0);
  stats.lapCount += 1;
  stats.totalLapTime += lapDuration;
  stats.totalAvgSpeed += avgSpeed;
  stats.totalMaxSpeed += maxSpeed;
};

const finalizeStats = (bucket) => {
  const output = {};
  for (const [year, circuits] of Object.entries(bucket)) {
    output[year] = {};
    for (const [circuit, stats] of Object.entries(circuits)) {
      const lapCount = stats.lapCount || 0;
      output[year][circuit] = {
        lapCount,
        avgLapTime: lapCount ? stats.totalLapTime / lapCount : null,
        avgSpeedKph: lapCount ? stats.totalAvgSpeed / lapCount : null,
        avgMaxSpeedKph: lapCount ? stats.totalMaxSpeed / lapCount : null,
        lapTypeCounts: stats.lapTypeCounts,
        pushStrengthCounts: stats.pushStrengthCounts
      };
    }
  }
  return output;
};

const analyzeSession = async (sessionDir, binCount, seasonBuckets, circuitBuckets, yearBuckets, report, sessionTypes) => {
  const sessionFile = path.join(sessionDir, 'session.json');
  let sessionMeta;
  try {
    sessionMeta = JSON.parse(await fs.readFile(sessionFile, 'utf-8'));
  } catch (error) {
    return;
  }
  const year = sessionMeta.session.year;
  const sessionKind = classifySessionType(sessionMeta.session);
  if (sessionTypes.size && !sessionTypes.has('ALL') && !sessionTypes.has(sessionKind)) {
    return;
  }
  const circuit = sessionMeta.session.circuit_short_name || sessionMeta.meeting.circuit_short_name || 'unknown';
  const lapsFile = path.join(sessionDir, 'laps.jsonl');
  const laps = await readJsonl(lapsFile);
  if (!laps.length) {
    report.missingLaps.push({
      year,
      circuit,
      sessionKey: sessionMeta.session.session_key,
      meetingKey: sessionMeta.session.meeting_key
    });
    return;
  }
  const carDataByDriver = await indexCarDataByDriver(sessionDir);
  if (!carDataByDriver.size) {
    report.missingCarData.push({
      year,
      circuit,
      sessionKey: sessionMeta.session.session_key,
      meetingKey: sessionMeta.session.meeting_key
    });
    return;
  }

  const seasonKey = String(year);
  if (!seasonBuckets[seasonKey]) {
    seasonBuckets[seasonKey] = {};
  }
  if (!seasonBuckets[seasonKey][circuit]) {
    seasonBuckets[seasonKey][circuit] = buildBins(binCount);
  }
  if (!circuitBuckets[circuit]) {
    circuitBuckets[circuit] = buildBins(binCount);
  }
  if (!yearBuckets[seasonKey]) {
    yearBuckets[seasonKey] = {};
  }
  if (!yearBuckets[seasonKey][circuit]) {
    yearBuckets[seasonKey][circuit] = {
      lapCount: 0,
      totalLapTime: 0,
      totalAvgSpeed: 0,
      totalMaxSpeed: 0,
      lapTypeCounts: {
        hotlap: 0,
        pit_out: 0,
        pit_in: 0,
        start: 0,
        return: 0,
        invalid: 0
      },
      pushStrengthCounts: {
        max: 0,
        push: 0,
        build: 0,
        cool: 0
      }
    };
  }

  const lapClassifications = classifyLaps(laps);

  for (const lap of laps) {
    const classKey = buildLapKey(lap);
    const classification = lapClassifications.get(classKey);
    if (!classification) continue;
    const { lapType, pushStrength } = classification;
    yearBuckets[seasonKey][circuit].lapTypeCounts[lapType] += 1;
    if (lapType !== 'hotlap') continue;
    // Only use 'max' or 'push' laps for our baseline curves!
    if (pushStrength !== 'max' && pushStrength !== 'push') continue;
    if (pushStrength) {
      yearBuckets[seasonKey][circuit].pushStrengthCounts[pushStrength] += 1;
    }
    if (!lap.date_start || !lap.lap_duration) continue;
    const driverNumber = lap.driver_number;
    const driverData = carDataByDriver.get(driverNumber);
    if (!driverData) continue;
    const startMs = new Date(lap.date_start).getTime();
    const endMs = startMs + lap.lap_duration * 1000;
    const rows = sliceCarData(driverData, startMs, endMs);
    if (rows.length < 5) continue;
    const lapCurve = buildLapCurve(rows, binCount);
    if (!lapCurve) continue;
    mergeBins(seasonBuckets[seasonKey][circuit], lapCurve.bins);
    mergeBins(circuitBuckets[circuit], lapCurve.bins);
    updateStats(yearBuckets[seasonKey][circuit], lapCurve, lap.lap_duration, rows);
  }
};

const main = async () => {
  const yearsArg = parseArg('--years', '2023,2024,2025');
  const binCount = Number(parseArg('--bins', DEFAULT_BINS));
  const sessionTypesArg = parseArg('--session-types', 'P,Q,R');
  const years = yearsArg.split(',').map(value => value.trim()).filter(Boolean);
  const sessionTypes = new Set(sessionTypesArg.split(',').map(value => value.trim().toUpperCase()).filter(Boolean));

  const yearDirs = years.map(year => path.join(DATA_DIR, year));
  const sessionFiles = [];
  for (const yearDir of yearDirs) {
    try {
      const files = await listFiles(yearDir);
      sessionFiles.push(...files.filter(file => path.basename(file) === 'session.json'));
    } catch (error) {
      continue;
    }
  }

  const seasonBuckets = {};
  const circuitBuckets = {};
  const yearBuckets = {};

  const report = { missingLaps: [], missingCarData: [] };

  for (const sessionFile of sessionFiles) {
    const sessionDir = path.dirname(sessionFile);
    await analyzeSession(sessionDir, binCount, seasonBuckets, circuitBuckets, yearBuckets, report, sessionTypes);
  }

  const output = {
    meta: {
      sessionTypes: Array.from(sessionTypes),
      hotlapOnly: true,
      pushStrength: {
        max: '<=1.01x best',
        push: '<=1.03x best',
        build: '<=1.06x best',
        cool: '>1.06x best'
      }
    },
    seasons: {},
    commonCurves: {},
    stats: finalizeStats(yearBuckets)
  };

  for (const [year, circuits] of Object.entries(seasonBuckets)) {
    output.seasons[year] = {};
    for (const [circuit, bins] of Object.entries(circuits)) {
      output.seasons[year][circuit] = finalizeBins(bins);
    }
  }

  for (const [circuit, bins] of Object.entries(circuitBuckets)) {
    output.commonCurves[circuit] = finalizeBins(bins);
  }

  await ensureDir(OUTPUT_DIR);
  const outputPath = path.join(OUTPUT_DIR, 'speed_curves.json');
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  const publicDir = path.join(ROOT_DIR, 'public', 'openf1');
  await ensureDir(publicDir);
  const publicPath = path.join(publicDir, 'speed_curves.json');
  await fs.writeFile(publicPath, JSON.stringify(output, null, 2));
  if (report.missingLaps.length) {
    console.warn(`[Analysis] Missing laps.jsonl in ${report.missingLaps.length} sessions.`);
  }
  if (report.missingCarData.length) {
    console.warn(`[Analysis] Missing car_data-driver-*.jsonl in ${report.missingCarData.length} sessions.`);
  }
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
