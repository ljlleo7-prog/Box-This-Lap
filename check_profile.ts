import { TRACKS } from './src/data/tracks/index.ts';
import fs from 'node:fs/promises';
import { buildTrackProfile, lookupTrackProfileSpeed } from './src/engine/trackProfile.ts';

const run = async () => {
  const t = TRACKS.find(t => t.id === 'silverstone-gp');
  const sectorsData = JSON.parse(await fs.readFile('./public/openf1/sectoring_calculated.json', 'utf8'));
  t.sectors = sectorsData.sectorsByTrack['silverstone-gp'].sectors;
  const profile = buildTrackProfile(t);
  for (let d = 800; d <= 1000; d += 20) {
     console.log(`Dist: ${d}m -> speed: ${lookupTrackProfileSpeed(profile, d) * 3.6} km/h`);
  }
};
run();
