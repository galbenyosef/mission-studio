// ============================================================================
// Tianwen-1 (2020–21), metres: the orbiter, which carried the entry capsule to Mars on its top; the capsule, heat shield
// and backshell; inside it the landing platform with the Zhurong rover on its deck.
// Published: the orbiter is an outer hexagonal prism round a central load-bearing cone, with a 3000 N main engine; the
// capsule's heat shield is a blunt 70° sphere-cone 3.4 m across, and a trim wing on the backshell swings out before the
// parachute opens; the platform comes down on a 7500 N throttleable engine and lets the rover down a two-rail ramp;
// Zhurong is 1.85 m tall and about 2.6 × 3.0 m with its four solar wings open, 240 kg, on six wheels with an active
// suspension, with two round windows on its deck over its heat-storing tanks. The rest (the orbiter's size, its wings and
// antenna, the backshell's shape, the platform's) is estimated and made to fit: the platform and the folded rover inside
// the capsule, the capsule on the orbiter, the whole in Long March 5's fairing.
// ============================================================================
const TW = { mats: {} };
const twMat = (key, make) => TW.mats[key] || (TW.mats[key] = make());
// a canvas texture for flat parts (upright on a PlaneGeometry)
function twTex(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
// the national flag of China (3:2): the large star, and four small ones each pointing at the large one's centre
function cnFlagMat() {
  return twMat('flag', () => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide, map: twTex(300, 200, (g, W) => {
    const u = W / 30; g.fillStyle = '#de2910'; g.fillRect(0, 0, W, W);
    const star = (cx, cy, R, rot) => { g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.382 : R, a = rot + i * Math.PI / 5; g.lineTo((cx + r * Math.sin(a)) * u, (cy - r * Math.cos(a)) * u); } g.closePath(); g.fill(); };
    g.fillStyle = '#ffde00'; star(5, 5, 3, 0);
    for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) star(x, y, 1, Math.atan2(5 - x, y - 5));
  }) }));
}
// solar cells: nx × ny cells on a panel, dark blue with a little variety, on the light substrate
function twCellsMat(nx, ny) {
  return twMat('cells' + nx + 'x' + ny, () => {
    let s = 3 + nx * 7 + ny; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const map = twTex(nx * 20, ny * 20, (g, W, H) => { g.fillStyle = '#5c6268'; g.fillRect(0, 0, W, H); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const v = 30 + rnd() * 10; g.fillStyle = `rgb(${v},${v + 12},${v + 62})`; g.fillRect(i * 20 + 1, j * 20 + 1, 18, 18); g.fillStyle = 'rgba(190,200,220,0.18)'; g.fillRect(i * 20 + 1, j * 20 + 9.5, 18, 1); } });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.3 });
  });
}
// a solar panel along +X from x = 0 (length L), W across (along Y), its cells facing +Z, a light frame round it
function twPanel(L, W, nx, ny, back = '#8d9399') {
  const g = new THREE.Group(), t = 0.025, fr = mat('#c5c9ce', 'metal');
  const f = new THREE.Mesh(new THREE.PlaneGeometry(L, W), twCellsMat(nx, ny)); f.position.set(L / 2, 0, t / 2); g.add(f);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(L, W), mat(back, 'metal')); b.rotation.y = Math.PI; b.position.set(L / 2, 0, -t / 2); g.add(b);
  for (const y of [-W / 2, W / 2]) { const e = new THREE.Mesh(new THREE.BoxGeometry(L, 0.03, t + 0.006), fr); e.position.set(L / 2, y, 0); g.add(e); }
  for (const x of [0, L]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.03, W, t + 0.006), fr); e.position.set(x, 0, 0); g.add(e); }
  return g;
}
// the side faces of a regular n-sided prism (circumradius R, from y0 to y1), each a plane of its own: face k faces azimuth
// a0 + k·360°/n (from +Z toward +X), its material m(k)
function twPrismSides(n, R, y0, y1, a0, m) {
  const g = new THREE.Group(), rf = R * Math.cos(Math.PI / n), w = 2 * R * Math.sin(Math.PI / n);
  for (let k = 0; k < n; k++) { const a = a0 + k * TAU / n, p = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), m(k)); p.position.set(Math.sin(a) * rf, (y0 + y1) / 2, Math.cos(a) * rf); p.rotation.y = a; g.add(p); }
  return g;
}
// the matching n-gon deck (circumradius R) at height y, facing up (or down), with a round hole of radius rh
function twDeck(n, R, y, a0, m, rh = 0, down = false) {
  const s = new THREE.Shape();
  for (let k = 0; k <= n; k++) { const a = a0 + (k + 0.5) * TAU / n; s[k ? 'lineTo' : 'moveTo'](Math.sin(a) * R, -Math.cos(a) * R); }
  if (rh > 0) { const h = new THREE.Path(); h.absarc(0, 0, rh, 0, TAU, true); s.holes.push(h); }
  const d = new THREE.Mesh(new THREE.ShapeGeometry(s, 4), m); d.rotation.x = -Math.PI / 2; d.position.y = y;
  if (down) { d.rotation.x = Math.PI / 2; d.scale.y = -1; }
  return d;
}
// a stretchable round bar (twSetBar puts it between two points); a paraboloid dish (radius r, depth d, vertex at the
// origin, opening toward +Y)
const _twA = new THREE.Vector3(), _twB = new THREE.Vector3();
function twBarMesh(r, m, seg = 8) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), m); }
function twSetBar(o, p, q) { _twA.set(p[0], p[1], p[2]); _twB.set(q[0], q[1], q[2]).sub(_twA); const L = _twB.length(); o.position.copy(_twA).addScaledVector(_twB, 0.5); o.scale.set(1, Math.max(L, 1e-4), 1); o.quaternion.setFromUnitVectors(M20_UP, _twB.normalize()); return o; }
function twDish(r, d, m, seg = 40) { const pts = []; for (let i = 0; i <= 12; i++) { const x = r * i / 12; pts.push(new THREE.Vector2(x, d * (x / r) ** 2)); } return new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m); }
const twLerp = (a, b, f) => a + (b - a) * f;
const twPhase = (f, a, b) => smoothstep(clamp((f - a) / (b - a), 0, 1)); // a stage of a deployment: 0 → 1 while f goes from a to b

// ---------------------------------------------------------------------------------------------------------------------
// The orbiter (y = 0 at the foot of its body): the hexagonal body, 2.8 m across its corners and 2.2 m tall, in gold
// blankets with white radiators on two faces and the national flag on one; on top the central cone's ring, where the
// capsule sits; under it the main engine inside the launch adapter's ring and thrusters at the corners; a solar wing of
// three panels on each of the ±X faces; the 2.5 m high-gain antenna on a boom at the +Z corner; the high-resolution camera
// on a back face; the magnetometer on a boom. Stowed (flags.stowed), the wings fold against their faces, the antenna lies
// against its corner and the boom along its face; from flags.deployT (the separation from the rocket) they open out.
const TWO = { R: 1.4, H: 2.2, ring: 0.65, eng: 0.65 };
function twOrbiter(flags = {}) {
  const g = new THREE.Group(), { R, H } = TWO, rf = R * Math.cos(Math.PI / 6);
  const gold = foilMat('gold', 2), white = mat('#e8e8e3', 'paint'), alu = mat('#b9bec4', 'metal'), dark = mat('#2c2e33', 'dark'), grey = mat('#8c9197', 'metal');
  const face = (k, y = H / 2, out = 0) => { const a = (30 + 60 * k) * DEG; return { a, p: [Math.sin(a) * (rf + out), y, Math.cos(a) * (rf + out)] }; };
  g.add(twPrismSides(6, R, 0, H, 30 * DEG, () => gold));
  g.add(twDeck(6, R, H, 30 * DEG, mat('#d3d6da', 'metal', { side: THREE.DoubleSide }), TWO.ring));
  g.add(twDeck(6, R, 0, 30 * DEG, mat('#5d6066', 'metal', { side: THREE.DoubleSide }), 0.6, true));
  // radiators (white, inside a gold border) on the faces at 30° and 150°; the flag at the top of the 30° face
  for (const k of [0, 2]) { const { a, p } = face(k, H / 2 - 0.1, 0.004); const r = new THREE.Mesh(new THREE.PlaneGeometry(R - 0.22, H - 0.75), white); r.position.set(...p); r.rotation.y = a; g.add(r); }
  { const { a, p } = face(0, H - 0.28, 0.006); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.36), cnFlagMat()); f.position.set(...p); f.rotation.y = a; g.add(f); }
  // the central cone: its ring on the deck, the cone going down inside
  const ring = cyl(TWO.ring + 0.05, TWO.ring, 0.06, alu, 40); ring.position.y = H; g.add(ring);
  const cone = cyl(0.55, TWO.ring, 0.9, mat('#55585e', 'metal', { side: THREE.DoubleSide }), 40, true); cone.position.y = H - 0.9; g.add(cone);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.56, 32), dark); floor.rotation.x = -Math.PI / 2; floor.position.y = H - 0.88; g.add(floor);
  for (let k = 0; k < 6; k++) { const b = box(0.1, 0.07, 0.12, mat('#c9a04a', 'gold')); b.position.set(...m20Polar(TWO.ring + 0.02, k * TAU / 6, H + 0.06)); b.rotation.y = k * TAU / 6; g.add(b); } // the separation fittings
  // the launch adapter's ring and the main engine inside it; thruster pairs at the six lower corners
  const lv = cyl(0.62, 0.6, 0.12, alu, 40, true); lv.position.y = -0.12; g.add(lv);
  const valve = cyl(0.13, 0.13, 0.16, grey, 16); valve.position.y = -0.16; g.add(valve);
  const eng = bell(TWO.eng, 0.22, mat('#3c3e42', 'metal', { side: THREE.DoubleSide })); eng.position.y = -TWO.eng; g.add(eng);
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6, pod = new THREE.Group(); pod.position.set(...m20Polar(R - 0.12, a, 0.04)); pod.rotation.y = a; g.add(pod);
    pod.add(box(0.16, 0.08, 0.12, grey));
    for (const s of [-1, 1]) { const n = bell(0.1, 0.035, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); const e = new THREE.Group(); e.position.set(s * 0.05, 0, 0.03); e.rotation.x = 0.5; e.add(n); n.position.y = -0.1; pod.add(e); }
  }
  // star trackers and low-gain antennas on the deck
  for (const [a, r] of [[200, 1.0], [235, 1.0]]) { const st = box(0.14, 0.12, 0.14, dark); st.position.set(...m20Polar(r, a * DEG, H)); g.add(st); const sh = cyl(0.05, 0.08, 0.1, mat('#1c1d20', 'dark', { side: THREE.DoubleSide }), 14, true); sh.position.set(...m20Polar(r, a * DEG, H + 0.12)); g.add(sh); }
  for (const [a, y] of [[120, H], [300, H]]) { const l = cyl(0.07, 0.03, 0.16, mat('#e9e7e1', 'paint'), 14); l.position.set(...m20Polar(1.05, a * DEG, y)); g.add(l); }
  // the high-resolution camera on the 150° face, looking down; the medium-resolution camera beside it
  { const { a, p } = face(2, 0.75, 0.3); const c = cyl(0.24, 0.24, 0.8, mat('#e4e3de', 'paint'), 24); c.position.set(p[0], 0.35, p[2]); g.add(c); const hood = cyl(0.25, 0.25, 0.22, mat('#1e1f22', 'dark', { side: THREE.DoubleSide }), 24, true); hood.position.set(p[0], 0.13, p[2]); g.add(hood);
    const br = box(0.3, 0.5, 0.12, grey); br.position.set(Math.sin(a) * (rf + 0.06), 0.5, Math.cos(a) * (rf + 0.06)); br.rotation.y = a; g.add(br);
    const m = box(0.16, 0.18, 0.16, dark); m.position.set(...face(2, 0, 0.12).p); m.position.y = 1.3; g.add(m); }
  // the solar wings: a yoke and three panels (1.3 × 2.0 m) on hinges, folded like an accordion against the face when stowed
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(s * rf, H / 2, 0); if (s < 0) w.rotation.z = Math.PI; g.add(w);
    const yoke = [twBarMesh(0.022, alu), twBarMesh(0.022, alu)]; w.add(...yoke);
    const root = box(0.12, 0.3, 0.12, grey); root.position.set(0.04, -0.15, 0); w.add(root);
    const h0 = new THREE.Group(); w.add(h0); const hs = [h0];
    let par = h0; for (let i = 0; i < 3; i++) { par.add(twPanel(1.3, 2.0, 6, 9)); if (i < 2) { const h = new THREE.Group(); h.position.set(1.3, 0, i ? -0.035 : 0.035); par.add(h); hs.push(h); par = h; } }
    wings.push({ yoke, hs });
  }
  // the high-gain antenna: a dish 2.5 m across with its subreflector, on a boom from the +Z corner
  const hga = new THREE.Group(); g.add(hga);
  const dish = twDish(1.25, 0.28, mat('#efeee9', 'paint', { side: THREE.DoubleSide }), 48); dish.rotation.x = Math.PI / 2; hga.add(dish);
  const hub = cyl(0.12, 0.12, 0.2, grey, 16); hub.rotation.x = Math.PI / 2; hub.position.z = -0.12; hga.add(hub);
  const sub = cyl(0.12, 0.12, 0.03, mat('#d9d8d2', 'paint'), 20); sub.rotation.x = Math.PI / 2; sub.position.z = 0.55; hga.add(sub);
  for (let k = 0; k < 4; k++) hga.add(m20Bar([Math.sin(k * TAU / 4 + 0.785) * 0.85, Math.cos(k * TAU / 4 + 0.785) * 0.85, 0.15], [Math.sin(k * TAU / 4 + 0.785) * 0.1, Math.cos(k * TAU / 4 + 0.785) * 0.1, 0.54], 0.012, alu));
  const feed = cyl(0.06, 0.04, 0.3, grey, 12); feed.rotation.x = Math.PI / 2; feed.position.z = 0.02; hga.add(feed);
  const boom = twBarMesh(0.05, alu, 12); g.add(boom);
  // the magnetometer's boom on the 210° face
  const mag = new THREE.Group(); mag.rotation.order = 'YXZ'; { const { a, p } = face(3, H - 0.15, 0.08); mag.position.set(...p); mag.rotation.y = a; g.add(mag); }
  { const b = cyl(0.025, 0.025, 2.2, alu, 8); mag.add(b); const sn = box(0.12, 0.1, 0.12, mat('#d7d6d0', 'paint')); sn.position.y = 2.2; mag.add(sn); const sn2 = box(0.08, 0.08, 0.08, mat('#c9a04a', 'gold')); sn2.position.y = 1.4; mag.add(sn2); }
  // stowed (f = 0) → deployed (1): the wings open first, then the antenna swings out, then the magnetometer's boom
  const pose = f => {
    const fw = twPhase(f, 0, 0.5), fa = twPhase(f, 0.45, 0.8), fm = twPhase(f, 0.75, 1);
    for (const { yoke, hs } of wings) {
      const fu = twPhase(fw, 0, 0.35), fo = twPhase(fw, 0.25, 1); // the stack swings off the face, then unfolds
      hs[0].position.set(twLerp(0.14, 0.4, fu), 0, twLerp(0.65, 0, fu));
      hs[0].rotation.y = twLerp(Math.PI / 2, 0, fo); hs[1].rotation.y = twLerp(-Math.PI, 0, fo); hs[2].rotation.y = twLerp(Math.PI, 0, fo);
      const t0 = hs[0].position; twSetBar(yoke[0], [0, 0.55, 0], [t0.x, 0.25, t0.z]); twSetBar(yoke[1], [0, -0.55, 0], [t0.x, -0.25, t0.z]);
    }
    const v = [0, twLerp(1.1, 1.35, fa), twLerp(R + 0.42, R + 1.05, fa)]; hga.position.set(...v); hga.rotation.x = -twLerp(0, 0.45, fa);
    twSetBar(boom, [0, 1.0, R - 0.1], [0, v[1] - 0.05, v[2] - 0.14]);
    mag.rotation.x = twLerp(Math.PI, Math.PI / 2 - 0.15, fm);
  };
  if (flags.deployT != null) g.userData.animate = t => pose(clamp((t - flags.deployT - 30) / 300, 0, 1));
  pose(flags.stowed || flags.deployT != null ? 0 : 1);
  g.userData.len = H; g.userData.mounts = [{ y: -TWO.eng, r: 0.22, tag: 'ORB' }];
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// The entry capsule (y = 0 at the heat shield's nose): the heat shield, a 70° sphere-cone 3.4 m across (nose radius
// 0.85 m, rounded at its shoulder); the backshell, two cones (25° and 45° from the axis) up to the ring where it sits on
// the orbiter, the parachute's canister and its lid above that, 2.5 m from the nose; the trim wing hinged above the seal.
const TWC = { R: 1.7, seal: [1.681, 0.671], hip: [1.30, 1.49], bip: [0.62, 2.17], can: [0.5, 2.42], top: 2.5 };
function twHeatShieldProfile() {
  const p = [], Rn = 0.85;
  for (let a = 0; a <= 20; a += 2) p.push([Rn * Math.sin(a * DEG), Rn * (1 - Math.cos(a * DEG))]);
  for (let a = -70; a <= 40; a += 6) p.push([1.62 + 0.08 * Math.cos(a * DEG), 0.62 + 0.08 * Math.sin(a * DEG)]); // the shoulder (centre r 1.62, y 0.62)
  p.push(TWC.seal); return p;
}
function twBackshellProfile() { const p = [TWC.seal, TWC.hip, TWC.bip, [TWC.can[0], TWC.bip[1]], TWC.can]; for (let k = 1; k <= 5; k++) { const a = k / 5 * Math.PI / 2; p.push([TWC.can[0] * Math.cos(a), TWC.can[1] + (TWC.top - TWC.can[1]) * Math.sin(a)]); } return p; }
// the heat shield's ablator: dark grey-brown, a faint grid of the honeycomb's panels, a mottle
function twHeatShieldMat() {
  return twMat('hs', () => {
    const prof = m20Resample(twHeatShieldProfile(), 160), L = prof.len, W = 2048, H = 512; let s = 13; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const map = m20Canvas(W, H, g => {
      g.fillStyle = '#332c27'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,230,200,0.035)' : 'rgba(0,0,0,0.07)'; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 7, 1 + rnd() * 3); }
      g.strokeStyle = 'rgba(120,104,90,0.28)'; g.lineWidth = 1.5;
      for (let k = 1; k < 7; k++) { const y = (0.18 + k * 0.24) / L * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let k = 0; k < 36; k++) { const x = k / 36 * W; g.beginPath(); g.moveTo(x, 0.4 / L * H); g.lineTo(x, H); g.stroke(); }
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.04 });
  });
}
// the backshell's white coat: the seal's dark rim and its bolts, the hip's seam, eight thruster ports below the hip, round
// ports and two gold-rimmed sensor windows on the upper cone, the ring it sits on the orbiter by, the canister and its lid
function twBackshellMat() {
  return twMat('bs', () => {
    const prof = m20Resample(twBackshellProfile(), 160), L = prof.len, W = 2048, H = 1024, S = x => x / L * H;
    const sHip = Math.hypot(TWC.seal[0] - TWC.hip[0], TWC.seal[1] - TWC.hip[1]), sBip = sHip + Math.hypot(TWC.hip[0] - TWC.bip[0], TWC.hip[1] - TWC.bip[1]);
    const disc = (g, a, sp, rho, fill, rim) => { const r = prof.at(sp)[0], ex = rho / (TAU * r) * W, ey = rho / L * H, x = ((a / 360) % 1 + 1) % 1 * W;
      for (const dx of [0, -W, W]) { g.beginPath(); g.ellipse(x + dx, S(sp), ex, ey, 0, 0, TAU); g.fillStyle = fill; g.fill(); if (rim) { g.lineWidth = 3; g.strokeStyle = rim; g.stroke(); } } };
    const dots = (g, sp, step, col) => { const n = Math.round(TAU * prof.at(sp)[0] / step); g.fillStyle = col; for (let k = 0; k < n; k++) { g.beginPath(); g.arc((k + 0.5) / n * W, S(sp), 1.6, 0, TAU); g.fill(); } };
    let s = 17; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const map = m20Canvas(W, H, g => {
      g.fillStyle = '#dedcd5'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(90,85,78,0.04)'; g.fillRect(rnd() * W, rnd() * S(sBip), 3 + rnd() * 10, 2 + rnd() * 5); }
      g.fillStyle = '#34353a'; g.fillRect(0, 0, W, S(0.03)); dots(g, 0.016, 0.25, '#9a9ca0');
      g.strokeStyle = 'rgba(140,138,130,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, S(sHip)); g.lineTo(W, S(sHip)); g.stroke();
      for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(k / 12 * W, S(0.03)); g.lineTo(k / 12 * W, S(sHip)); g.strokeStyle = 'rgba(150,147,140,0.35)'; g.lineWidth = 2; g.stroke(); } // the lower cone's panels
      for (let k = 0; k < 8; k++) disc(g, 22.5 + k * 45, sHip - 0.18, 0.06, '#2c2d31', '#8d8f93'); // thruster ports
      for (const a of [70, 160, 250, 340]) disc(g, a, sHip - 0.45, 0.07, '#bdbcb7', '#8f8e89');
      for (const a of [120, 300]) { disc(g, a, sHip + 0.4, 0.13, '#c49a42'); disc(g, a, sHip + 0.4, 0.08, '#3c3c40'); }
      g.fillStyle = '#b3b6ba'; g.fillRect(0, S(sBip) - 5, W, 10); dots(g, sBip + 0.03, 0.06, 'rgba(110,108,102,0.9)');
      g.fillStyle = '#e8e6df'; g.fillRect(0, S(sBip) + 5, W, H - S(sBip) - 5);
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.03 });
  });
}
function twHeatShield() {
  const g = new THREE.Group(), prof = m20Resample(twHeatShieldProfile(), 60);
  g.add(lathe(prof, twHeatShieldMat(), 96));
  const inner = m20Inner(prof, 0.05); g.add(lathe(inner, mat('#4b4842', 'dark', { side: THREE.DoubleSide }), 72));
  const rim = new THREE.Mesh(new THREE.RingGeometry(inner[0][0], TWC.seal[0], 72, 1), mat('#57504a', 'dark', { side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.position.y = TWC.seal[1]; g.add(rim);
  g.userData.len = TWC.seal[1]; return g;
}
// the trim wing: a plate on a hinge just above the seal (+Z); folded down onto the lower cone, or swung out into the air
function twTrimWing() {
  const h = new THREE.Group(); h.position.set(0, 0.69, 1.71);
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.035), mat('#d4d3cd', 'paint')); p.geometry.translate(0, 0.36, 0.018); h.add(p);
  for (const x of [-0.2, 0.2]) { const r = box(0.03, 0.66, 0.04, mat('#a9acb0', 'metal')); r.position.set(x, 0.03, 0.04); h.add(r); }
  const hinge = cyl(0.03, 0.03, 0.6, mat('#8c9197', 'metal'), 10); hinge.rotation.z = Math.PI / 2; hinge.position.x = 0.3; h.add(hinge);
  h.userData.set = f => { h.rotation.x = twLerp(-25 * DEG, 50 * DEG, f); };
  return h;
}
function twBackshell(trim) {
  const g = new THREE.Group(), prof = m20Resample(twBackshellProfile(), 70);
  g.add(lathe(prof, twBackshellMat(), 96));
  g.add(lathe(m20Inner(m20Resample([TWC.seal, TWC.hip, TWC.bip], 30), 0.05), mat('#3a3c40', 'metal', { side: THREE.DoubleSide }), 64));
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), mat('#3a3c40', 'metal', { side: THREE.DoubleSide })); plate.rotation.x = Math.PI / 2; plate.position.y = TWC.bip[1] - 0.04; g.add(plate);
  const tw = twTrimWing(); tw.userData.set(trim); g.add(tw); g.userData.trim = tw;
  g.userData.len = TWC.top; return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// Zhurong (y = 0 under its wheels, +Z forward): its body 1.3 m long, its deck white with the two round windows; six wheels
// 0.3 m across, each on its own steering post, on the active suspension that lifts and lowers the body; four solar wings
// hinged along the deck's sides that open like a butterfly's; the mast with the camera head at the front, 1.85 m up; the
// high-gain dish at the back. pose({ lift, wings, mast, dish }) from 0 (folded for the landing, the body let down) to 1.
const TWZ = { WR: 0.15, WX: 0.55, WZ: [0.62, 0, -0.62] };
function zhurong() {
  const g = new THREE.Group(), white = mat('#ecebe7', 'paint'), alu = mat('#b8bdc3', 'metal'), grey = mat('#7e838a', 'metal'), dark = mat('#222428', 'dark'), gold = foilMat('gold', 1);
  const { WR, WX, WZ } = TWZ;
  const body = new THREE.Group(); g.add(body);
  body.add(box(0.84, 0.3, 1.3, white));
  for (const s of [-1, 1]) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.2), gold); sp.position.set(s * 0.421, 0.15, 0); sp.rotation.y = s * Math.PI / 2; body.add(sp); }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.2), foilMat('mylar', 1)); back.position.set(0, 0.15, -0.651); back.rotation.y = Math.PI; body.add(back);
  for (const x of [-0.17, 0.17]) { const w = cyl(0.12, 0.12, 0.012, mat('#c9a04a', 'gold'), 28); w.position.set(x, 0.3, -0.3); body.add(w); const gl = cyl(0.1, 0.1, 0.014, mat('#141a24', 'glass'), 28); gl.position.set(x, 0.302, -0.3); body.add(gl); } // the windows
  for (const x of [-0.12, 0.12]) { const c = box(0.08, 0.06, 0.05, dark); c.position.set(x, 0.17, 0.66); body.add(c); } // front hazard cameras
  for (const x of [-0.25, 0.25]) { const r = box(0.12, 0.03, 0.4, grey); r.position.set(x, -0.03, 0.42); body.add(r); } // the radar's antennas under the front
  // wheels on their steering posts
  const wheels = [];
  for (const s of [-1, 1]) for (const z of WZ) {
    const w = new THREE.Group(); w.position.set(s * WX, WR, z); g.add(w);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, 0.17, 20), mat('#a7acb2', 'metal')); tyre.rotation.z = Math.PI / 2; w.add(tyre);
    for (let k = 0; k < 10; k++) { const a = k * TAU / 10, c = box(0.17, 0.018, 0.03, mat('#6c7076', 'metal')); c.geometry.translate(0, -0.009, 0); c.position.set(0, Math.cos(a) * WR, Math.sin(a) * WR); c.rotation.x = a; w.add(c); }
    const hubc = cyl(0.05, 0.05, 0.02, dark, 14); hubc.rotation.z = Math.PI / 2; hubc.position.x = s * 0.09; w.add(hubc);
    const post = cyl(0.035, 0.035, 0.12, grey, 10); post.position.set(s * WX, 2 * WR, z); g.add(post);
    wheels.push(w);
  }
  // the suspension's arms (placed by pose)
  const arms = []; for (let i = 0; i < 8; i++) { const b = twBarMesh(0.022, alu); g.add(b); arms.push(b); }
  // solar wings: front and rear on each side, hinged along the deck's edges (the right pair just below the left, so that
  // folded over the deck they lie one on the other)
  const wings = [];
  for (const s of [1, -1]) for (const zc of [0.33, -0.33]) {
    const h = new THREE.Group(); h.position.set(s * 0.42, s > 0 ? 0.32 : 0.355, zc); if (s < 0) h.rotation.y = Math.PI; body.add(h);
    const p = twPanel(0.95, 0.57, 6, 4, '#c7cacd'); p.rotation.x = -Math.PI / 2; h.add(p); wings.push(h);
  }
  // the mast and its head; the high-gain dish
  const mast = new THREE.Group(); mast.position.set(0, 0.42, 0.5); body.add(mast);
  const ped = cyl(0.06, 0.06, 0.12, grey, 12); ped.position.set(0, 0.3, 0.5); body.add(ped);
  mast.add(cyl(0.035, 0.035, 0.92, white, 12));
  const head = new THREE.Group(); head.position.y = 0.92; mast.add(head);
  head.add(box(0.34, 0.13, 0.15, white));
  for (const [x, r] of [[-0.12, 0.028], [0.12, 0.028], [0.0, 0.045]]) { const l = cyl(r, r, 0.03, dark, 16); l.rotation.x = Math.PI / 2; l.position.set(x, 0.065, 0.085); head.add(l); }
  const dishP = new THREE.Group(); dishP.position.set(0.25, 0.38, -0.5); body.add(dishP);
  const dd = twDish(0.17, 0.05, mat('#f0efea', 'paint', { side: THREE.DoubleSide }), 24); dd.position.y = 0.05; dishP.add(dd);
  const dpost = cyl(0.02, 0.02, 0.13, grey, 8); dpost.position.y = -0.08; dishP.add(dpost);
  const pose = ({ lift = 1, wings: fw = 1, mast: fm = 1, dish: fd = 1 } = {}) => {
    const yb = twLerp(0.25, 0.38, lift); body.position.y = yb;
    for (const h of wings) h.rotation.z = twLerp(Math.PI - 0.02, 18 * DEG, fw);
    mast.rotation.x = twLerp(-Math.PI / 2, 0, fm);
    dishP.rotation.x = twLerp(0, -0.7, fd);
    for (const [i, s] of [[0, 1], [4, -1]]) { // the rocker from the front wheel to the body's side, back to the bogie; the bogie to the middle and rear wheels
      const piv = [s * 0.43, yb + 0.1, 0.12], bog = [s * WX, 2 * WR + 0.2, -0.31], top = z => [s * WX, 2 * WR + 0.12, z];
      twSetBar(arms[i], top(WZ[0]), piv); twSetBar(arms[i + 1], piv, bog); twSetBar(arms[i + 2], bog, top(WZ[1])); twSetBar(arms[i + 3], bog, top(WZ[2]));
    }
  };
  g.userData.pose = pose; g.userData.wheelsZ = wheels;
  pose(); return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// The landing platform (y = 0 at the foot of its body): an octagonal body 2.24 m across its corners and 0.45 m deep in gold
// blankets, the national flag on its +X side; four legs that fold up inside the capsule and open out to stand it 0.85 m
// off the ground (its deck 1.3 m up); the engine under its centre; two rails across the deck that carry the rover, and two
// ramps hinged at the front edge, folded back over the rover's front wheels until they swing down and run out to the
// ground. Zhurong sits on the rails, facing the ramps. pose: { legs(f), ramp(f) }.
const TWP = { R: 1.12, H: 0.45, clear: 0.85, roverZ: -0.2, rail: 0.03, ramp: 2.75 };
function twPlatform() {
  const g = new THREE.Group(), { R, H } = TWP, rf = R * Math.cos(Math.PI / 8);
  const gold = foilMat('gold', 1.5), alu = mat('#bfc4ca', 'metal'), grey = mat('#80858c', 'metal'), dark = mat('#2a2c30', 'dark');
  g.add(twPrismSides(8, R, 0, H, 0, () => gold));
  g.add(twDeck(8, R, H, 0, mat('#dcdcd8', 'paint', { side: THREE.DoubleSide })));
  g.add(twDeck(8, R, 0, 0, mat('#55585e', 'metal', { side: THREE.DoubleSide }), 0, true));
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.32), cnFlagMat()); f.position.set(rf + 0.005, H / 2, 0); f.rotation.y = Math.PI / 2; g.add(f); }
  const eng = bell(0.6, 0.25, mat('#3c3e42', 'metal', { side: THREE.DoubleSide })); eng.position.y = -0.6; g.add(eng);
  const ch = cyl(0.12, 0.12, 0.12, grey, 16); ch.position.y = -0.12; g.add(ch);
  for (let k = 0; k < 4; k++) { const a = (22.5 + 90 * k) * DEG, pod = new THREE.Group(); pod.position.set(...m20Polar(rf - 0.1, a, 0)); pod.rotation.y = a; g.add(pod); pod.add(box(0.18, 0.08, 0.12, grey)); for (const s of [-1, 1]) { const n = bell(0.12, 0.04, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); n.position.set(s * 0.05, -0.12, 0.02); pod.add(n); } }
  for (const [x, z] of [[0.45, -0.35], [-0.45, -0.35]]) { const r = box(0.22, 0.06, 0.16, dark); r.position.set(x, -0.06, z); g.add(r); } // the radar and the laser altimeter
  // the rails on the deck
  for (const s of [-1, 1]) { const r = box(0.3, TWP.rail, 1.9, alu); r.position.set(s * TWZ.WX, H, 0.07); g.add(r); }
  // legs at the four diagonals: the main strut (it telescopes), two side struts, the footpad
  const legs = [];
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG, L = new THREE.Group(); L.position.set(...m20Polar(1.0, a, 0.32)); L.rotation.y = a - Math.PI / 2; g.add(L);
    const main = twBarMesh(0.045, alu, 10), inner = twBarMesh(0.032, mat('#d9dcdf', 'metal'), 10), side = [twBarMesh(0.022, alu), twBarMesh(0.022, alu)];
    const pad = cyl(0.19, 0.17, 0.06, mat('#c9a04a', 'gold'), 18); L.add(main, inner, ...side, pad);
    legs.push({ main, inner, side, pad });
  }
  // the ramps: an outer rail and two that slide out of it, on a hinge at the deck's front edge
  const ramps = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group(); h.position.set(s * TWZ.WX, H + TWP.rail, rf); g.add(h);
    const secs = [0.95, 0.92, 0.92].map((l, i) => { // a channel: its floor and two lips, each section a little narrower than the last
      const b = new THREE.Group(), w = 0.24 - i * 0.025, m = i ? mat('#cfd3d7', 'metal') : alu; h.add(b);
      const fl = box(w, 0.012, l, m); fl.geometry.translate(0, -0.012 - i * 0.006, l / 2); b.add(fl);
      for (const s of [-1, 1]) { const lp = box(0.014, 0.05, l, m); lp.geometry.translate(s * (w / 2 - 0.007), -0.012 - i * 0.006, l / 2); b.add(lp); }
      return b;
    });
    ramps.push({ h, secs });
  }
  const legPose = f => {
    const len = twLerp(0.75, 1.36, f), b = twLerp(35, 33, f) * DEG, e = [len * Math.sin(b), -len * Math.cos(b), 0];
    for (const l of legs) {
      twSetBar(l.main, [0, 0, 0], [e[0] * 0.55, e[1] * 0.55, 0]); twSetBar(l.inner, [e[0] * 0.5, e[1] * 0.5, 0], e);
      twSetBar(l.side[0], [-0.22, -0.32, 0.33], [e[0] * 0.55, e[1] * 0.55, 0]); twSetBar(l.side[1], [-0.22, -0.32, -0.33], [e[0] * 0.55, e[1] * 0.55, 0]);
      l.pad.position.set(e[0], e[1] - 0.03, 0);
    }
  };
  const drop = H + TWP.rail + TWP.clear, ang = Math.asin(drop / TWP.ramp); // the ramp's slope to the ground
  const rampPose = f => {
    const fr = twPhase(f, 0, 0.55), fx = twPhase(f, 0.45, 1);
    for (const { h, secs } of ramps) { h.rotation.x = twLerp(-140 * DEG, ang, fr); secs[1].position.z = twLerp(0.02, 0.92, fx); secs[2].position.z = twLerp(0.04, 1.83, fx); }
  };
  g.userData.pose = { legs: legPose, ramp: rampPose }; g.userData.slope = ang;
  legPose(1); rampPose(0);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// The assemblies the app shows, by part (buildSC 'tianwen'): the orbiter carrying the capsule (flags.stowed in the
// fairing; flags.deployT: it unfolds after separation); the orbiter alone; the capsule (flags.trimT: the trim wing swings
// out, flags.trim: it is out; flags.hs === false: the heat shield gone and the platform's legs opening from flags.hsT); the
// heat shield and the backshell on their own (flags.rest: on the ground); the platform with the rover (flags.powered: on
// its engine; flags.landed: on the ground, the rover unfolding from flags.wingsT, the ramp from flags.rampT, and the rover
// driving down it from flags.rollT).
function twAssembly(P, flags) {
  const g = new THREE.Group(), mounts = [];
  if (P.has('cruise')) {
    const o = twOrbiter(flags); g.add(o); mounts.push(...o.userData.mounts);
    const c = new THREE.Group(); c.add(twHeatShield(), twBackshell(0)); c.rotation.x = Math.PI; c.position.y = TWO.H + 0.06 + TWC.bip[1]; g.add(c);
    if (o.userData.animate) g.userData.animate = o.userData.animate;
    g.userData.len = TWO.H + 0.06 + TWC.bip[1]; g.userData.yc0 = 1.9;
  } else if (P.has('orbiter')) { const o = twOrbiter(flags); g.add(o); mounts.push(...o.userData.mounts); g.userData.len = TWO.H; }
  else if (P.has('aeroshell')) {
    if (flags.hs !== false) g.add(twHeatShield());
    const bs = twBackshell(flags.trim || flags.hs === false ? 1 : 0); g.add(bs);
    const anim = [];
    if (flags.trimT != null && !flags.trim) anim.push(t => bs.userData.trim.userData.set(smoothstep(clamp((t - flags.trimT) / 2, 0, 1))));
    if (flags.hs === false) {
      const pf = twPlatform(); pf.position.y = TWP.clear; g.add(pf);
      const zr = zhurong(); zr.userData.pose({ lift: 0, wings: 0, mast: 0, dish: 0 }); zr.position.set(0, TWP.clear + TWP.H + TWP.rail, TWP.roverZ); g.add(zr);
      pf.userData.pose.legs(0); pf.userData.pose.ramp(0);
      if (flags.hsT != null) anim.push(t => pf.userData.pose.legs(smoothstep(clamp((t - flags.hsT - 3) / 5, 0, 1))));
      else pf.userData.pose.legs(1);
    }
    if (anim.length) g.userData.animate = t => { for (const f of anim) f(t); };
    g.userData.chuteY = TWC.top; g.userData.capsuleR = TWC.R; g.userData.dgb = true; g.userData.len = TWC.top;
  }
  else if (P.has('heatshield')) { g.add(twHeatShield()); g.userData.footY = flags.rest ? 0 : 0.8; g.userData.len = TWC.seal[1]; }
  else if (P.has('backshell')) { g.add(twBackshell(1)); g.userData.chuteY = TWC.top; g.userData.capsuleR = TWC.R; g.userData.dgb = true; g.userData.footY = flags.rest ? TWC.seal[1] : 0.8; g.userData.len = TWC.top; }
  else if (P.has('lander')) {
    const pf = twPlatform(); g.add(pf);
    const zr = zhurong(); const z0 = TWP.roverZ, y0 = TWP.H + TWP.rail; zr.position.set(0, y0, z0); g.add(zr);
    g.userData.footY = -TWP.clear; g.userData.len = 1.4;
    if (!flags.landed) { zr.userData.pose({ lift: 0, wings: 0, mast: 0, dish: 0 }); mounts.push({ y: -0.6, r: 0.25, tag: 'LDR' }); }
    else {
      // the drive down the ramp: along the deck to its edge, down the slope, on over the ground (its path in the
      // platform's frame: z forward, y up; pitch, nose down positive), at about 4 cm/s
      const rf = TWP.R * Math.cos(Math.PI / 8), a = pf.userData.slope, run = TWP.ramp * Math.cos(a), yG = -TWP.clear;
      const path = [[z0, y0], [rf, y0], [rf + run, yG], [rf + run + 1.6, yG]], segL = [], tot = [0];
      for (let i = 1; i < path.length; i++) { segL.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])); tot.push(tot[i - 1] + segL[i - 1]); }
      const at = s => { let i = 0; while (i < segL.length - 1 && tot[i + 1] < s) i++; const f = clamp((s - tot[i]) / segL[i], 0, 1); return [twLerp(path[i][0], path[i + 1][0], f), twLerp(path[i][1], path[i + 1][1], f)]; };
      const pitchAt = s => a * twPhase(s, tot[1] - 0.6, tot[1] + 0.6) * (1 - twPhase(s, tot[2] - 0.6, tot[2] + 0.6));
      const total = tot[tot.length - 1], speed = 0.04;
      g.userData.animate = t => {
        const fu = flags.wingsT != null ? clamp((t - flags.wingsT) / 240, 0, 1) : 1;
        zr.userData.pose({ lift: twPhase(fu, 0, 0.25), wings: twPhase(fu, 0.2, 0.7), mast: twPhase(fu, 0.65, 0.9), dish: twPhase(fu, 0.85, 1) });
        pf.userData.pose.ramp(flags.rampT != null ? smoothstep(clamp((t - flags.rampT) / 120, 0, 1)) : 1);
        const s = flags.rollT != null ? clamp((t - flags.rollT) * speed, 0, total) : 0, [z, y] = at(s);
        zr.position.set(0, y, z); zr.rotation.x = pitchAt(s);
        for (const w of zr.userData.wheelsZ) w.rotation.x = s / TWZ.WR;
      };
      g.userData.animate(-1e12);
    }
  }
  g.userData.len = g.userData.len || 2;
  return { inner: g, mounts };
}
