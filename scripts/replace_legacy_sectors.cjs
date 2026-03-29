const fs = require('fs');
const path = require('path');

const tracksDir = path.join(__dirname, '../src/data/tracks');
const sectorData = require('../public/openf1/sectoring_calculated.json');

const files = fs.readdirSync(tracksDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

files.forEach(file => {
  const filePath = path.join(tracksDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Find the track id
  const idMatch = content.match(/id:\s*'([^']+)'/);
  if (!idMatch) return;
  const trackId = idMatch[1];
  
  const trackSectors = sectorData.sectorsByTrack[trackId]?.sectors;
  if (!trackSectors) {
    console.log(`No calculated sectors found for ${trackId}, skipping...`);
    return;
  }
  
  // Replace the sectors array
  const sectorString = JSON.stringify(trackSectors, null, 4).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
  
  const regex = /sectors:\s*\[[\s\S]*?\],\n\s*drsZones/m;
  if (regex.test(content)) {
    content = content.replace(regex, `sectors: ${sectorString},\n    drsZones`);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${file} with telemetry sectors`);
  } else {
    console.log(`Could not match sectors array in ${file}`);
  }
});