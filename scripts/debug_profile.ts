import fs from 'node:fs';
import { TRACKS } from '../src/data/tracks/index';
import { buildTrackProfile, lookupTrackProfileSpeed } from '../src/engine/trackProfile';

const track = TRACKS.find(t => t.id === 'silverstone-gp')!;
const sectorsData = JSON.parse(fs.readFileSync('./public/openf1/sectoring_calculated.json', 'utf8'));
const trackSectors = sectorsData.sectorsByTrack[track.id].sectors;
track.sectors = trackSectors;

const profile = buildTrackProfile(track, 5);

const dist = 0.151 * track.totalDistance;
console.log(`Dist: ${dist}`);
console.log(`Profile speed at ${dist}: ${lookupTrackProfileSpeed(profile, dist) * 3.6} km/h`);
console.log(`Profile speed at ${dist - 50}: ${lookupTrackProfileSpeed(profile, dist - 50) * 3.6} km/h`);
console.log(`Profile speed at ${dist + 50}: ${lookupTrackProfileSpeed(profile, dist + 50) * 3.6} km/h`);

