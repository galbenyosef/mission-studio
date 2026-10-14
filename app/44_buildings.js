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
      { name: 'Vehicle Assembly Building', lat: 28.5859, lon: -80.6512, w: 158, d: 218, h: 160, col: '#d9d7d0', roof: '#9a9893', vab: true },
      { name: 'Launch Control Center', lat: 28.5852, lon: -80.6489, w: 60, d: 115, h: 24, col: '#c9c6bd', roof: '#8d8b86' },
      { name: 'Orbiter Processing Facility 1 and 2', lat: 28.5878, lon: -80.6548, w: 120, d: 60, h: 29, col: '#cfcdc5', roof: '#8d8b86' },
      { name: 'Orbiter Processing Facility 3', lat: 28.5904, lon: -80.6541, w: 70, d: 60, h: 29, col: '#cfcdc5', roof: '#8d8b86' },
      { name: 'Rotation, Processing and Surge Facility', lat: 28.5947, lon: -80.6450, w: 60, d: 110, h: 30, col: '#c9c6bd', roof: '#8d8b86' },
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
      { name: 'High Bay', lat: 25.9880, lon: -97.1855, w: 28, d: 28, h: 81, col: '#c8ccd0', roof: '#8a8e92' },
      { name: 'Mega Bay', lat: 25.9872, lon: -97.1868, w: 30, d: 30, h: 81, col: '#c8ccd0', roof: '#8a8e92' },
      { name: 'Starfactory', lat: 25.9890, lon: -97.1890, w: 300, d: 110, h: 20, col: '#d8dadc', roof: '#b0b3b6' },
      { name: 'Mid Bay', lat: 25.9862, lon: -97.1850, w: 24, d: 24, h: 50, col: '#c8ccd0', roof: '#8a8e92' },
    ],
  },
  edwards: {
    buildings: [ // the main base's flightline hangars, and NASA Armstrong's to the north (approximate)
      { name: 'Hangar', lat: 34.9040, lon: -117.8830, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789' },
      { name: 'Hangar', lat: 34.9052, lon: -117.8810, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789' },
      { name: 'Hangar', lat: 34.9064, lon: -117.8790, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789' },
      { name: 'Hangar', lat: 34.9076, lon: -117.8770, w: 90, d: 60, h: 26, col: '#c9c4b4', roof: '#9b9789' },
      { name: 'NASA Armstrong hangar 4802', lat: 34.9540, lon: -117.8860, w: 100, d: 70, h: 24, col: '#d3cfc2', roof: '#a19d90' },
      { name: 'NASA Armstrong', lat: 34.9530, lon: -117.8840, w: 60, d: 60, h: 18, col: '#d3cfc2', roof: '#a19d90' },
    ],
  },
};
function buildBuildings(id, grp, T, md) {
  const F = SITE_FEATURES[id]; if (!F) return;
  const { hAt, toLocal, at, Pc } = grp.userData;
  const put = (geo, m, order = 4) => { const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = order; grp.add(mesh); return mesh; };
  // a block standing on the ground: its corners draped on the sphere, its walls vertical in the local frame
  const block = (B) => {
    const [cx, cy] = toLocal(B.lat, B.lon), hd = (B.hdg || 0) * DEG, ce = Math.cos(hd), sn = Math.sin(hd);
    const corner = (u, v) => [cx + u * ce + v * sn, cy - u * sn + v * ce]; // u east, v north before the rotation
    const base = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const [x, y] = corner(u * B.w / 2, v * B.d / 2); return hAt(x, y); })) - 0.5;
    const pos = [], idx = [], nrm = [], col = [];
    const wall = new THREE.Color(B.col), roof = new THREE.Color(B.roof || B.col);
    const face = (pts, c) => { const n0 = pos.length / 3; for (const [x, y, h] of pts) { const p = at(x, y, h); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); col.push(c.r, c.g, c.b); } idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3); };
    const C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => corner(u * B.w / 2, v * B.d / 2));
    face(C4.map(([x, y]) => [x, y, base + B.h]), roof);
    for (let i = 0; i < 4; i++) { const a = C4[i], b = C4[(i + 1) % 4]; const shade = 0.78 + 0.22 * ((i + (B.hdg || 0) / 90) % 2); const c = wall.clone().multiplyScalar(shade); face([[a[0], a[1], base], [b[0], b[1], base], [b[0], b[1], base + B.h], [a[0], a[1], base + B.h]], c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return put(g, terrainMat({ vertexColors: true }));
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
