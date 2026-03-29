import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SPEED_CURVES_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'speed_curves.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'sectoring_ollama.json');
const TRACKS_INDEX_PATH = path.join(ROOT_DIR, 'src', 'data', 'tracks', 'index.ts');
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

const openF1Aliases = {
  'silverstone-gp': ['Silverstone'],
  'monza-gp': ['Monza'],
  'spa-gp': ['Spa-Francorchamps', 'Spa'],
  'china-gp': ['Shanghai'],
  'singapore-gp': ['Singapore', 'Marina Bay'],
  'bahrain-gp': ['Sakhir', 'Bahrain'],
  'abu-dhabi-gp': ['Yas Marina', 'Abu Dhabi'],
  'monaco-gp': ['Monte Carlo', 'Monaco']
};

const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseTrackImports = (indexText) => {
  const importRegex = /import\s+\{\s*([A-Z0-9_]+)\s*\}\s+from\s+'\.\/([^']+)'/g;
  const importMap = new Map();
  let match;
  while ((match = importRegex.exec(indexText)) !== null) {
    importMap.set(match[1], match[2]);
  }
  const tracksBlock = indexText.match(/export const TRACKS: Track\[]\s*=\s*\[([\s\S]*?)\]/);
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
      speedKph: point.avgSpeedKph ?? 0
    }));
};

const downsampleCurve = (curve, maxPoints) => {
  if (curve.length <= maxPoints) return curve;
  const step = Math.ceil(curve.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < curve.length; i += step) {
    sampled.push(curve[i]);
  }
  if (sampled[sampled.length - 1].dist !== curve[curve.length - 1].dist) {
    sampled.push(curve[curve.length - 1]);
  }
  return sampled;
};

const buildPrompt = (track, curve) => {
  const points = downsampleCurve(curve, 120).map(point => ({
    distance: Math.round(point.dist),
    speedKph: Math.round(point.speedKph * 10) / 10
  }));
  return [
    `Track name: ${track.name}`,
    `Track total distance (meters): ${track.totalDistance}`,
    `Speed curve samples (distance meters, speed kph):`,
    JSON.stringify(points),
    `Return a JSON array of 40-50 sector objects that cover the full lap with no gaps or overlaps.`,
    `Each sector object must have:`,
    `id (string), name (string), startDistance (meters), endDistance (meters),`,
    `type ("straight" | "corner_high_speed" | "corner_medium_speed" | "corner_low_speed"),`,
    `difficulty (0 to 1), maxSpeed (m/s for corners, omit or null for straights).`,
    `Straights should be single continuous sectors where the car freely accelerates.`,
    `Corners should be split into entry/apex/exit sectors where appropriate.`,
    `Only output valid JSON with no extra text.`
  ].join('\n');
};

const extractJson = (text) => {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeSectors = (sectors, totalDistance) => {
  const cleaned = sectors
    .filter(item => item && Number.isFinite(item.startDistance) && Number.isFinite(item.endDistance))
    .map((item, index) => ({
      id: String(item.id ?? `s${index + 1}`),
      name: String(item.name ?? `S${index + 1}`),
      startDistance: Number(item.startDistance),
      endDistance: Number(item.endDistance),
      type: item.type,
      difficulty: clamp(Number(item.difficulty ?? 0.5), 0.05, 0.98),
      maxSpeed: item.maxSpeed === null || item.maxSpeed === undefined ? undefined : Number(item.maxSpeed)
    }))
    .filter(item => item.endDistance > item.startDistance)
    .sort((a, b) => a.startDistance - b.startDistance);
  if (!cleaned.length) return [];
  const normalized = [];
  let cursor = 0;
  cleaned.forEach((item, index) => {
    const startDistance = index === 0 ? 0 : Math.max(cursor, item.startDistance);
    const endDistance = index === cleaned.length - 1 ? totalDistance : Math.min(totalDistance, item.endDistance);
    if (endDistance > startDistance) {
      normalized.push({
        ...item,
        startDistance,
        endDistance
      });
      cursor = endDistance;
    }
  });
  if (normalized.length && normalized[normalized.length - 1].endDistance !== totalDistance) {
    normalized[normalized.length - 1].endDistance = totalDistance;
  }
  return normalized;
};

const requestOllama = async (prompt) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error: ${response.status} ${text}`);
  }
  const data = await response.json();
  return data.response ?? '';
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

const main = async () => {
  const raw = await fs.readFile(SPEED_CURVES_PATH, 'utf-8');
  const curves = JSON.parse(raw);
  const tracks = await loadTracks();
  const sectorsByTrack = {};
  const errors = [];
  for (const track of tracks) {
    const curve = resolveOpenF1Curve(track.id, track.name, track.totalDistance, curves);
    if (!curve.length) continue;
    try {
      const prompt = buildPrompt(track, curve);
      const responseText = await requestOllama(prompt);
      const parsed = extractJson(responseText);
      if (!Array.isArray(parsed)) {
        errors.push({ trackId: track.id, reason: 'invalid_json' });
        continue;
      }
      const sectors = normalizeSectors(parsed, track.totalDistance);
      if (!sectors.length) {
        errors.push({ trackId: track.id, reason: 'empty_sectors' });
        continue;
      }
      sectorsByTrack[track.id] = {
        name: track.name,
        totalDistance: track.totalDistance,
        sectorCount: sectors.length,
        sectors
      };
    } catch (error) {
      errors.push({ trackId: track.id, reason: error instanceof Error ? error.message : 'unknown_error' });
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'ollama',
    model: OLLAMA_MODEL,
    errors,
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
