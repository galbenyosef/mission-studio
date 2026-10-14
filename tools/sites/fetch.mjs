// Downloads the aerial imagery of the app's American launch and landing sites from the USGS National Map (NAIP, the
// National Agriculture Imagery Program: public domain, 0.6–1 m photographs of the whole country) and writes each site's
// square as a JPEG into assets/, where app/43_sites.js drapes it over the ground round the pad or the runway.
//
//   node tools/sites/fetch.mjs            # all sites
//   node tools/sites/fetch.mjs ksc        # one
//
// Each site: its centre, the width of its square (km) and the pixels across; the squares are cut in plain latitude and
// longitude, their sides scaled so a pixel is as wide as it is tall at the centre. The ImageServer returns at most 4096 px
// a side in one request, so a bigger square is fetched as tiles and joined (sharp).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
export const SITES = {
  ksc: { name: 'Kennedy Space Center: Pads 39A and 39B, the VAB and the Shuttle Landing Facility', lat: 28.615, lon: -80.655, km: 16, px: 4096 },
  cape: { name: 'Cape Canaveral: SLC-41 and LC-12', lat: 28.53, lon: -80.57, km: 12, px: 4096 },
  starbase: { name: 'Starbase, Texas', lat: 25.997, lon: -97.155, km: 8, px: 4096 },
  edwards: { name: 'Edwards Air Force Base and Rogers Dry Lake', lat: 34.93, lon: -117.85, km: 24, px: 4096 },
  whitesands: { name: 'White Sands Space Harbor', lat: 32.99, lon: -106.425, km: 16, px: 4096 },
};
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const want = process.argv.slice(2);
for (const [id, S] of Object.entries(SITES)) {
  if (want.length && !want.includes(id)) continue;
  const dLat = S.km / 110.574 / 2, dLon = S.km / (111.32 * Math.cos(S.lat * Math.PI / 180)) / 2;
  const T = Math.ceil(S.px / 2048), tile = S.px / T, tiles = []; // 2048 px tiles: well inside the server's limit, and quick to retry
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const x0 = S.lon - dLon + 2 * dLon * i / T, x1 = S.lon - dLon + 2 * dLon * (i + 1) / T, y1 = S.lat + dLat - 2 * dLat * j / T, y0 = S.lat + dLat - 2 * dLat * (j + 1) / T;
    const url = `${NAIP}?bbox=${x0},${y0},${x1},${y1}&bboxSR=4326&imageSR=4326&size=${tile},${tile}&format=jpg&f=image`;
    process.stdout.write(`${id} tile ${j * T + i + 1}/${T * T} … `);
    let buf = null;
    for (let k = 0; k < 4 && !buf; k++) { try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); } catch (e) { console.log('retry:', e.message); await new Promise(f => setTimeout(f, 3000)); } }
    if (!buf) throw new Error('could not fetch ' + url);
    tiles.push({ input: buf, left: i * tile, top: j * tile }); console.log(buf.length, 'bytes');
  }
  mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `site_${id}.jpg`);
  await sharp({ create: { width: S.px, height: S.px, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  console.log('wrote', out, `(${S.km} km, ${(S.km * 1000 / S.px).toFixed(1)} m/px)`);
}
