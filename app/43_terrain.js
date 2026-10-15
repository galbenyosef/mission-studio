// ============================================================================
// The real ground round the American launch and landing sites, drawn from data rather than photographed: the relief
// from the USGS elevation model, the sea, lagoons, rivers, lakes and marsh from the National Hydrography Dataset, the
// roads from the Census Bureau, the land coloured by the National Land Cover Database (tools/terrain/fetch.mjs writes
// each site as assets/terrain_<id>.json; all of it public domain). The buildings are drawn by hand (app/44_buildings.js)
// since no public-domain dataset has them.
// The site is a square draped over the sphere in the planet's mesh frame, as the runway is (app/42_shuttleview.js): a
// grid of heights with vertex colours and a fine scrub texture, water as flat polygons at their level, streams and roads
// as strips on the ground. Where a pad or a runway stands the ground is flattened to its level so the pad's slab and the
// runway lie on it; toward the rim the ground fades out and the globe's own map shows through. Without a site file the
// pad's procedural ground stays, as before.
// ============================================================================
const TERRAIN_SITES = {
  ksc: { lat: 28.615, lon: -80.655, km: 32 },
  starbase: { lat: 25.997, lon: -97.155, km: 12 },
  edwards: { lat: 34.93, lon: -117.85, km: 48 },
  whitesands: { lat: 32.99, lon: -106.425, km: 32 },
};
const TER = { groups: [], missing: {}, pending: 0 };
// the land's colours by NLCD class (sRGB), with how rough the scrub texture should show on each
const TER_COVER = {
  0: ['#8d8a60', 1], 11: ['#3d6a86', 0.2], 12: ['#e8ecf0', 0.3],
  21: ['#8f9478', 0.7], 22: ['#8a8c80', 0.5], 23: ['#7d7e78', 0.4], 24: ['#6c6c6a', 0.3],
  31: ['#c9bea4', 0.6], 41: ['#55733c', 1.2], 42: ['#3d5c34', 1.2], 43: ['#4f6b3c', 1.2],
  51: ['#9c925e', 1], 52: ['#8f8c5e', 1], 71: ['#a6a26c', 0.9], 72: ['#aaa878', 0.8], 73: ['#9aa070', 0.8], 74: ['#8fa07e', 0.8],
  81: ['#93a65c', 0.7], 82: ['#a89060', 0.6], 90: ['#4e6a45', 1.1], 95: ['#7a8a58', 0.9],
};
const TER_WATER = { sea: '#22486b', bay: '#23486a', estuary: '#264c69', lake: '#254a68', reservoir: '#254a68', river: '#284e6a', swamp: '#3d5c56', playa: '#cfc6ae', water: '#254a68' };
const TER_ROAD = { primary: [14, '#4c4e52'], secondary: [9, '#55575a'], local: [5.5, '#6a6a66'] };
// the site whose square holds the point (a little inside its edge)
function terrainSiteFor(lat, lon) {
  for (const [id, S] of Object.entries(TERRAIN_SITES)) {
    const dN = (lat - S.lat) * 110.574, dE = (lon - S.lon) * 111.32 * Math.cos(S.lat * DEG), h = S.km / 2 - 0.5;
    if (Math.abs(dN) < h && Math.abs(dE) < h && !TER.missing[id]) return id;
  }
  return null;
}
function b64(s, T) { const bin = atob(s), u8 = new Uint8Array(bin.length); for (let i = 0; i < u8.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); }
// the mission's sites: the launch site and, on a Shuttle flight, the landing runway
function buildTerrain(md) {
  disposeTerrain();
  const want = new Set(), S = LAUNCH_SITES[md.cfg.site], rw = md.cfg.runway && RUNWAYS[md.cfg.runway];
  for (const p of [S, rw]) { if (!p) continue; const id = terrainSiteFor(p.lat, p.lon); if (id) want.add(id); }
  for (const id of want) loadTerrain(id, md);
}
function loadTerrain(id, md) {
  TER.pending++;
  fetch(ASSET(`terrain_${id}.json`)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(T => { if (MV.md === md) terrainBuild(id, T, md); })
    .catch(() => { TER.missing[id] = true; }) // (no file for this site: the pad's procedural ground stays)
    .finally(() => { TER.pending--; });
}
function disposeTerrain() {
  for (const g of TER.groups) { g.parent && g.parent.remove(g); g.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material !== padGround.mat) n.material.dispose(); }); }
  TER.groups = [];
  if (MV.pad) MV.pad.traverse(n => { if (n.userData.padGround) n.visible = true; });
}
// ---- the build ----
function terrainBuild(id, T, md) {
  const S = TERRAIN_SITES[id], b = R.bodies.earth, N = T.n, L = T.km * 1000, cell = L / (N - 1);
  const C = meshDir(S.lat, S.lon), { E, N: Nn } = meshEN(S.lat, S.lon), Rb = b.R * 1000;
  const elev = b64(T.elev.data, Uint16Array), cover = T.cover ? b64(T.cover.data, Uint8Array) : null;
  // the level the sphere's cap sits at here (a runway's elevation lifts it, app/40_missionview.js) and the flat spots:
  // the pad and the runway, each at its own level, blended into the relief round them
  const capE = (md.cfg.runway && RUNWAYS[md.cfg.runway] && terrainSiteFor(RUNWAYS[md.cfg.runway].lat, RUNWAYS[md.cfg.runway].lon) === id ? RUNWAYS[md.cfg.runway].elev : 0) * 1000;
  const toLocal = (lat, lon) => [(lon - S.lon) * 111320 * Math.cos(S.lat * DEG), (lat - S.lat) * 110574];
  const flats = []; // { x, y, r0, r1, level } discs, and strips { x0, y0, x1, y1, w, level }
  const site = LAUNCH_SITES[md.cfg.site]; if (terrainSiteFor(site.lat, site.lon) === id) { const [x, y] = toLocal(site.lat, site.lon); flats.push({ x, y, r0: 170, r1: 650, level: 0.2 }); }
  const rw = md.cfg.runway && RUNWAYS[md.cfg.runway];
  if (rw && terrainSiteFor(rw.lat, rw.lon) === id) { const [x0, y0] = toLocal(rw.lat, rw.lon), hd = rw.hdg * DEG, l = rw.len * 1000; flats.push({ x0, y0, x1: x0 + Math.sin(hd) * l, y1: y0 + Math.cos(hd) * l, w: rw.wid * 500 + 40, w1: rw.wid * 500 + 400, level: capE + 0.2 }); }
  const hAt = (x, y) => { // height above the sphere at a local point, m: the relief (never below the cap) with the flats
    const fi = (x / L + 0.5) * (N - 1), fj = (y / L + 0.5) * (N - 1), i0 = clamp(Math.floor(fi), 0, N - 2), j0 = clamp(Math.floor(fj), 0, N - 2), tx = clamp(fi - i0, 0, 1), ty = clamp(fj - j0, 0, 1);
    const z = (i, j) => T.elev.base + elev[j * N + i] / 10;
    let h = (z(i0, j0) * (1 - tx) + z(i0 + 1, j0) * tx) * (1 - ty) + (z(i0, j0 + 1) * (1 - tx) + z(i0 + 1, j0 + 1) * tx) * ty;
    h = Math.max(h - capE, 0) + 0.2;
    for (const f of flats) {
      let d; if (f.r0 != null) d = Math.hypot(x - f.x, y - f.y) <= f.r0 ? 0 : (Math.hypot(x - f.x, y - f.y) - f.r0) / (f.r1 - f.r0);
      else { const dx = f.x1 - f.x0, dy = f.y1 - f.y0, ll = dx * dx + dy * dy, t = clamp(((x - f.x0) * dx + (y - f.y0) * dy) / ll, 0, 1), dd = Math.hypot(x - f.x0 - dx * t, y - f.y0 - dy * t); d = dd <= f.w ? 0 : (dd - f.w) / (f.w1 - f.w); }
      if (d < 1) h = (f.level - capE) * (1 - smoothstep(d)) + h * smoothstep(d);
    }
    return h;
  };
  const at = (x, y, h) => vscale(vunit(vadd(vscale(C, Rb), vadd(vscale(E, x), vscale(Nn, y)))), Rb + capE + h);
  const Pc = at(0, 0, 0), grp = new THREE.Group();
  // the rim: the ground and the water fade out over the outer sixth, and the globe's own map shows through
  const fadeAt = (x, y) => 1 - smoothstep((Math.max(Math.abs(x), Math.abs(y)) / (L / 2) - 0.84) / 0.15);
  // --- the ground: the grid, coloured by land cover (a texture of the classes, so the colour runs smoothly between
  // cells) with the fine scrub texture over it
  {
    const pos = new Float32Array(3 * N * N), uv = new Float32Array(2 * N * N), fade = new Float32Array(N * N), idx = [];
    // the classes' colours pulled toward the globe's own map colour here, so the square's ground is the same country as
    // the land round it (the Mojave pale, Florida green), the classes giving the detail
    const G = globeColorAt(S.lat, S.lon), cc = {}; for (const k in TER_COVER) { const c = new THREE.Color(TER_COVER[k][0]); if (G) c.lerp(G, 0.55); cc[k] = c.convertLinearToSRGB(); }
    const water = new THREE.Color(TER_WATER.sea).convertLinearToSRGB();
    const hash = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
    const tex = new Uint8Array(3 * N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * L, y = (j / (N - 1) - 0.5) * L, h = hAt(x, y), p = at(x, y, h), o = j * N + i;
      pos[3 * o] = p[0] - Pc[0]; pos[3 * o + 1] = p[1] - Pc[1]; pos[3 * o + 2] = p[2] - Pc[2];
      uv[2 * o] = i / (N - 1); uv[2 * o + 1] = j / (N - 1);
      fade[o] = fadeAt(x, y);
      const k = cover ? cover[o] : 0, c = k === 11 ? water : (cc[k] || cc[0]), v = 0.92 + 0.16 * hash(i, j);
      tex[3 * o] = Math.min(255, c.r * 255 * v); tex[3 * o + 1] = Math.min(255, c.g * 255 * v); tex[3 * o + 2] = Math.min(255, c.b * 255 * v); // (the colours are kept in sRGB below)
    }
    for (let pass = 0; pass < 2; pass++) { // the cells' colours blurred a little, so the classes' edges do not show as a mosaic
      const src = tex.slice();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let ch = 0; ch < 3; ch++) { let a = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; a += src[3 * (jj * N + ii) + ch]; n++; } tex[3 * (j * N + i) + ch] = a / n; }
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, bq = a + 1, c = a + N, d = c + 1; idx.push(a, bq, c, bq, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aFade', new THREE.BufferAttribute(fade, 1)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, terrainMat({ map: terrainClassTexture(tex, N), rep: L / 80 })); mesh.renderOrder = 1; grp.add(mesh);
  }
  // --- water: each polygon flat at its level (the sea at the datum, a lake at the ground's lowest point along its
  // shore), cut into 1-km tiles so its triangles stay short and follow the sphere
  {
    const byKind = {}, TILE = 1000;
    const addShape = (outer, holes, level, kind) => {
      const sh = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const hh of holes) sh.holes.push(new THREE.Path(hh.map(([x, y]) => new THREE.Vector2(x, y))));
      let g; try { g = new THREE.ShapeGeometry(sh, 1); } catch (e) { return; }
      const p = g.attributes.position, arr = new Float32Array(p.count * 3), fd = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), q = at(x, y, level); arr[3 * i] = q[0] - Pc[0]; arr[3 * i + 1] = q[1] - Pc[1]; arr[3 * i + 2] = q[2] - Pc[2]; fd[i] = fadeAt(x, y); }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.setAttribute('aFade', new THREE.BufferAttribute(fd, 1)); g.deleteAttribute('uv'); g.deleteAttribute('normal');
      (byKind[kind] || (byKind[kind] = [])).push(g);
    };
    const inRing = (p, o) => { let inside = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) { const a = o[i], c = o[j]; if ((a[1] > p[1]) !== (c[1] > p[1]) && p[0] < (c[0] - a[0]) * (p[1] - a[1]) / (c[1] - a[1]) + a[0]) inside = !inside; } return inside; };
    const clipTo = (ring, x0, y0, x1, y1) => { // Sutherland–Hodgman against a tile
      let P = ring;
      for (const [ax, lim, keepBelow] of [[0, x1, true], [0, x0, false], [1, y1, true], [1, y0, false]]) {
        const inside = p => keepBelow ? p[ax] <= lim : p[ax] >= lim, Q = [];
        for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b); const cr = () => { const t = (lim - a[ax]) / (b[ax] - a[ax]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }; if (ia) { Q.push(a); if (!ib) Q.push(cr()); } else if (ib) Q.push(cr()); }
        P = Q; if (P.length < 3) return [];
      }
      return P;
    };
    const area2 = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0; } return a; };
    for (const w of T.polys || []) {
      let level;
      if (w.kind === 'sea' || w.kind === 'bay' || w.kind === 'estuary') level = 0.45 - capE; // the datum
      else { level = Infinity; for (const r of w.rings) for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 40))) level = Math.min(level, hAt(r[i][0], r[i][1])); level += 0.3; }
      level = Math.max(level, 0.3);
      // esri rings: clockwise outers (negative signed area here, y up), counter-clockwise holes; each outer takes the holes inside it
      const outers = [], holes = [];
      for (const r of w.rings) (area2(r) < 0 ? outers : holes).push(r);
      if (!outers.length && holes.length) outers.push(holes.shift().slice().reverse());
      for (const o of outers) {
        const myHoles = holes.filter(hh => inRing(hh[0], o));
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; for (const [x, y] of o) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        for (let ty = Math.floor(by0 / TILE) * TILE; ty < by1; ty += TILE) for (let tx = Math.floor(bx0 / TILE) * TILE; tx < bx1; tx += TILE) {
          const co = clipTo(o, tx, ty, tx + TILE, ty + TILE); if (co.length < 3) continue;
          const ch = myHoles.map(hh => clipTo(hh, tx, ty, tx + TILE, ty + TILE)).filter(r => r.length >= 3);
          // a hole that covers the whole tile leaves nothing; one that covers the clipped outer exactly, the same
          if (ch.some(r => Math.abs(area2(r)) >= Math.abs(area2(co)) - 1)) continue;
          addShape(co, ch, level, w.kind);
        }
      }
    }
    for (const [kind, gs] of Object.entries(byKind)) {
      const g = mergeGeos(gs), playa = kind === 'playa';
      const mesh = new THREE.Mesh(g, terrainMat({ color: TER_WATER[kind] || TER_WATER.water, ocean: playa ? 0 : 1, offset: -1 })); mesh.renderOrder = 2; grp.add(mesh);
    }
  }
  // --- streams and roads: strips laid on the ground
  const strips = (lines, w, lift) => {
    const pos = [], idx = [], fd = []; let n = 0;
    for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = line[i], [x1, y1] = line[i + 1], dx = x1 - x0, dy = y1 - y0, ll = Math.hypot(dx, dy) || 1, nx = -dy / ll * w / 2, ny = dx / ll * w / 2;
      const seg = Math.max(1, Math.ceil(ll / 150)); // long segments follow the relief in pieces
      for (let s = 0; s <= seg; s++) {
        const x = x0 + dx * s / seg, y = y0 + dy * s / seg, h = hAt(x, y) + lift;
        for (const k of [-1, 1]) { const p = at(x + nx * k, y + ny * k, h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); fd.push(fadeAt(x, y)); }
        if (s) { const a = n - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        n += 2;
      }
    }
    if (!n) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFade', new THREE.Float32BufferAttribute(fd, 1)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const addStrips = (g, color, rough, order) => { if (!g) return; const mesh = new THREE.Mesh(g, terrainMat({ color, offset: -2 })); mesh.renderOrder = order; grp.add(mesh); };
  addStrips(strips((T.streams || []).filter(s => s.kind === 'stream').flatMap(s => s.paths), 3, 0.08), TER_WATER.river, 0.3, 2);
  addStrips(strips((T.streams || []).filter(s => s.kind === 'canal').flatMap(s => s.paths), 5, 0.08), TER_WATER.river, 0.3, 2);
  for (const cls of ['local', 'secondary', 'primary']) { const [w, c] = TER_ROAD[cls]; addStrips(strips((T.roads || []).filter(r => r.cls === cls).flatMap(r => r.paths), w, 0.25), c, 0.9, 3); }
  // --- place it: metres → the mesh frame (unit sphere scaled by R)
  const k = 1 / Rb; grp.position.set(Pc[0] * k, Pc[1] * k, Pc[2] * k); grp.scale.setScalar(k);
  grp.userData = { id, hAt, toLocal, at, Pc, capE };
  b.mesh.add(grp); TER.groups.push(grp);
  if (MV.pad) MV.pad.traverse(n => { if (n.userData.padGround) n.visible = false; }); // the pad's scrub, beach and roads give way
  if (typeof buildBuildings === 'function') buildBuildings(id, grp, T, md);
  // every mesh: the sphere's up at each vertex (for the lighting) and the fade toward the rim, from the positions
  grp.traverse(n => { if (!n.isMesh) return; const g = n.geometry, p = g.attributes.position, up = new Float32Array(p.count * 3), fd = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + Pc[0], y = p.getY(i) + Pc[1], z = p.getZ(i) + Pc[2], r = Math.hypot(x, y, z); up[3 * i] = x / r; up[3 * i + 1] = y / r; up[3 * i + 2] = z / r;
      const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i); fd[i] = fadeAt(dx * E[0] + dy * E[1] + dz * E[2], dx * Nn[0] + dy * Nn[1] + dz * Nn[2]); }
    g.setAttribute('aUp', new THREE.BufferAttribute(up, 3)); g.setAttribute('aFade', new THREE.BufferAttribute(fd, 1)); });
}
// The terrain's material: lit as the globe is (the Sun through the air and the sky's light from the atmosphere model,
// app/15_atmos.js and app/20_scene.js) and seen through the same air, so the square is the same country as the globe
// round it, whatever the hour. alb: a texture (the land-cover colours) or a colour or the vertex colours, with the scrub
// texture over it at rep repeats across the square; ocean: the sea's glint and sky reflection; the fade toward the rim
// in aFade. Positions are in the planet's mesh frame (the group draped on the sphere), aUp the sphere's normal.
const GLSL_TERRAIN_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aUp; attribute float aFade; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vUp; varying float vFade; varying vec3 vCol;
#ifdef USE_VC
attribute vec3 color;
#endif
void main() {
  vUv = uv; vFade = aFade; vUp = normalize(mat3(modelMatrix) * aUp); vN = normalize(mat3(modelMatrix) * normal);
  #ifdef USE_VC
  vCol = color;
  #else
  vCol = vec3(1.0);
  #endif
  vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const GLSL_TERRAIN_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D tMap; uniform float uHasMap; uniform vec3 uColor; uniform sampler2D tScrub; uniform float uRep; uniform float uOcean; uniform vec3 uSunDir; uniform vec3 uFill;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vUp; varying float vFade; varying vec3 vCol;
${GLSL_ATMOS}
void main() {
  ${LOGDEPTH_EXACT}
  vec3 N = normalize(vUp), Nb = normalize(vN), L = normalize(uSunDir);
  if (!gl_FrontFacing) Nb = -Nb;
  vec3 seg = vP - cameraPosition; float dist = length(seg); vec3 d = seg / dist, V = -d;
  float mus = dot(N, L), muv = max(dot(N, V), 0.0);
  vec3 sun = aSunlight(aRg, mus) * (aSunE / PI), sky = aSkyLight(aRg, mus);
  vec3 alb = (uHasMap > 0.5 ? texture2D(tMap, vUv).rgb : uColor) * vCol;
  if (uRep > 0.0) { vec2 suv = vUv * uRep; float sA = texture2D(tScrub, suv * 0.071 + vec2(0.37, 0.11)).g, sB = texture2D(tScrub, suv * 0.23 + vec2(0.71, 0.53)).g, sC = texture2D(tScrub, suv).g; alb *= 0.55 + 0.6 * (sA + sB + sC) / (3.0 * 0.22); }
  vec3 col = alb * (sun * max(dot(Nb, L), 0.0) + sky);
  if (uOcean > 0.0) { // the water: glint off its ruffled surface and the sky's reflection (as the globe's sea)
    vec3 H = normalize(L + V); float nh = max(dot(N, H), 1e-3), vh = max(dot(V, H), 0.0);
    const float S2 = 0.035;
    float D = exp(-(1.0 - nh * nh) / (nh * nh * S2)) / (PI * S2 * nh * nh * nh * nh);
    float F = 0.02 + 0.98 * pow(1.0 - vh, 5.0), Fv = 0.02 + 0.98 * pow(1.0 - muv, 5.0);
    vec3 sea = col * (1.0 - Fv) + sun * PI * F * D / (4.0 * max(muv, 0.05)) + sky * Fv;
    col = mix(col, sea, uOcean);
  }
  col += alb * uFill * (1.0 - smoothstep(-0.10, 0.12, mus)); // the same night fill as the globe's
  float t0 = 0.0; // the air between the camera and this point
  if (aCamH > aRt - aRg) { float b = dot(aCam, d); vec3 pc = aCam - b * d; float Dt = aRt * aRt - dot(pc, pc); t0 = Dt > 0.0 ? clamp(-b - sqrt(Dt), 0.0, dist) : dist; }
  vec3 S, T; aIntegrate(aCam, d, t0, dist, L, 2, aCamH > aRt - aRg ? 12 : 16, S, T);
  col = col * T * aWB * aExpo + aDisplay(S);
  gl_FragColor = vec4(col, vFade);
  #include <colorspace_fragment>
}`;
function terrainMat(o) {
  const EU = R.bodies.earth.mat.uniforms, scrub = padGroundTex(); scrub.wrapS = scrub.wrapT = THREE.RepeatWrapping;
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_TERRAIN_V, fragmentShader: GLSL_TERRAIN_F, transparent: true, side: o.map ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: !!o.offset, polygonOffsetFactor: o.offset || 0, polygonOffsetUnits: o.offset || 0,
    defines: o.vertexColors ? { USE_VC: 1 } : {},
    uniforms: Object.assign({ tMap: { value: o.map || null }, uHasMap: { value: o.map ? 1 : 0 }, uColor: { value: new THREE.Color(o.color || '#ffffff') }, tScrub: { value: scrub }, uRep: { value: o.rep || 0 }, uOcean: { value: o.ocean || 0 },
      uSunDir: EU.uSunDir, uFill: EU.uFill }, atmosUniforms('earth')) });
  return m;
}
// the Earth map's colour at a point (sRGB), from the 4k day map: a few pixels round it averaged
function globeColorAt(lat, lon) {
  const e = (R.texLOD || []).find(x => x.body === 'earth' && x.srgb && !x.grey), im = e && e.base && e.base.image;
  if (!im || !im.width) return null;
  try {
    const c = globeColorAt.c || (globeColorAt.c = document.createElement('canvas')); c.width = 4; c.height = 4; const g = c.getContext('2d');
    const x = ((lon + 180) / 360) * im.width - 2, y = ((90 - lat) / 180) * im.height - 2;
    g.drawImage(im, x, y, 4, 4, 0, 0, 4, 4); const d = g.getImageData(0, 0, 4, 4).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < 16; i++) { r += d[4 * i]; gg += d[4 * i + 1]; b += d[4 * i + 2]; }
    return new THREE.Color().setRGB(r / 16 / 255, gg / 16 / 255, b / 16 / 255, THREE.SRGBColorSpace);
  } catch (e) { return null; }
}
// the land-cover colours as a texture over the square, sampled smoothly between cells
function terrainClassTexture(rgb, N) {
  const px = new Uint8Array(4 * N * N); for (let i = 0; i < N * N; i++) { px[4 * i] = rgb[3 * i]; px[4 * i + 1] = rgb[3 * i + 1]; px[4 * i + 2] = rgb[3 * i + 2]; px[4 * i + 3] = 255; }
  const t = new THREE.DataTexture(px, N, N, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
function mergeGeos(gs) { // positions and the fade (nothing else shared), for the water
  const pos = [], fd = [], idx = []; let n = 0;
  for (const g of gs) { const p = g.attributes.position, f = g.attributes.aFade, ix = g.index; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); fd.push(f ? f.getX(i) : 1); } if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + n); else for (let i = 0; i < p.count; i++) idx.push(i + n); n += p.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFade', new THREE.Float32BufferAttribute(fd, 1)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
