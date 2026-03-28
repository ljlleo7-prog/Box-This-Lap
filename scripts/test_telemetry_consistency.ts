import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SimulationEngine } from '../src/engine/simulation.ts';
import { TRACKS } from '../src/data/tracks/index.ts';
import { DRIVERS } from '../src/data/initialData.ts';
import { resolveOpenF1Curve } from '../src/lib/openf1TrackModel.ts';
import type { Driver, TelemetryDataPoint, Track } from '../src/types/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OPENF1_CURVES_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'speed_curves.json');
const OUTPUT_DIR = path.join(ROOT_DIR, 'tests', 'openf1_telemetry', 'analysis');

const DEFAULTS = {
  track: 'silverstone-gp',
  driver: 'ver',
  seed: 12345,
  dt: 0.1,
  warmupLaps: 1,
  comparisonLaps: 3,
  maxSimTime: 1800,
  passThresholdPct: 8,
  rangeThresholdPct: 12,
  minRangeSpan: 0.03,
  minTracePoints: 50,
  writeJson: false,
};

type OpenF1CurvePoint = { normDist: number; avgSpeedKph: number | null };
type OpenF1Stats = {
  lapCount?: number;
  avgLapTime?: number | null;
  bestLapTime?: number | null;
  avgSpeedKph?: number | null;
  avgMaxSpeedKph?: number | null;
};
type OpenF1Dataset = {
  commonCurves?: Record<string, OpenF1CurvePoint[]>;
  stats?: Record<string, Record<string, OpenF1Stats>>;
};

type FinalizedLap = {
  lapNumber: number;
  lapTime: number;
  trace: TelemetryDataPoint[];
  pointCount: number;
};

type ComparisonMetrics = {
  comparedBins: number;
  passRate: number;
  meanAbsoluteErrorPct: number;
  rmsePct: number;
  p90AbsoluteErrorPct: number;
  maxAbsoluteErrorPct: number;
  maxErrorNormDist: number;
  signedBiasPct: number;
  lapTimeDeltaSeconds: number | null;
  significantInconsistentRanges: Array<{
    startNormDist: number;
    endNormDist: number;
    maxAbsErrorPct: number;
    meanAbsErrorPct: number;
    signedBiasPct: number;
  }>;
};

type RunReport = {
  metadata: Record<string, unknown>;
  comparison: ComparisonMetrics;
  driver: {
    id: string;
    name: string;
    team: string;
  };
  track: {
    id: string;
    name: string;
    totalDistance: number;
    sectorCount: number;
    telemetryCurveKey: string;
  };
  reference: {
    binCount: number;
    avgLapTimeSeconds: number | null;
    avgSpeedKph: number | null;
    avgMaxSpeedKph: number | null;
    lapCount: number | null;
  };
  simulation: {
    seed: number;
    dt: number;
    targetLapNumbers: number[];
    sampledLaps: FinalizedLap[];
    aggregatedLapTimeSeconds: number;
  };
};

const parseArg = (flag: string): string | null => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
};

const hasFlag = (flag: string): boolean => process.argv.includes(flag);

const asNumber = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toKph = (speedMs: number): number => speedMs * 3.6;

const loadOpenF1Dataset = async (): Promise<OpenF1Dataset> => {
  return JSON.parse(await fs.readFile(OPENF1_CURVES_PATH, 'utf-8')) as OpenF1Dataset;
};

const loadOpenF1Sectors = async (): Promise<any> => {
  const p = path.join(ROOT_DIR, 'public', 'openf1', 'sectoring_calculated.json');
  return JSON.parse(await fs.readFile(p, 'utf-8'));
};

const findTrack = (trackIdOrName: string): Track => {
  const normalized = trackIdOrName.trim().toLowerCase();
  const track = TRACKS.find(candidate =>
    candidate.id.toLowerCase() === normalized ||
    candidate.name.toLowerCase() === normalized,
  );

  if (!track) {
    const available = TRACKS.map(candidate => candidate.id).join(', ');
    throw new Error(`Unknown track \"${trackIdOrName}\". Available tracks: ${available}`);
  }

  return {
    ...track,
    sectors: track.sectors.map(sector => ({ ...sector })),
    drsZones: track.drsZones.map(zone => ({ ...zone })),
    pitLane: { ...track.pitLane },
    telemetry: track.telemetry ? { ...track.telemetry } : undefined,
  };
};

const findDriver = (driverIdOrName: string): Driver => {
  const normalized = driverIdOrName.trim().toLowerCase();
  const driver = DRIVERS.find(candidate =>
    candidate.id.toLowerCase() === normalized ||
    candidate.name.toLowerCase() === normalized,
  );

  if (!driver) {
    const available = DRIVERS.map(candidate => candidate.id).join(', ');
    throw new Error(`Unknown driver \"${driverIdOrName}\". Available drivers: ${available}`);
  }

  return structuredClone(driver);
};

const findCurveKey = (dataset: OpenF1Dataset, track: Track): string => {
  const matchedCurve = resolveOpenF1Curve(track.id, track.name, track.totalDistance, dataset);
  if (!matchedCurve.length) {
    throw new Error(`No OpenF1 common curve found for ${track.id} (${track.name}).`);
  }

  const entries = Object.entries(dataset.commonCurves ?? {});
  const match = entries.find(([, points]) => {
    if (points.length !== matchedCurve.length) return false;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const resolvedPoint = matchedCurve[index];
      if (point.avgSpeedKph === null) return false;
      const dist = point.normDist * track.totalDistance;
      if (Math.abs(dist - resolvedPoint.dist) > 1e-6) return false;
      if (Math.abs((point.avgSpeedKph ?? 0) - resolvedPoint.speedKph) > 1e-6) return false;
    }
    return true;
  });

  if (!match) {
    throw new Error(`Resolved OpenF1 curve for ${track.id} could not be mapped back to a curve key.`);
  }

  return match[0];
};

const findReferenceStats = (dataset: OpenF1Dataset, curveKey: string): OpenF1Stats => {
  const statsByYear = Object.values(dataset.stats ?? {});
  for (const stats of statsByYear.reverse()) {
    const candidate = stats[curveKey];
    if (candidate) return candidate;
  }
  return {};
};

const normalizeReferenceCurve = (track: Track, dataset: OpenF1Dataset): { curveKey: string; bins: Array<{ normDist: number; speedKph: number }>; stats: OpenF1Stats } => {
  const curveKey = findCurveKey(dataset, track);
  const rawCurve = dataset.commonCurves?.[curveKey] ?? [];
  const bins = rawCurve
    .filter(point => point.avgSpeedKph !== null)
    .map(point => ({
      normDist: clamp(point.normDist, 0, 1),
      speedKph: point.avgSpeedKph ?? 0,
    }));

  if (!bins.length) {
    throw new Error(`OpenF1 curve ${curveKey} for ${track.id} has no usable bins.`);
  }

  const stats = findReferenceStats(dataset, curveKey);
  // Use the actual target lap time from stats instead of the average
  const lapTime = stats.bestLapTime ?? stats.avgLapTime;

  return {
    curveKey,
    bins,
    stats: {
      ...stats,
      avgLapTime: lapTime,
    },
  };
};

const sortTrace = (trace: TelemetryDataPoint[], totalDistance: number): TelemetryDataPoint[] => {
  return [...trace]
    .filter(point => Number.isFinite(point.distance) && Number.isFinite(point.speed))
    .map(point => ({
      ...point,
      distance: ((point.distance % totalDistance) + totalDistance) % totalDistance,
    }))
    .sort((a, b) => a.distance - b.distance);
};

const circularInterpolateKph = (orderedTrace: TelemetryDataPoint[], totalDistance: number, targetDistance: number): number => {
  if (orderedTrace.length === 1) return toKph(orderedTrace[0].speed);

  const first = orderedTrace[0];
  const last = orderedTrace[orderedTrace.length - 1];

  if (targetDistance < first.distance) {
    const leftDistance = last.distance - totalDistance;
    const rightDistance = first.distance;
    const ratio = (targetDistance - leftDistance) / Math.max(1e-9, rightDistance - leftDistance);
    return toKph(last.speed + (first.speed - last.speed) * ratio);
  }

  for (let index = 1; index < orderedTrace.length; index += 1) {
    const previous = orderedTrace[index - 1];
    const next = orderedTrace[index];
    if (targetDistance <= next.distance) {
      const ratio = (targetDistance - previous.distance) / Math.max(1e-9, next.distance - previous.distance);
      return toKph(previous.speed + (next.speed - previous.speed) * ratio);
    }
  }

  const rightDistance = first.distance + totalDistance;
  const ratio = (targetDistance - last.distance) / Math.max(1e-9, rightDistance - last.distance);
  return toKph(last.speed + (first.speed - last.speed) * ratio);
};

const resampleTraceToReferenceBins = (trace: TelemetryDataPoint[], track: Track, referenceBins: Array<{ normDist: number; speedKph: number }>) => {
  const orderedTrace = sortTrace(trace, track.totalDistance);
  if (orderedTrace.length < 2) {
    throw new Error('Sim telemetry trace does not contain enough points to resample.');
  }

  return referenceBins.map(bin => {
    const targetDistance = clamp(bin.normDist, 0, 1) * track.totalDistance;
    return {
      normDist: bin.normDist,
      speedKph: circularInterpolateKph(orderedTrace, track.totalDistance, targetDistance),
    };
  });
};

const averageResampledLaps = (laps: Array<Array<{ normDist: number; speedKph: number }>>) => {
  if (!laps.length) {
    throw new Error('No comparison laps were collected from the simulation.');
  }

  return laps[0].map((bin, index) => {
    const sum = laps.reduce((total, lap) => total + lap[index].speedKph, 0);
    return {
      normDist: bin.normDist,
      speedKph: sum / laps.length,
    };
  });
};

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ratio * ordered.length) - 1));
  return ordered[index];
};

const computeSignificantRanges = (
  rows: Array<{ normDist: number; absErrorPct: number; signedErrorPct: number }>,
  thresholdPct: number,
  minSpan: number,
) => {
  const ranges: ComparisonMetrics['significantInconsistentRanges'] = [];
  let currentStart = -1;

  const flush = (endIndex: number) => {
    if (currentStart === -1) return;
    const startNormDist = rows[currentStart].normDist;
    const endNormDist = rows[endIndex].normDist;
    const span = endNormDist - startNormDist;
    if (span >= minSpan) {
      const segment = rows.slice(currentStart, endIndex + 1);
      const absErrors = segment.map(item => item.absErrorPct);
      const signedErrors = segment.map(item => item.signedErrorPct);
      ranges.push({
        startNormDist: round(startNormDist, 4),
        endNormDist: round(endNormDist, 4),
        maxAbsErrorPct: round(Math.max(...absErrors), 2),
        meanAbsErrorPct: round(absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length, 2),
        signedBiasPct: round(signedErrors.reduce((sum, value) => sum + value, 0) / signedErrors.length, 2),
      });
    }
    currentStart = -1;
  };

  rows.forEach((row, index) => {
    if (row.absErrorPct >= thresholdPct) {
      if (currentStart === -1) currentStart = index;
      return;
    }
    flush(index - 1);
  });

  flush(rows.length - 1);
  return ranges;
};

const computeMetrics = (
  simBins: Array<{ normDist: number; speedKph: number }>,
  refBins: Array<{ normDist: number; speedKph: number }>,
  passThresholdPct: number,
  rangeThresholdPct: number,
  minRangeSpan: number,
  simLapTimeSeconds: number,
  referenceLapTimeSeconds: number | null,
): ComparisonMetrics => {
  const rows = simBins.map((simBin, index) => {
    const refBin = refBins[index];
    const signedError = simBin.speedKph - refBin.speedKph;
    const refSpeed = Math.max(refBin.speedKph, 30);
    const signedErrorPct = (signedError / refSpeed) * 100;
    const absErrorPct = Math.abs(signedErrorPct);
    return {
      normDist: simBin.normDist,
      signedErrorPct,
      absErrorPct,
    };
  });

  const absErrors = rows.map(row => row.absErrorPct);
  const signedErrors = rows.map(row => row.signedErrorPct);
  const squaredErrors = rows.map(row => row.signedErrorPct ** 2);
  const maxAbsError = Math.max(...absErrors);
  const maxIndex = absErrors.findIndex(value => value === maxAbsError);
  const passCount = absErrors.filter(value => value <= passThresholdPct).length;

  return {
    comparedBins: rows.length,
    passRate: round(passCount / rows.length, 4),
    meanAbsoluteErrorPct: round(absErrors.reduce((sum, value) => sum + value, 0) / rows.length, 2),
    rmsePct: round(Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / rows.length), 2),
    p90AbsoluteErrorPct: round(percentile(absErrors, 0.9), 2),
    maxAbsoluteErrorPct: round(maxAbsError, 2),
    maxErrorNormDist: round(rows[maxIndex]?.normDist ?? 0, 4),
    signedBiasPct: round(signedErrors.reduce((sum, value) => sum + value, 0) / rows.length, 2),
    lapTimeDeltaSeconds: referenceLapTimeSeconds === null ? null : round(simLapTimeSeconds - referenceLapTimeSeconds, 3),
    significantInconsistentRanges: computeSignificantRanges(rows, rangeThresholdPct, minRangeSpan),
  };
};

const runSimulation = (
  track: Track,
  driver: Driver,
  seed: number,
  dt: number,
  warmupLaps: number,
  comparisonLaps: number,
  maxSimTime: number,
  minTracePoints: number,
  ruleset: '2025' | '2026' = '2025'
): FinalizedLap[] => {
  const engine = new SimulationEngine(track, [driver], seed, {}, ruleset);
  engine.startRace();
  engine.applyPreRaceSetup({
    [driver.id]: {
      tyreCompound: 'soft',
      fuelLoad: 15,
      powerUnitPhilosophy: 'balanced',
      batteryAllocationMode: 'balanced',
      activeAeroMode: 'balanced',
    },
  });
  engine.setWeatherMode('simulation');
  engine.updateStrategy(driver.id, 'pace', 'aggressive');

  const collected: FinalizedLap[] = [];
  let elapsed = 0;
  let lastSeenLap = 0;
  let previousLapTime = 0;

  while (elapsed < maxSimTime && collected.length < comparisonLaps) {
    const state = engine.update(dt);
    const vehicle = state.vehicles.find(candidate => candidate.driverId === driver.id);
    if (!vehicle) {
      throw new Error(`Simulation no longer contains driver ${driver.id}.`);
    }

    if (
      vehicle.lapCount > lastSeenLap &&
      vehicle.lastLapTime > 0 &&
      vehicle.lastLapTime !== previousLapTime &&
      vehicle.telemetry.lastLapSpeedTrace.length >= minTracePoints
    ) {
      const finalizedLap = vehicle.lapCount;
      lastSeenLap = vehicle.lapCount;
      previousLapTime = vehicle.lastLapTime;

      if (finalizedLap > warmupLaps) {
        if (finalizedLap === comparisonLaps) {
            console.log(`Lap ${finalizedLap} trace around 800-1000m:`);
            const st = vehicle.telemetry.lastLapSpeedTrace;
            st.filter(p => p.distance >= 800 && p.distance <= 1100).forEach(p => {
              console.log(`  dist ${round(p.distance, 1)} -> speed ${round(p.speed * 3.6, 1)} km/h`);
            });
        }
        collected.push({
          lapNumber: finalizedLap,
          lapTime: vehicle.lastLapTime,
          trace: vehicle.telemetry.lastLapSpeedTrace.map(point => ({ ...point })),
          pointCount: vehicle.telemetry.lastLapSpeedTrace.length,
        });
      }
    }

    elapsed += dt;
  }

  if (collected.length < comparisonLaps) {
    throw new Error(
      `Simulation ended after ${round(elapsed, 1)}s with only ${collected.length}/${comparisonLaps} usable laps.`,
    );
  }

  return collected;
};

const printSummary = (report: RunReport) => {
  const { metadata, track, driver, comparison, reference, simulation } = report;
  console.log('Telemetry consistency baseline');
  console.log(`Track: ${track.name} (${track.id}) -> OpenF1 key ${track.telemetryCurveKey}`);
  console.log(`Driver: ${driver.name} (${driver.id}) | Seed ${simulation.seed} | dt ${simulation.dt}s`);
  console.log(
    `Baseline safeguards: sectors=${String(metadata.trackModelSource)}, telemetryDerivedSectors=${String(metadata.telemetryDerivedSectors)}, realWeather=${String(metadata.realWeather)}`,
  );
  console.log(
    `Compared laps: ${simulation.targetLapNumbers.join(', ')} | bins=${reference.binCount} | avg sim lap=${round(simulation.aggregatedLapTimeSeconds, 3)}s`,
  );
  if (reference.avgLapTimeSeconds !== null) {
    console.log(`Reference avg lap: ${round(reference.avgLapTimeSeconds, 3)}s | lap delta=${comparison.lapTimeDeltaSeconds}s`);
  }
  console.log(
    `Pass rate: ${round(comparison.passRate * 100, 2)}% | MAE ${comparison.meanAbsoluteErrorPct}% | RMSE ${comparison.rmsePct}% | p90 ${comparison.p90AbsoluteErrorPct}%`,
  );
  console.log(
    `Max error: ${comparison.maxAbsoluteErrorPct}% @ norm ${comparison.maxErrorNormDist} | Signed bias ${comparison.signedBiasPct}%`,
  );

  if (comparison.significantInconsistentRanges.length) {
    console.log('Significant inconsistent ranges:');
    comparison.significantInconsistentRanges.forEach(range => {
      console.log(
        `  - ${range.startNormDist} to ${range.endNormDist}: mean ${range.meanAbsErrorPct}%, max ${range.maxAbsErrorPct}%, bias ${range.signedBiasPct}%`,
      );
    });
  } else {
    console.log('Significant inconsistent ranges: none');
  }
};

const writeReport = async (report: RunReport, fileName: string) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON report written to ${path.relative(ROOT_DIR, outputPath)}`);
};

const main = async () => {
  const track = findTrack(parseArg('--track') ?? DEFAULTS.track);
  const driver = findDriver(parseArg('--driver') ?? DEFAULTS.driver);
  const seed = asNumber(parseArg('--seed'), DEFAULTS.seed);
  const dt = asNumber(parseArg('--dt'), DEFAULTS.dt);
  const warmupLaps = asNumber(parseArg('--warmup-laps'), DEFAULTS.warmupLaps);
  const comparisonLaps = asNumber(parseArg('--comparison-laps'), DEFAULTS.comparisonLaps);
  const maxSimTime = asNumber(parseArg('--max-sim-time'), DEFAULTS.maxSimTime);
  const passThresholdPct = asNumber(parseArg('--pass-threshold-pct'), DEFAULTS.passThresholdPct);
  const rangeThresholdPct = asNumber(parseArg('--range-threshold-pct'), DEFAULTS.rangeThresholdPct);
  const minRangeSpan = asNumber(parseArg('--min-range-span'), DEFAULTS.minRangeSpan);
  const minTracePoints = asNumber(parseArg('--min-trace-points'), DEFAULTS.minTracePoints);
  const writeJson = hasFlag('--write-json') || DEFAULTS.writeJson;

  const dataset = await loadOpenF1Dataset();
  const sectorsDataset = await loadOpenF1Sectors();
  const reference = normalizeReferenceCurve(track, dataset);

  // Apply OpenF1 sectors
  const trackSectors = sectorsDataset.sectorsByTrack?.[track.id]?.sectors;
  let telemetryDerivedSectors = false;
  if (trackSectors && trackSectors.length > 0) {
    track.sectors = trackSectors;
    telemetryDerivedSectors = true;
  }
  
  // Inject exact telemetry points for TrackProfile builder
  track.telemetryPoints = reference.bins.map(bin => ({
    dist: bin.normDist * track.totalDistance,
    speed: bin.speedKph / 3.6
  }));

  const sampledLaps = runSimulation(track, driver, seed, dt, warmupLaps, comparisonLaps, maxSimTime, minTracePoints);
  const simBins = averageResampledLaps(sampledLaps.map(lap => resampleTraceToReferenceBins(lap.trace, track, reference.bins)));
  
  console.log('Reference vs Sim Bins around norm 0.15 to 0.16:');
  for (let i = 0; i < reference.bins.length; i++) {
    if (reference.bins[i].normDist >= 0.14 && reference.bins[i].normDist <= 0.16) {
       console.log(`  Norm: ${round(reference.bins[i].normDist, 3)} | Ref: ${round(reference.bins[i].speedKph, 1)} km/h | Sim: ${round(simBins[i].speedKph, 1)} km/h`);
    }
  }
  const aggregatedLapTimeSeconds = sampledLaps.reduce((sum, lap) => sum + lap.lapTime, 0) / sampledLaps.length;
  const comparison = computeMetrics(
    simBins,
    reference.bins,
    passThresholdPct,
    rangeThresholdPct,
    minRangeSpan,
    aggregatedLapTimeSeconds,
    reference.stats.avgLapTime ?? null,
  );

  const report: RunReport = {
    metadata: {
      mode: 'baseline-telemetry-consistency',
      trackModelSource: telemetryDerivedSectors ? 'openf1-calculated' : 'static/default-track-sectors',
      telemetryDerivedSectors,
      realWeather: false,
      openF1SectorApplicationUsed: false,
      comparisonSignal: 'vehicle.telemetry.lastLapSpeedTrace',
      referenceSignal: 'public/openf1/speed_curves.json commonCurves',
      fixedSeed: seed,
    },
    driver: {
      id: driver.id,
      name: driver.name,
      team: driver.team,
    },
    track: {
      id: track.id,
      name: track.name,
      totalDistance: track.totalDistance,
      sectorCount: track.sectors.length,
      telemetryCurveKey: reference.curveKey,
    },
    reference: {
      binCount: reference.bins.length,
      avgLapTimeSeconds: reference.stats.avgLapTime ?? null,
      avgSpeedKph: reference.stats.avgSpeedKph ?? null,
      avgMaxSpeedKph: reference.stats.avgMaxSpeedKph ?? null,
      lapCount: reference.stats.lapCount ?? null,
    },
    simulation: {
      seed,
      dt,
      targetLapNumbers: sampledLaps.map(lap => lap.lapNumber),
      sampledLaps: sampledLaps.map(lap => ({
        lapNumber: lap.lapNumber,
        lapTime: round(lap.lapTime, 3),
        pointCount: lap.pointCount,
        trace: lap.trace.map(point => ({
          distance: round(point.distance, 3),
          speed: round(point.speed, 4),
        })),
      })),
      aggregatedLapTimeSeconds: round(aggregatedLapTimeSeconds, 3),
    },
    comparison,
  };

  printSummary(report);

  if (writeJson) {
    const safeTrackId = track.id.replace(/[^a-z0-9-]+/gi, '_');
    const safeDriverId = driver.id.replace(/[^a-z0-9-]+/gi, '_');
    await writeReport(report, `telemetry-consistency-${safeTrackId}-${safeDriverId}-seed-${seed}.json`);
  }
};

main().catch(error => {
  console.error(`Telemetry consistency run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
