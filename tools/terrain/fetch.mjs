// Fetches the real ground round the app's American launch and landing sites from U.S. government open data (all of
// it public domain) and writes each site as one compact file, assets/terrain_<id>.json, which app/43_terrain.js draws
// as a relief with water, streams and roads:
//
//   elevation  USGS 3DEP (the National Map's seamless 1/3-arc-second elevation, ~10 m), as a grid of heights
//   water      USGS National Hydrography Dataset: the sea, lagoons, rivers, lakes and marsh as polygons, streams as lines
//   roads      U.S. Census Bureau TIGERweb: primary, secondary and local roads as lines
//   land cover MRLC National Land Cover Database (NLCD): a grid of classes (scrub, wetland, sand, built-up, …)
//
//   npm install            (in tools/terrain: geotiff and sharp)
//   node tools/terrain/fetch.mjs            # all sites
//   node tools/terrain/fetch.mjs ksc        # one
//
// Each site is a square of the given width, cut in plain latitude and longitude with its sides scaled so a cell is as
// wide as it is tall at the centre. Everything is written in the site's local frame, metres east and north of the
// centre, rounded to the metre; polygons and lines are clipped to the square and simplified to a few metres. The grids
// are stored row by row from the south-west corner, base64: heights as decimetres above the lowest cell (Uint16, little
// endian), land cover as NLCD class codes (Uint8).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';

export const SITES = {
  ksc: { name: 'Kennedy Space Center: Pads 39A and 39B, the VAB and the Shuttle Landing Facility', lat: 28.615, lon: -80.655, km: 16 },
  cape: { name: 'Cape Canaveral: SLC-41 and LC-12', lat: 28.53, lon: -80.57, km: 12 },
  starbase: { name: 'Starbase, Texas', lat: 25.997, lon: -97.155, km: 8 },
  edwards: { name: 'Edwards Air Force Base and Rogers Dry Lake', lat: 34.93, lon: -117.85, km: 24 },
  whitesands: { name: 'White Sands Space Harbor', lat: 32.99, lon: -106.425, km: 16 },
};
const N = 384; // grid cells across a site
const DEM = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const NHD = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer';
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer';
const NLCD_WMS = 'https://www.mrlc.gov/geoserver/mrlc_display/wms';
// the NLCD legend: class code and its colour on the map (the WMS gives the colours; the classes come back from them)
const NLCD = [[11, '466b9f'], [12, 'd1def8'], [21, 'dec5c5'], [22, 'd99282'], [23, 'eb0000'], [24, 'ab0000'], [31, 'b3ac9f'], [41, '68ab5f'], [42, '1c5f2c'], [43, 'b5c58f'], [51, 'af963c'], [52, 'ccb879'], [71, 'dfdfc2'], [72, 'd1d182'], [73, 'a3cc51'], [74, '82ba9e'], [81, 'dcd939'], [82, 'ab6c28'], [90, 'b8d9eb'], [95, '6c9fb8']]
  .map(([c, h]) => [c, parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const DEG = Math.PI / 180;

async function get(url, what, kind = 'json') {
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'mission-studio terrain fetch (github.com/sean-lab/mission-studio)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (kind === 'json') { const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200)); return j; }
      if (kind === 'text') return await r.text();
      const b = Buffer.from(await r.arrayBuffer()); if (b.length < 200) throw new Error('short reply: ' + b.toString('utf8').slice(0, 160)); return b;
    } catch (e) { console.log(`  ${what}: ${e.message} (retry ${k + 1})`); await new Promise(f => setTimeout(f, 2500 * (k + 1))); }
  }
  throw new Error(`could not fetch ${what}: ${url}`);
}
// the site's square: half-widths in degrees, and the map from lon/lat to local metres
function frame(S) {
  const mPerLat = 110574, mPerLon = 111320 * Math.cos(S.lat * DEG), h = S.km * 500;
  return { dLat: h / mPerLat, dLon: h / mPerLon, h, toM: ([lon, lat]) => [(lon - S.lon) * mPerLon, (lat - S.lat) * mPerLat], bbox: `${S.lon - h / mPerLon},${S.lat - h / mPerLat},${S.lon + h / mPerLon},${S.lat + h / mPerLat}` };
}
// ---- elevation ----
async function elevation(S, F) {
  const url = `${DEM}?bbox=${F.bbox}&bboxSR=4326&imageSR=4326&size=${N},${N}&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_BilinearInterpolation&f=image`;
  const buf = await get(url, 'elevation', 'bin');
  const tif = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), img = await tif.getImage();
  const w = img.getWidth(), hgt = img.getHeight(), ras = (await img.readRasters())[0];
  if (w !== N || hgt !== N) throw new Error(`elevation came back ${w}×${hgt}`);
  const z = new Float32Array(N * N); // rows from the south (the TIFF's rows run from the north)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let v = ras[(N - 1 - j) * N + i]; if (!(v > -9000) || Number.isNaN(v)) v = 0; z[j * N + i] = v; }
  let lo = Infinity, hi = -Infinity; for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const base = Math.floor(lo * 10) / 10, q = new Uint16Array(N * N); for (let i = 0; i < N * N; i++) q[i] = Math.min(65535, Math.round((z[i] - base) * 10));
  console.log(`  elevation ${lo.toFixed(1)}…${hi.toFixed(1)} m`);
  return { base, min: lo, max: hi, data: Buffer.from(q.buffer).toString('base64') };
}
// ---- ArcGIS feature queries (esri JSON: rings for polygons, paths for lines), paged ----
async function features(server, layer, F, fields, what) {
  const out = []; let off = 0;
  for (;;) {
    const url = `${server}/${layer}/query?where=1%3D1&geometry=${F.bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${fields}&outSR=4326&returnGeometry=true&geometryPrecision=6&resultOffset=${off}&resultRecordCount=1000&f=json`;
    const j = await get(url, `${what} (from ${off})`);
    const fs = j.features || []; out.push(...fs); off += fs.length;
    if (!j.exceededTransferLimit || !fs.length) break;
  }
  console.log(`  ${what}: ${out.length} features`);
  return out;
}
// ---- geometry in the local frame: clip to the square, simplify ----
function clipRing(ring, h) { // Sutherland–Hodgman against the square [-h, h]²
  let P = ring;
  for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const inside = p => s * p[ax] <= h, Q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b);
      const cross = () => { const t = (h - s * a[ax]) / (s * b[ax] - s * a[ax]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      if (ia) { Q.push(a); if (!ib) Q.push(cross()); } else if (ib) Q.push(cross());
    }
    P = Q; if (!P.length) return P;
  }
  return P;
}
function clipLine(line, h) { // pieces of a polyline inside the square
  const out = []; let cur = [];
  const inside = p => Math.abs(p[0]) <= h && Math.abs(p[1]) <= h;
  for (let i = 0; i < line.length - 1; i++) {
    let [a, b] = [line[i], line[i + 1]], t0 = 0, t1 = 1, ok = true; // Liang–Barsky
    for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
      const p = s * (b[ax] - a[ax]), q = h - s * a[ax];
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p; if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    const pa = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], pb = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    if (!cur.length || !inside(a) || t0 > 0) { if (cur.length > 1) out.push(cur); cur = [pa]; }
    cur.push(pb);
    if (t1 < 1) { out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
function simplify(pts, tol, closed) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop(); if (i1 - i0 < 2) continue;
    const [x0, y0] = pts[i0], [x1, y1] = pts[i1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1; let best = -1, bd = tol;
    for (let i = i0 + 1; i < i1; i++) { const d = L > 1e-9 ? Math.abs(dx * (pts[i][1] - y0) - dy * (pts[i][0] - x0)) / L : Math.hypot(pts[i][0] - x0, pts[i][1] - y0); if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return closed && out.length < 3 ? [] : out;
}
const rnd = pts => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
function polygons(feats, F, tol = 4) { // esri rings → clipped, simplified rings in local metres (the first ring the outer, the rest holes, as the data has them)
  const out = [];
  for (const f of feats) {
    const rings = (f.geometry && f.geometry.rings) || []; const R = [];
    for (const r of rings) { const c = clipRing(r.map(F.toM), F.h); if (c.length < 3) continue; const s = rnd(simplify(c, tol, true)); if (s.length >= 3) R.push(s); }
    if (R.length) out.push({ a: f.attributes, rings: R });
  }
  return out;
}
function lines(feats, F, tol = 3) {
  const out = [];
  for (const f of feats) {
    const paths = (f.geometry && f.geometry.paths) || []; const L = [];
    for (const p of paths) for (const piece of clipLine(p.map(F.toM), F.h)) { const s = rnd(simplify(piece, tol, false)); if (s.length >= 2) L.push(s); }
    if (L.length) out.push({ a: f.attributes, paths: L });
  }
  return out;
}
// ---- water: NHD areas (rivers, the sea), waterbodies (lakes, ponds, estuaries), flowlines (streams) ----
const WATER_KIND = fc => { const t = Math.floor(fc / 100); return t === 445 ? 'sea' : t === 390 ? 'lake' : t === 460 ? 'river' : t === 466 ? 'swamp' : t === 436 ? 'reservoir' : t === 493 ? 'estuary' : t === 312 ? 'bay' : t === 403 ? 'inundation' : t === 361 ? 'playa' : t === 364 ? 'foreshore' : 'water'; };
async function water(F) {
  const area = await features(NHD, 9, F, 'ftype,fcode,gnis_name', 'water areas');
  const body = await features(NHD, 12, F, 'ftype,fcode,gnis_name', 'waterbodies');
  const flow = await features(NHD, 6, F, 'ftype,fcode,gnis_name', 'flowlines');
  const polys = [...polygons(area, F), ...polygons(body, F)].map(p => ({ kind: WATER_KIND(p.a.fcode || p.a.FCODE || 0), name: p.a.gnis_name || p.a.GNIS_NAME || undefined, rings: p.rings }))
    .filter(p => !['inundation', 'foreshore'].includes(p.kind));
  const streams = lines(flow, F).filter(l => { const fc = l.a.fcode || l.a.FCODE || 0; return Math.floor(fc / 100) === 460 || Math.floor(fc / 100) === 336; }) // stream/river and canal/ditch centrelines
    .map(l => ({ kind: Math.floor((l.a.fcode || l.a.FCODE || 0) / 100) === 336 ? 'canal' : 'stream', paths: l.paths }));
  return { polys, streams };
}
// ---- roads: TIGERweb, the layers named Primary / Secondary / Local Roads ----
async function roads(F) {
  const svc = await get(`${TIGER}?f=json`, 'TIGERweb layers');
  const out = [];
  for (const [cls, re] of [['primary', /^Primary Roads$/i], ['secondary', /^Secondary Roads$/i], ['local', /^Local Roads$/i]]) {
    const lyr = (svc.layers || []).find(l => re.test(l.name)); if (!lyr) { console.log(`  no layer for ${cls} roads (layers: ${(svc.layers || []).map(l => l.name).join(', ')})`); continue; }
    const fs = await features(TIGER, lyr.id, F, 'MTFCC,NAME', `${cls} roads`);
    for (const l of lines(fs, F, 2)) out.push({ cls, name: l.a.NAME || l.a.name || undefined, mtfcc: l.a.MTFCC || l.a.mtfcc, paths: l.paths });
  }
  return out;
}
// ---- land cover: the latest NLCD CONUS layer from the MRLC WMS, its colours matched back to classes ----
async function landcover(F) {
  const caps = await get(`${NLCD_WMS}?service=WMS&request=GetCapabilities&version=1.3.0`, 'NLCD capabilities', 'text');
  const names = [...caps.matchAll(/<Name>(NLCD_(\d{4})_Land_Cover_L48)<\/Name>/g)].sort((a, b) => +b[2] - +a[2]);
  if (!names.length) { console.log('  no NLCD land-cover layer found'); return null; }
  const layer = names[0][1], [x0, y0, x1, y1] = F.bbox.split(',').map(Number);
  const url = `${NLCD_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:4326&bbox=${y0},${x0},${y1},${x1}&width=${N}&height=${N}&format=image/png&transparent=false`;
  const png = await get(url, 'land cover', 'bin');
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== N || info.height !== N) throw new Error(`land cover came back ${info.width}×${info.height}`);
  const cls = new Uint8Array(N * N), count = {};
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = 3 * ((N - 1 - j) * N + i), r = data[o], g = data[o + 1], b = data[o + 2]; let best = 0, bd = Infinity;
    for (const [c, cr, cg, cb] of NLCD) { const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2; if (d < bd) { bd = d; best = c; } }
    cls[j * N + i] = bd < 1200 ? best : 0; count[best] = (count[best] || 0) + 1;
  }
  console.log(`  land cover ${layer}: ${Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c}×${n}`).join(' ')}`);
  return { layer, data: Buffer.from(cls).toString('base64') };
}
const want = process.argv.slice(2);
for (const [id, S] of Object.entries(SITES)) {
  if (want.length && !want.includes(id)) continue;
  console.log(`${id}: ${S.name}`);
  const F = frame(S);
  const site = { id, name: S.name, lat: S.lat, lon: S.lon, km: S.km, n: N, fetched: new Date().toISOString().slice(0, 10),
    sources: ['USGS 3DEP elevation', 'USGS National Hydrography Dataset', 'U.S. Census Bureau TIGERweb', 'MRLC NLCD land cover'] };
  site.elev = await elevation(S, F);
  Object.assign(site, await water(F));
  site.roads = await roads(F);
  try { site.cover = await landcover(F); } catch (e) { console.log('  land cover skipped:', e.message); }
  mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `terrain_${id}.json`), txt = JSON.stringify(site);
  writeFileSync(out, txt); console.log(`  wrote ${out} (${(txt.length / 1024).toFixed(0)} KB)`);
}
