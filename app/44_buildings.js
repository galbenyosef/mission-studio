// ============================================================================
// What no public-domain dataset holds: the buildings, the crawlerway, the other pads and the runways of a site, drawn by
// hand on the terrain (app/43_terrain.js) from published dimensions. Positions are read off public maps and are good to
// some tens of metres; the buildings are plain blocks in their colours. Only the main ones: what a camera a few
// kilometres off would pick out.
// Each entry: lat, lon of the centre, w (east–west) × d (north–south) × h metres, hdg: rotation clockwise from north,
// col: the walls, roof: the roof.
// ============================================================================
const SITE_FEATURES = {
  ksc: {
    buildings: [
      { name: 'Vehicle Assembly Building', lat: 28.5859, lon: -80.6512, w: 158, d: 218, h: 160, col: '#d9d7d0', roof: '#9a9893', vab: true, style: 'vab' },
      { name: 'Launch Control Center', lat: 28.5852, lon: -80.6489, w: 60, d: 115, h: 24, col: '#c9c6bd', roof: '#8d8b86', style: 'office' },
      { name: 'Orbiter Processing Facility 1 and 2', lat: 28.5878, lon: -80.6548, w: 120, d: 60, h: 29, col: '#cfcdc5', roof: '#8d8b86', style: 'hangar', door: 2 },
      { name: 'Orbiter Processing Facility 3', lat: 28.5904, lon: -80.6541, w: 70, d: 60, h: 29, col: '#cfcdc5', roof: '#8d8b86', style: 'hangar', door: 2 },
      { name: 'Rotation, Processing and Surge Facility', lat: 28.5947, lon: -80.6450, w: 60, d: 110, h: 30, col: '#c9c6bd', roof: '#8d8b86', style: 'hangar', door: 1 },
    ],
    // the crawlerway: two 12-m lanes of river rock 15 m apart, from the VAB's transfer aisle east, then north-east to the
    // fork, and on to each pad's ramp (the route is approximate)
    crawlerway: [[28.5862, -80.6487], [28.5880, -80.6300], [28.6010, -80.6195], [28.6045, -80.6110], [28.6083, -80.6043]],
    crawlerwayB: [[28.6010, -80.6195], [28.6160, -80.6220], [28.6272, -80.6209]],
    // the other pad (whichever the mission is not on): its mound with the hardstand on top
    pads: [{ site: 'KSC39A', lat: 28.6084, lon: -80.6043 }, { site: 'KSC39B', lat: 28.6272, lon: -80.6209 }],
    // the Shuttle Landing Facility, when the mission does not land on it (then app/42_shuttleview.js draws it)
    runways: [{ key: 'KSC15', lat: 28.632753, lon: -80.706062, hdg: 150, len: 4572, wid: 91 }],
  },
  starbase: {
    buildings: [ // the production site 2.5 km west along Highway 4 (approximate)
      { name: 'High Bay', lat: 25.9880, lon: -97.1855, w: 28, d: 28, h: 81, col: '#c8ccd0', roof: '#8a8e92', style: 'steel' },
      { name: 'Mega Bay', lat: 25.9872, lon: -97.1868, w: 30, d: 30, h: 81, col: '#c8ccd0', roof: '#8a8e92', style: 'steel' },
      { name: 'Starfactory', lat: 25.9890, lon: -97.1890, w: 300, d: 110, h: 20, col: '#d8dadc', roof: '#b0b3b6', style: 'factory' },
      { name: 'Mid Bay', lat: 25.9862, lon: -97.1850, w: 24, d: 24, h: 50, col: '#c8ccd0', roof: '#8a8e92', style: 'steel' },
    ],
  },
  edwards: {
    buildings: [ // the main base's flightline hangars, and NASA Armstrong's to the north (approximate)
      { name: 'Hangar', lat: 34.9040, lon: -117.8830, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789', style: 'hangar', door: 0 },
      { name: 'Hangar', lat: 34.9052, lon: -117.8810, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789', style: 'hangar', door: 0 },
      { name: 'Hangar', lat: 34.9064, lon: -117.8790, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789', style: 'hangar', door: 0 },
      { name: 'Hangar', lat: 34.9076, lon: -117.8770, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789', style: 'hangar', door: 0 },
      { name: 'NASA Armstrong hangar 4802', lat: 34.9540, lon: -117.8860, w: 100, d: 70, h: 24, col: '#d3cfc2', roof: '#a19d90', style: 'hangar', door: 0 },
      { name: 'NASA Armstrong', lat: 34.9530, lon: -117.8840, w: 60, d: 60, h: 18, col: '#d3cfc2', roof: '#a19d90', style: 'office' },
    ],
  },
};
// The facade of a block, drawn once per building: a canvas of five bands, the roof on top and then the four walls (south,
// east, north, west), each drawn in metres. The styles: 'vab' (the panelled walls, the high-bay doors on the east and west
// faces, the flag on the south), 'office' (rows of windows), 'hangar' (a door across the front), 'steel' (corrugated
// sheet), 'factory' (a long shed with skylights); plain panels otherwise. Grime at the foot of every wall, equipment on
// every roof.
let bldSeed = 3; const bldRnd = () => (bldSeed = (bldSeed * 9301 + 49297) % 233280) / 233280;
function facadeTex(B) {
  const W = 1024, Hb = 256, c = document.createElement('canvas'); c.width = W; c.height = 5 * Hb; const g = c.getContext('2d');
  const wall = new THREE.Color(B.col), roof = new THREE.Color(B.roof || B.col), hex = k => '#' + k.getHexString();
  const shade = (k, f) => hex(k.clone().multiplyScalar(f));
  bldSeed = Math.round((B.lat * 1000 + B.lon * 1000) % 1000) + 3;
  // the roof: its colour, a parapet line, and boxes (air handlers, vents, a hut) scattered over it
  g.fillStyle = hex(roof); g.fillRect(0, 0, W, Hb); g.save(); g.scale(W / B.w, Hb / B.d);
  g.fillStyle = shade(roof, 0.8); for (let k = 0; k < 2 + Math.round(B.w * B.d / 1500); k++) { const w = 2 + bldRnd() * 4, d = 2 + bldRnd() * 4; g.fillRect(1 + bldRnd() * (B.w - 2 - w), 1 + bldRnd() * (B.d - 2 - d), w, d); }
  if (B.style === 'factory') { g.fillStyle = shade(roof, 1.25); for (let x = 4; x < B.w - 4; x += 8) g.fillRect(x, 2, 1.2, B.d - 4); }
  g.restore(); g.strokeStyle = shade(roof, 0.7); g.lineWidth = 3; g.strokeRect(1, 1, W - 2, Hb - 2);
  for (let i = 0; i < 4; i++) {
    const wm = i % 2 ? B.d : B.w, hm = B.h; // the face's width and height in metres
    g.save(); g.translate(0, Hb * (1 + i)); g.scale(W / wm, Hb / hm); // metres, y down from the top of the wall
    g.fillStyle = hex(wall); g.fillRect(0, 0, wm, hm);
    const pw = B.style === 'steel' ? 1.0 : B.style === 'vab' ? 7.0 : 6.0; // the panels
    g.fillStyle = 'rgba(0,0,0,0.10)'; for (let x = pw; x < wm; x += pw) g.fillRect(x, 0, Math.max(0.12, wm / W * 2), hm);
    if (B.style === 'office') { g.fillStyle = '#2d3238'; for (let y = 1.2; y < hm - 2; y += 3.6) for (let x = 1.5; x < wm - 1.5; x += 3.0) g.fillRect(x, y, 1.8, 1.6); } // rows of windows
    if (B.style === 'vab') {
      g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 11; y < hm; y += 11) g.fillRect(0, y, wm, 0.25);
      if (i % 2) for (const f of [0.25, 0.75]) { const x0 = f * wm - 11; g.fillStyle = '#5c5e62'; g.fillRect(x0, hm - 139, 22, 139); g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = hm - 139; y < hm; y += 10) g.fillRect(x0, y, 22, 0.5); g.fillStyle = '#3b3c40'; g.fillRect(x0, hm - 35, 22, 35); } // the high-bay doors (the lower leaves slide, the upper fold)
      if (i === 0) { const fx = 15, fy = 22, fw = 33.5, fh = 64; g.fillStyle = '#b22234'; g.fillRect(fx, fy, fw, fh); g.fillStyle = '#ffffff'; for (let k = 1; k < 13; k += 2) g.fillRect(fx, fy + k * fh / 13, fw, fh / 13); g.fillStyle = '#3c3b6e'; g.fillRect(fx, fy, fw * 0.4, fh * 7 / 13); } // the flag
    }
    if (B.style === 'hangar' && i === (B.door ?? 0)) { g.fillStyle = shade(wall, 0.75); g.fillRect(wm * 0.08, hm * 0.18, wm * 0.84, hm * 0.82); g.fillStyle = 'rgba(0,0,0,0.15)'; for (let x = wm * 0.08; x < wm * 0.92; x += 4) g.fillRect(x, hm * 0.18, 0.2, hm * 0.82); } // the door across the front
    if (B.style === 'factory') { g.fillStyle = '#3a3f45'; for (let x = 6; x < wm - 6; x += 24) g.fillRect(x, hm - 7, 7, 7); } // the bay doors along the shed
    const gr = g.createLinearGradient(0, hm - 3, 0, hm); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.45)'); g.fillStyle = gr; g.fillRect(0, hm - 3, wm, 3); // grime at the foot
    const st = g.createLinearGradient(0, 0, 0, hm); st.addColorStop(0, 'rgba(0,0,0,0)'); st.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = st; g.fillRect(0, 0, wm, hm); // the rain's streaking, darker toward the ground
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function buildBuildings(id, grp, T, md) {
  const F = SITE_FEATURES[id]; if (!F) return;
  const { hAt, toLocal, at, Pc } = grp.userData;
  const put = (geo, m, order = 4) => { const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = order; grp.add(mesh); return mesh; };
  // a block standing on the ground: its corners draped on the sphere, its walls vertical in the local frame; each face
  // mapped to its band of the building's facade (facadeTex)
  const block = (B) => {
    const [cx, cy] = toLocal(B.lat, B.lon), hd = (B.hdg || 0) * DEG, ce = Math.cos(hd), sn = Math.sin(hd);
    const corner = (u, v) => [cx + u * ce + v * sn, cy - u * sn + v * ce]; // u east, v north before the rotation
    const base = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const [x, y] = corner(u * B.w / 2, v * B.d / 2); return hAt(x, y); })) - 0.5;
    const pos = [], idx = [], uv = [];
    const face = (pts, uvs) => { const n0 = pos.length / 3; pts.forEach(([x, y, h], k) => { const p = at(x, y, h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); uv.push(uvs[k][0], uvs[k][1]); }); idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3); };
    const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => corner(u * B.w / 2, v * B.d / 2));
    face(C4.map(([x, y]) => [x, y, base + B.h]), [[0, 0.8], [1, 0.8], [1, 1], [0, 1]]); // the roof: the top band
    for (let i = 0; i < 4; i++) { const a = C4[i], b = C4[(i + 1) % 4], v0 = 1 - (2 + i) / 5, v1 = 1 - (1 + i) / 5; face([[a[0], a[1], base], [b[0], b[1], base], [b[0], b[1], base + B.h], [a[0], a[1], base + B.h]], [[0, v0], [1, v0], [1, v1], [0, v1]]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return put(g, terrainMat({ map: facadeTex(B) }));
  };
  for (const B of F.buildings || []) block(B);
  // the crawlerway: two lanes of grey-brown rock
  const lanes = (route, w, gap, c) => {
    if (!route) return; const P = route.map(([la, lo]) => toLocal(la, lo)), pos = [], idx = []; let n = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], dx = x1 - x0, dy = y1 - y0, ll = Math.hypot(dx, dy) || 1, nx = -dy / ll, ny = dx / ll, seg = Math.max(1, Math.ceil(ll / 120));
      for (const side of [-1, 1]) for (let s = 0; s <= seg; s++) {
        const x = x0 + dx * s / seg, y = y0 + dy * s / seg, h = hAt(x, y) + 0.3, off = side * (gap / 2 + w / 2);
        for (const k of [-1, 1]) { const p = at(x + nx * (off + k * w / 2), y + ny * (off + k * w / 2), h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); }
        if (s) { const a = n - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        n += 2;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    put(g, terrainMat({ color: c, offset: -2 }), 3);
  };
  lanes(F.crawlerway, 12, 15, '#b3aa97'); lanes(F.crawlerwayB, 12, 15, '#b3aa97');
  // the other pads: a mound 13 m high with the hardstand on top (the mission's own pad is the real model, app/46_pads.js)
  for (const P of F.pads || []) {
    if (P.site === md.cfg.site) continue;
    const [cx, cy] = toLocal(P.lat, P.lon), h0 = hAt(cx, cy), pos = [], idx = [], NA = 48, rings = [[0, 12.8], [60, 12.8], [100, 0.5]];
    for (const [r, h] of rings) for (let i = 0; i < NA; i++) { const a = i * TAU / NA; const p = at(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r, h0 + h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); }
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < NA; i++) { const a = k * NA + i, b = k * NA + (i + 1) % NA, c = a + NA, d = b + NA; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    put(g, terrainMat({ color: '#6f7c57' }));
    const top = new THREE.CircleGeometry(1, NA); const tp = top.attributes.position; const arr = new Float32Array(tp.count * 3);
    for (let i = 0; i < tp.count; i++) { const p = at(cx + tp.getX(i) * 66, cy + tp.getY(i) * 60, h0 + 12.85); arr[3 * i] = p[0] - Pc[0]; arr[3 * i + 1] = p[1] - Pc[1]; arr[3 * i + 2] = p[2] - Pc[2]; }
    top.setAttribute('position', new THREE.BufferAttribute(arr, 3)); top.computeVertexNormals(); put(top, terrainMat({ color: '#aeaba3' }));
  }
  // runways not drawn by the Shuttle code: a plain concrete strip with a centreline
  for (const rw of F.runways || []) {
    if (md.cfg.runway === rw.key || (md.cfg.runway && RUNWAYS[md.cfg.runway] && Math.abs(RUNWAYS[md.cfg.runway].lat - rw.lat) < 0.05 && Math.abs(RUNWAYS[md.cfg.runway].lon - rw.lon) < 0.05)) continue;
    const [x0, y0] = toLocal(rw.lat, rw.lon), hd = rw.hdg * DEG, f = [Math.sin(hd), Math.cos(hd)], l = [Math.cos(hd), -Math.sin(hd)], pos = [], idx = [], nL = 48;
    for (let i = 0; i <= nL; i++) { const x = x0 + f[0] * rw.len * i / nL, y = y0 + f[1] * rw.len * i / nL, h = hAt(x, y) + 0.35; for (const j of [-1, 1]) { const p = at(x + l[0] * j * rw.wid / 2, y + l[1] * j * rw.wid / 2, h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); } }
    for (let i = 0; i < nL; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    put(g, terrainMat({ color: '#6d6c69', offset: -2 }), 3);
  }
}
