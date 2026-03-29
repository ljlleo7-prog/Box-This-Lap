import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(ROOT_DIR, 'src', 'data', 'tracks');
const TELEMETRY_DIR = path.join(TRACKS_DIR, 'telemetry');
const SPEED_CURVES_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'speed_curves.json');
const SECTORS_PATH = path.join(ROOT_DIR, 'public', 'openf1', 'sectoring_calculated.json');

// Re-use openF1Aliases
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
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

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
      speed: (point.avgSpeedKph ?? 0) / 3.6 // Convert to m/s for physics engine!
    }));
};

const main = async () => {
  await fs.mkdir(TELEMETRY_DIR, { recursive: true });
  
  const curvesData = JSON.parse(await fs.readFile(SPEED_CURVES_PATH, 'utf-8'));
  const sectorsData = JSON.parse(await fs.readFile(SECTORS_PATH, 'utf-8'));
  
  const files = await fs.readdir(TRACKS_DIR);
  const tsFiles = files.filter(f => f.endsWith('.ts') && f !== 'index.ts');
  
  for (const file of tsFiles) {
    const filePath = path.join(TRACKS_DIR, file);
    let content = await fs.readFile(filePath, 'utf-8');
    
    const idMatch = content.match(/id:\s*'([^']+)'/);
    const nameMatch = content.match(/name:\s*'([^']+)'/);
    const distMatch = content.match(/totalDistance:\s*([0-9.]+)/);
    
    if (!idMatch || !nameMatch || !distMatch) continue;
    const trackId = idMatch[1];
    const trackName = nameMatch[1];
    const totalDist = Number(distMatch[1]);
    
    const telemetryPoints = resolveOpenF1Curve(trackId, trackName, totalDist, curvesData);
    const sectorsObj = sectorsData.sectorsByTrack[trackId];
    
    const trackTelemetry = {
      sectors: sectorsObj ? sectorsObj.sectors : [],
      telemetryPoints
    };
    
    const outJsonPath = path.join(TELEMETRY_DIR, `${trackId}.json`);
    await fs.writeFile(outJsonPath, JSON.stringify(trackTelemetry, null, 2));
    
    const legacySectorsRegex = /sectors:\s*\[[\s\S]*?\],\n/m;
    const telemetrySectorsRegex = /sectors:\s*telemetry\.sectors(?:\s+as\s+any)?\s*,/m;

    if (!content.includes(`import telemetry from './telemetry/${trackId}.json'`)) {
      content = content.replace(/import \{ Track \} from '\.\.\/\.\.\/types';/, `import { Track } from '../../types';\nimport telemetry from './telemetry/${trackId}.json';`);
    }
    
    if (legacySectorsRegex.test(content)) {
      content = content.replace(legacySectorsRegex, `sectors: telemetry.sectors as any,\n    telemetryPoints: telemetry.telemetryPoints,\n`);
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`Updated ${file} to use telemetry JSON`);
    } else if (telemetrySectorsRegex.test(content)) {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`Already telemetry-driven: ${file}`);
    } else {
      console.log(`Could not find sectors array in ${file}`);
    }
  }
};

main().catch(console.error);
