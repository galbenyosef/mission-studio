// ============================================================================
// Space Shuttle models (metres): the orbiter, the launch stack (External Tank, two boosters, the orbiter on the
// tank's belly side), the International Space Station and the Hubble Space Telescope.
// Orbiter axes: +Y nose, +Z top (payload bay side), +X right (starboard) wing. Y = 0 at the aft end of the
// fuselage (the base heat shield), Z = 0 at the payload bay centreline (structural plane Zo 400).
// Dimensions follow the orbiter structure: mid fuselage 18.4 m long, 5.2 m wide; aft fuselage 6.7 m wide and
// 6.1 m high; OMS pods 6.6 m long; wing root chord 18 m; vertical tail 8 m tall, swept 45°.
// The orbiter is drawn with the Smithsonian's 3D scan of Discovery (assets/orbiter.glb, built by tools/models: the body,
// the two payload bay doors and the landing gear apart). The built-in model below stands in while it loads; the landing
// gear, the engine nozzles and the payload bay follow the scan's measurements in both.
// ============================================================================
const SH_COL = { white: '#efede7', black: '#141517', rcc: '#3c3d41', grey: '#a3a8ae', bay: '#d4d7da', rad: '#e6ebf0', gold: '#c8a24a', base: '#2c2e31' };
// Where the tyres touch the ground with the gear down, [Y, Z] (from the scan). The nose wheels touch 1.55 m higher than the
// main wheels, so the orbiter stands 4.4° nose down on its gear.
const SH_MAIN_CONTACT = [8.8, -6.03], SH_NOSE_CONTACT = [29.0, -4.48], SH_MAIN_TRACK = 3.72; // main wheels ±3.72 m out
const SH_GEAR_H = -SH_MAIN_CONTACT[1]; // m: the reference plane (Z = 0) above the main wheels' contact, wings level (the flight planner's gear height)
const SH_STANCE = -Math.atan2(SH_NOSE_CONTACT[1] - SH_MAIN_CONTACT[1], SH_NOSE_CONTACT[0] - SH_MAIN_CONTACT[0]); // rad: the attitude on the ground, −4.4°
// engine nozzle exits (from the scan): [x, exit Y, z]; three RS-25s (2.29 m exits) and the two OMS engines
const SH_SSME = [[0.02, -1.81, 1.96], [-1.56, -2.49, -0.95], [1.58, -2.47, -1.01]], SH_OMSE = [[-2.97, -1.0, 2.28], [2.97, -1.0, 2.28]];
const SH_BAY = [5.6, 23.9]; // payload bay doors, Y range
const SH_HINGE = 24 * DEG; // door hinge on the fuselage section (superellipse angle)
const SH_OMS_X = 2.6; // OMS pod centrelines
const SH_E = 2 / 2.6, SH_EB = 2 / 4.5; // superellipse exponents: rounded-square top, flat belly
function vcMat(extra = {}) { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.03, ...extra }); }
// colour every vertex of a geometry from its position and normal
function paintGeo(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { col.set(fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i))); c[3 * i] = col.r; c[3 * i + 1] = col.g; c[3 * i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
// point on a fuselage section s = [y, zc, a (half width), bTop, bBot] at angle th (0 = starboard side, 90° = top)
function shRing(s, th) {
  const c = Math.cos(th), sn = Math.sin(th);
  const x = s[2] * Math.sign(c) * Math.pow(Math.abs(c), sn >= 0 ? SH_E : SH_EB);
  const z = sn >= 0 ? s[1] + s[3] * Math.pow(Math.abs(sn), SH_E) : s[1] - s[4] * Math.pow(Math.abs(sn), SH_EB);
  return [x, s[0], z];
}
// lofted surface through sections; skip(yMid, thMid) leaves quads out (the payload bay opening)
function loftGeo(st, nSeg, skip) {
  const pos = [], idx = [];
  for (const s of st) for (let k = 0; k <= nSeg; k++) pos.push(...shRing(s, k / nSeg * TAU));
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < nSeg; k++) {
    if (skip && skip(0.5 * (st[i][0] + st[i + 1][0]), (k + 0.5) / nSeg * TAU)) continue;
    const a = i * (nSeg + 1) + k, b = a + 1, c = a + nSeg + 1, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// flat cap closing a section (facing −Y when back = true)
function capGeo(s, nSeg, back) {
  const pos = [0, s[0], s[1]], idx = [];
  for (let k = 0; k <= nSeg; k++) pos.push(...shRing(s, k / nSeg * TAU));
  for (let k = 1; k <= nSeg; k++) back ? idx.push(0, k, k + 1) : idx.push(0, k + 1, k);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const SH_STATIONS = [
  [0.0, 0.35, 3.25, 2.95, 2.95], [2.6, 0.3, 3.1, 2.85, 2.9], [SH_BAY[0], -0.1, 2.62, 2.5, 2.5], [SH_BAY[1], -0.1, 2.62, 2.5, 2.5],
  [25.0, 0.05, 2.56, 2.75, 2.6], [26.8, 0.35, 2.45, 2.95, 2.75], [28.6, 0.2, 2.2, 2.6, 2.45], [30.3, -0.15, 1.75, 1.95, 2.0],
  [31.6, -0.55, 1.15, 1.25, 1.45], [32.35, -0.85, 0.6, 0.62, 0.85], [32.75, -1.0, 0.06, 0.06, 0.08]];
function shuttleFuselage() {
  const bay = (y, th) => y > SH_BAY[0] && y < SH_BAY[1] && th > SH_HINGE && th < Math.PI - SH_HINGE;
  const g = loftGeo(SH_STATIONS, 64, bay);
  paintGeo(g, (x, y, z, nx, ny, nz) => {
    if (y > 25.6 && y < 28.9 && z > 1.95 && Math.abs(x) < 2.0 && (nz > 0.3 || ny > 0.35)) return SH_COL.black; // flight-deck windows and their frame
    if (y > 31.3) return SH_COL.black; // nose cap
    if (nz < -0.3 || (y > 28.5 && nz < 0.1)) return SH_COL.black; // belly tiles, wrapping up around the chin
    return SH_COL.white;
  });
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, vcMat()));
  grp.add(new THREE.Mesh(capGeo(SH_STATIONS[0], 64, true), mat(SH_COL.base, 'dark'))); // base heat shield around the main engines
  return grp;
}
function shuttleWing(side) { // double-delta planform: 81° glove, 45° main wing; dark leading edges, black underside
  const P = [[2.6, 1.0], [11.9, 2.3], [11.95, 4.4], [4.9, 11.4], [3.6, 16.0], [2.6, 19.6]];
  const sh = new THREE.Shape(); P.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 2, steps: 1, curveSegments: 4 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const k = 1 - 0.75 * clamp((x - 2.6) / 9.4, 0, 1); p.setZ(i, z * k); } // thinner toward the tip
  if (side < 0) { for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i)); const ix = g.index; if (ix) for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } else { for (let i = 0; i < p.count; i += 3) for (let k = 0; k < 3; k++) { const t = p.getComponent(i + 1, k); p.setComponent(i + 1, k, p.getComponent(i + 2, k)); p.setComponent(i + 2, k, t); } } }
  g.computeVertexNormals();
  paintGeo(g, (x, y, z, nx, ny, nz) => nz < -0.35 ? SH_COL.black : (nz < 0.45 && (ny > 0.3 || Math.abs(nx) > 0.6) ? SH_COL.rcc : SH_COL.white));
  const m = new THREE.Mesh(g, vcMat()); m.position.z = -2.45; return m;
}
function shuttleFin() { // vertical tail with the split rudder / speed brake
  const sh = new THREE.Shape(); [[5.8, 0], [-1.2, 0], [-5.1, 8.0], [-2.3, 8.0]].forEach(([y, z], i) => i ? sh.lineTo(y, z) : sh.moveTo(y, z)); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 });
  const p = g.attributes.position; // shape (y, z) in the XY plane, extruded along Z: map to model (x = extrusion, y, z)
  for (let i = 0; i < p.count; i++) { const sy = p.getX(i), sz = p.getY(i), ex = p.getZ(i); const k = 1 - 0.55 * clamp(sz / 8, 0, 1); p.setXYZ(i, (ex - 0.25) * k, sy, sz); }
  g.computeVertexNormals();
  paintGeo(g, (x, y, z, nx, ny, nz) => (ny > 0.5 && Math.abs(nx) < 0.7) ? SH_COL.rcc : SH_COL.white);
  const m = new THREE.Mesh(g, vcMat()); m.position.z = 3.05; return m;
}
function shuttleOmsPod(side) { // OMS/RCS pod: 6.6 m long, 2.6 m wide in front, 3.5 m at the aft end
  const g = loftGeo([[-0.75, 0.0, 1.45, 1.05, 1.0], [-0.55, 0.0, 1.6, 1.12, 1.05], [2.4, 0.0, 1.5, 1.12, 1.05], [4.6, -0.05, 1.2, 0.9, 1.0], [5.6, -0.25, 0.8, 0.55, 0.9], [5.95, -0.4, 0.15, 0.12, 0.3]], 32);
  paintGeo(g, (x, y, z, nx, ny, nz) => (nz > 0.15 && y > -0.4 && y < 5.4) ? SH_COL.white : (y <= -0.6 ? SH_COL.base : SH_COL.grey));
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, vcMat()));
  grp.add(new THREE.Mesh(capGeo([-0.75, 0.0, 1.45, 1.05, 1.0], 32, true), mat(SH_COL.base, 'dark'))); // aft end around the OMS engine
  grp.position.set(side * SH_OMS_X, 0, 2.6); return grp;
}
// one payload bay door, built at its hinge so it can swing open (175.5° when fully open); white outside, radiators inside
function shuttleBayDoor(side, open) {
  const s = SH_STATIONS[2], H = shRing(s, SH_HINGE), hx = H[0], hz = H[2], n = 20, ys = [SH_BAY[0], SH_BAY[1]];
  const pos = [];
  for (const y of ys) for (let k = 0; k <= n; k++) { const th = SH_HINGE + (Math.PI / 2 - SH_HINGE) * k / n; const q = shRing(s, th); pos.push(side * (q[0] - hx), y, q[2] - hz); }
  const outer = [], inner = [];
  for (let k = 0; k < n; k++) { const a = k, b = k + 1, c = n + 1 + k, d = c + 1; if (side > 0) { outer.push(a, c, b, b, c, d); inner.push(a, b, c, b, d, c); } else { outer.push(a, b, c, b, d, c); inner.push(a, c, b, b, c, d); } }
  const mk = (ix, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); return new THREE.Mesh(g, m); };
  const grp = new THREE.Group(); grp.add(mk(outer, mat(SH_COL.white, 'paint'))); grp.add(mk(inner, mat(SH_COL.rad, 'metal')));
  grp.position.set(side * hx, 0, hz); if (open) grp.rotation.y = -side * 175.5 * DEG;
  return grp;
}
// The payload bay's geometry: the door hinges (x, z) on the sills, the side walls, the floor and, for the scan, the arch of
// the fuselage's top (an ellipse over the walls) that the end bulkheads fill when the doors are open
const SH_BAY_BUILTIN = (() => { const H = shRing(SH_STATIONS[2], SH_HINGE); return { hx: H[0], hz: H[2], wall: H[0] - 0.12, floor: -2.25 }; })();
const SH_BAY_SCAN = { hx: 2.70, hz: 0.60, wall: 2.47, floor: -2.30, arch: [0.95, 1.40] }; // the scan's skin is 2.67–2.72 m out; arch: centre z, height
function shuttleBayInterior(B = SH_BAY_BUILTIN) {
  const g = new THREE.Group(), m = mat(SH_COL.bay, 'paint', { side: THREE.DoubleSide }), L = SH_BAY[1] - SH_BAY[0], yc = (SH_BAY[0] + SH_BAY[1]) / 2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * B.wall + 0.1, L, 0.1), m); floor.position.set(0, yc, B.floor); g.add(floor);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, L, B.hz - B.floor), m); wall.position.set(s * B.wall, yc, (B.hz + B.floor) / 2); g.add(wall);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.2, L, 0.16), mat('#b8bdc2', 'metal')); sill.position.set(s * (B.wall + 0.05), yc, B.hz - 0.04); g.add(sill); // the sill longeron, inside the skin
  }
  const bulk = (y, col, kind) => {
    let geo;
    if (B.arch) { // the walls, then the arch of the fuselage's top
      const [zc, b] = B.arch, sh = new THREE.Shape(); sh.moveTo(-B.wall, B.floor); sh.lineTo(B.wall, B.floor); sh.lineTo(B.wall, zc);
      for (let k = 1; k <= 24; k++) { const t = k / 24 * Math.PI; sh.lineTo(B.wall * Math.cos(t), zc + b * Math.sin(t)); } sh.lineTo(-B.wall, B.floor);
      geo = new THREE.ShapeGeometry(sh); geo.rotateX(Math.PI / 2);
    } else { const st = SH_STATIONS[2]; geo = capGeo([0, st[1], st[2] * 0.985, st[3] * 0.985, st[4] * 0.985], 48, false); }
    const b = new THREE.Mesh(geo, mat(col, kind, { side: THREE.DoubleSide })); b.position.y = y; g.add(b);
  };
  bulk(SH_BAY[0] + 0.06, SH_COL.gold, 'gold'); bulk(SH_BAY[1] - 0.06, '#dfe2e5', 'paint');
  return g;
}
function shuttleMainEngines() { // three RS-25s in a triangle, nozzles pointing aft (−Y), throats just inside the base
  const g = new THREE.Group();
  for (const [x, ey, z] of SH_SSME) { const len = 0.3 - ey, b = bell(len, 1.145, mat('#4d5055', 'metal', { side: THREE.DoubleSide })); b.position.set(x, ey, z); g.add(b); }
  return g;
}
function shuttleGear(down) { // two-wheel main gears (1.13 m tyres) and the nose gear (0.81 m), tyres touching at the scan's contact points
  const g = new THREE.Group(); if (!down) return g;
  const strutM = mat('#b9bec4', 'metal'), tyre = mat('#1a1a1a', 'dark');
  const wheel = (r, w) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22), tyre); c.rotation.z = Math.PI / 2; return c; };
  const strut = (x, y, z0, z1, r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z0 - z1, 10), strutM); c.rotation.x = Math.PI / 2; c.position.set(x, y, (z0 + z1) / 2); return c; };
  const [ym, zm] = SH_MAIN_CONTACT, [yn, zn] = SH_NOSE_CONTACT, rw = 0.565, rn = 0.405;
  for (const s of [-1, 1]) {
    const x = s * SH_MAIN_TRACK; g.add(strut(x, ym, -3.5, zm + rw, 0.17));
    for (const dx of [-0.4, 0.4]) { const w = wheel(rw, 0.4); w.position.set(x + dx, ym, zm + rw); g.add(w); }
  }
  g.add(strut(0, yn, -3.1, zn + rn, 0.13));
  for (const dx of [-0.26, 0.26]) { const w = wheel(rn, 0.3); w.position.set(dx, yn, zn + rn); g.add(w); }
  return g;
}
// The scan's wheel wells with their doors closed: plates on the belly's tiles (the scan has the doors open, hanging beside
// the gear). Corners [x, y, z]: the main wells under the wing roots and the nose well.
function shuttleWellCovers() {
  const g = new THREE.Group(), m = mat('#17181a', 'tile', { side: THREE.DoubleSide });
  const quad = c => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(c.flat(), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); return new THREE.Mesh(geo, m); };
  for (const s of [-1, 1]) g.add(quad([[s * 2.42, 7.8, -3.57], [s * 4.68, 7.8, -3.33], [s * 4.68, 12.6, -3.11], [s * 2.42, 12.6, -3.44]]));
  g.add(quad([[-0.82, 28.2, -3.2], [0.82, 28.2, -3.2], [0.82, 31.3, -3.18], [-0.82, 31.3, -3.18]]));
  return g;
}
function shuttleChute() { // 40-ft (12 m) ring-sail drag chute trailing behind the tail on a long riser
  const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.SphereGeometry(6.1, 24, 8, 0, TAU, 0, Math.PI / 2.3), patternMat('chute', '#e0662c'));
  c.rotation.x = Math.PI; c.position.set(0, -40, 3.2); g.add(c); // crown trailing aft, mouth facing the orbiter
  const yM = -40 - 6.1 * Math.cos(Math.PI / 2.3), rM = 6.1 * Math.sin(Math.PI / 2.3);
  const pts = []; for (let k = 0; k < 16; k++) { const a = k * TAU / 16; pts.push(new THREE.Vector3(Math.cos(a) * rM, yM, 3.2 + Math.sin(a) * rM), new THREE.Vector3(0, -13.0, 2.6)); }
  pts.push(new THREE.Vector3(0, -13.0, 2.6), new THREE.Vector3(0, -1.6, 2.9));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.85 })));
  return g;
}
// robot arm (Canadarm) on the port sill: shoulder near the front of the bay; two booms reaching a wrist point
function shuttleRMS(pose, B = SH_BAY_BUILTIN) {
  const g = new THREE.Group(), m = mat('#ecebe5', 'paint'), jm = mat('#9aa0a6', 'metal');
  const S = new THREE.Vector3(-B.wall + 0.22, 22.9, B.hz + 0.25); // on the port sill, under the closed door
  const W = pose === 'raised' ? new THREE.Vector3(0.4, 14.5, 11.6) : pose === 'grapple' ? new THREE.Vector3(0, 11.3, 3.0) : new THREE.Vector3(S.x, 8.9, S.z);
  const l1 = 6.37, l2 = 7.06, d = Math.min(S.distanceTo(W), l1 + l2 - 0.01);
  const u = W.clone().sub(S).normalize();
  let E;
  if (pose === 'stowed' || !pose) E = S.clone().add(u.clone().multiplyScalar(l1));
  else { const up = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3().crossVectors(u, up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const perp = new THREE.Vector3().crossVectors(side, u).normalize(); if (perp.z < 0) perp.negate();
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)); E = S.clone().add(u.clone().multiplyScalar(l1 * Math.cos(a))).add(perp.multiplyScalar(l1 * Math.sin(a))); }
  const seg = (A, B, r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), m); c.scale.y = A.distanceTo(B); c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return c; };
  g.add(seg(S, E, 0.19)); g.add(seg(E, W, 0.17));
  for (const P of [S, E, W]) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), jm); j.position.copy(P); g.add(j); }
  g.userData.wrist = W; return g;
}
// Hubble Space Telescope: +Y toward the aperture; origin at the middle of the 13.2 m body
function hubbleModel(flags = {}) {
  const g = new THREE.Group(), foil = mat('#d9dbdd', 'metal'), dark = mat('#2a2b2e', 'dark');
  const tube = cyl(2.1, 2.1, 7.45, foil, 32); tube.position.y = -0.6; g.add(tube); // light shield + forward shell
  const ap = new THREE.Mesh(new THREE.CircleGeometry(2.02, 32), dark); ap.rotation.x = -Math.PI / 2; ap.position.y = 6.86; g.add(ap); // the dark aperture
  const aft = cyl(2.15, 2.15, 5.6, mat('#c5c8cb', 'metal'), 32); aft.position.y = -6.2; g.add(aft); // equipment section
  const ring = cyl(2.17, 2.17, 0.35, mat('#9da2a7', 'metal'), 32); ring.position.y = -0.8; g.add(ring);
  const lip = cyl(2.13, 2.13, 0.2, mat('#3a3c40', 'metal', { side: THREE.DoubleSide }), 32, true); lip.position.y = 6.82; g.add(lip);
  const dg = new THREE.Group(); dg.position.set(0, 7.0, 2.1); const door = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.12, 32), mat('#e9ebed', 'metal')); door.position.set(0, 0, -2.1); dg.add(door); if (flags.door) dg.rotation.x = -105 * DEG; g.add(dg);
  if (flags.arrays) for (const s of [-1, 1]) { const w = solarWing(12.1, 2.45, 6, '#2a3a64'); w.position.set(s * 2.3, -2.2, 0); if (s < 0) w.rotation.y = Math.PI; w.rotation.x = Math.PI / 2; g.add(w); }
  else for (const s of [-1, 1]) { const r = cyl(0.28, 0.28, 4.6, mat('#3b4a6b', 'paint'), 12); r.position.set(s * 2.45, -4.6, 0); g.add(r); }
  if (flags.arrays) for (const s of [-1, 1]) { const b = cyl(0.05, 0.05, 4.0, mat('#9aa0a6', 'metal'), 6); b.rotation.x = Math.PI / 2; b.position.set(0, -1.6, s * 2.05); b.position.z = s * 4.05; const d2 = dish(0.65); d2.position.set(0, -1.6, s * 6.1); d2.rotation.x = s > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(b); g.add(d2); }
  const fix = cyl(0.25, 0.25, 0.5, mat('#e0e0e0', 'metal'), 10); fix.rotation.x = Math.PI / 2; fix.position.set(0, -3.0, 2.3); g.add(fix); // grapple fixture
  g.userData.len = 13.2; g.userData.yc0 = 0; return g;
}
function shuttlePayload(kind, flags = {}, B = SH_BAY_BUILTIN) {
  const g = new THREE.Group();
  if (kind === 'dfi') { const p = box(3.6, 3.0, 1.6, mat('#c9c6bd', 'metal')); p.position.set(0, 8.4, -2.2); g.add(p); const t = cyl(0.5, 0.5, 1.6, mat('#d8d4c8', 'paint')); t.rotation.x = Math.PI / 2; t.position.set(1.1, 12.2, -1.4); g.add(t); }
  if (kind === 'hst') { const h = hubbleModel({ arrays: false }); h.position.set(0, 14.3, -0.05); g.add(h); }
  if (kind === 'mplm') { const c = cyl(2.25, 2.25, 6.4, mat('#e7e5df', 'paint'), 32); c.position.set(0, 8.2, -0.05); g.add(c);
    const cap = cyl(2.25, 1.1, 0.9, mat('#d5d3cc', 'paint'), 32); cap.position.set(0, 14.6, -0.05); g.add(cap); const cap2 = cyl(1.1, 2.25, 0.6, mat('#d5d3cc', 'paint'), 32); cap2.position.set(0, 7.6, -0.05); g.add(cap2); }
  if (flags.ods) { // orbiter docking system: external airlock with the docking mechanism on top, at the front of the bay
    const al = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.9, 24), mat('#e9e7e1', 'paint')); al.rotation.x = Math.PI / 2; al.position.set(0, 21.5, -0.65); g.add(al);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.8, 24), mat('#a6abb1', 'metal')); ring.rotation.x = Math.PI / 2; ring.position.set(0, 21.5, 1.2); g.add(ring);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.4, 0.2), mat('#c4c8cc', 'metal')); tr.position.set(0, 21.5, 0.75); g.add(tr); }
  if (flags.obss) { const b = cyl(0.2, 0.2, 15.2, mat('#d8d6cf', 'paint'), 10); b.position.set(B.wall - 0.22, 6.9, B.hz + 0.25); g.add(b); } // the boom on the starboard sill
  return g;
}
// The orbiter: the scan's body, doors (swung open 175.5° in orbit) and landing gear, with the payload bay's lining, the robot
// arm and the payloads; the built-in model until the scan arrives (or if it cannot be loaded).
function buildOrbiter(flags = {}) {
  const fb = orbiterBuiltIn(flags), open = flags.bay === 'open';
  const g = detailPart('orbiter', 'body', fb, { extra: d => {
    const P = DETAIL.ready.orbiter;
    for (const [k, side] of [['doorL', -1], ['doorR', 1]]) if (P[k]) { const n = P[k].clone(); if (open) n.rotation.y = -side * 175.5 * DEG; d.add(n); }
    if (flags.gear && P.gear) d.add(P.gear.clone()); else if (!flags.gear) d.add(shuttleWellCovers());
    orbiterFittings(d, flags, SH_BAY_SCAN);
  } });
  return g;
}
function orbiterBuiltIn(flags) {
  const g = new THREE.Group(), open = flags.bay === 'open';
  g.add(shuttleFuselage());
  g.add(shuttleWing(1)); g.add(shuttleWing(-1)); g.add(shuttleFin()); g.add(shuttleOmsPod(1)); g.add(shuttleOmsPod(-1));
  g.add(shuttleBayDoor(1, open)); g.add(shuttleBayDoor(-1, open));
  const flap = new THREE.Mesh(new THREE.BoxGeometry(6.3, 2.6, 0.42), vcMat()); paintGeo(flap.geometry, (x, y, z, nx, ny, nz) => nz > 0.5 ? SH_COL.white : SH_COL.black); flap.position.set(0, -1.3, -2.38); g.add(flap); // body flap
  g.add(shuttleMainEngines());
  for (const [x, ey, z] of SH_OMSE) { const b = bell(1.45, 0.58, mat('#5a5d62', 'metal', { side: THREE.DoubleSide })); b.position.set(x, ey, z); g.add(b); }
  g.add(shuttleGear(!!flags.gear));
  orbiterFittings(g, flags, SH_BAY_BUILTIN);
  // mounts: three main engines (used by the launch stack) and the two OMS engines; plumes along −Y
  const mounts = SH_SSME.map(([x, y, z]) => ({ y, x, z, r: 1.145, tag: 'ssme' })).concat(SH_OMSE.map(([x, y, z]) => ({ y, x, z, r: 0.58, tag: 'OMS' })));
  g.userData = { len: 32.75, mounts, nose: true, yc0: 14.7, capsuleR: 5 };
  return g;
}
// what goes in and on the payload bay, for a bay of geometry B: lining, payloads, the robot arm (and Hubble on it), drag chute
function orbiterFittings(g, flags, B) {
  g.add(shuttleBayInterior(B));
  if (flags.pay) g.add(shuttlePayload(flags.pay, {}, B));
  if (flags.orbiter === 'OV-104' || flags.pay === 'mplm' || flags.ods) g.add(shuttlePayload(null, { ods: true, obss: true }, B));
  const arm = shuttleRMS(flags.rms || 'stowed', B); g.add(arm);
  if (flags.payArm) { const h = hubbleModel({ arrays: !!flags.payArrays }); h.rotation.x = Math.PI / 2; h.position.copy(arm.userData.wrist).add(new THREE.Vector3(0, 1.8, 3.0)); g.add(h); } // held upright, aperture away from the bay
  if (flags.dragChute) g.add(shuttleChute());
}
// the stack on the pad and during ascent: tank in the middle, boosters on its sides (±X), orbiter on −Z
const SH_STACK = { orbY: -1.0, orbZ: -8.55 }; // orbiter reference plane 336.5 in from the tank's
function buildShuttleStack(L, c) {
  const g = new THREE.Group(), mounts = [], ET = L.stages[1], SRB = L.stages[0];
  const white = c.variant === 'sts1';
  const etStage = buildStage(white ? { ...ET, geom: ET.geom.map(p => [p[0], p[1], p[2], p[3] === '#4a4a4a' ? p[3] : '#e9e7e0', p[4]]) } : ET);
  g.add(etStage.group);
  for (const s of [-1, 1]) { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.0, 8), mat('#9aa0a6', 'metal')); bp.rotation.x = Math.PI / 2; bp.rotation.y = s * 0.35; bp.position.set(s * 0.35, SH_STACK.orbY + 28.6, -5.1); g.add(bp); } // forward bipod
  if (c.boosters) for (const s of [-1, 1]) {
    const b = buildStage(SRB); b.group.position.set(s * SRB.booster.offset, SRB.booster.y0, 0); g.add(b.group);
    mounts.push({ y: SRB.booster.y0 - SRB.eng.len, x: s * SRB.booster.offset, z: 0, r: 1.5, tag: 'stage:SRB', prop: 'solid', idx: 0 });
  }
  const orb = buildOrbiter({ bay: 'closed', gear: false, orbiter: c.orbiter }); orb.rotation.y = Math.PI; orb.position.set(0, SH_STACK.orbY, SH_STACK.orbZ); g.add(orb);
  for (const m of orb.userData.mounts.filter(m => m.tag === 'ssme')) mounts.push({ y: SH_STACK.orbY + m.y, x: -m.x, z: SH_STACK.orbZ - m.z, r: m.r, tag: 'stage:ET', prop: 'hydrolox', idx: 1 });
  g.userData = { len: 46.9, mounts };
  return g;
}
// International Space Station (July 2011, simplified). Axes: +Y forward (direction of flight), +Z zenith, X along the
// main truss (+X starboard). Origin near the centre of mass; the docking port (PMA-2 on Harmony) faces +Y.
const ISS_DOCK = [0, 21.5, 0]; // m, PMA-2 docking interface
function issModel(flags = {}) {
  const g = new THREE.Group(), white = mat('#e9e8e3', 'paint'), metal = mat('#b8bcc1', 'metal'), arr = mat('#a77a3a', 'solar'), rad = mat('#f2f2ee', 'paint', { side: THREE.DoubleSide });
  const yT = 7.3; // the integrated truss sits on top of the Destiny laboratory
  const T = new THREE.Mesh(new THREE.BoxGeometry(109, 3.6, 3.6), metal); T.position.set(0, yT, 5.6); g.add(T);
  for (const s of [-1, 1]) for (const x0 of [33, 46]) for (const dz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.08, 34), arr); w.position.set(s * x0, yT, 5.6 + dz * 19.5); g.add(w); // solar array wings (each pair 73 m tip to tip)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 34, 6), metal); mast.rotation.x = Math.PI / 2; mast.position.set(s * x0, yT - 0.2, 5.6 + dz * 19.5); g.add(mast);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 13), rad); r.position.set(s * (14 + k * 3.4), yT, 5.6 - 8.5); g.add(r); } // radiators
  const mod = (r, len, y, x = 0, z = 0, rx = 0, rz = 0, m = white) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), m); c.position.set(x, y, z); c.rotation.set(rx, 0, rz); g.add(c); return c; };
  mod(2.2, 7.2, 15.1); // Harmony
  mod(1.1, 2.8, 20.1, 0, 0, 0, 0, metal); // PMA-2
  mod(2.2, 8.5, 7.3); // Destiny
  mod(2.2, 5.5, 0.6); // Unity
  mod(2.05, 12.6, -8.6); // Zarya
  mod(2.1, 13.1, -21.5); // Zvezda
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 3.2), mat('#1d2a4a', 'solar')); w.position.set(s * 7.4, -24.5, 0); g.add(w); }
  mod(2.25, 6.9, 15.1, 5.6, 0, 0, Math.PI / 2); // Columbus (starboard)
  mod(2.2, 11.2, 15.1, -7.8, 0, 0, Math.PI / 2); // Kibo (port)
  mod(2.2, 6.7, 0.6, -5.6, 0, 0, Math.PI / 2); // Tranquility
  if (flags.mplm) mod(2.25, 6.6, 15.1, 0, -2.2 - 3.3, Math.PI / 2, 0); // the logistics module on Harmony's nadir port
  g.userData.len = 60; g.userData.yc0 = 0; return g;
}
