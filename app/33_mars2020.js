// ============================================================================
// Mars 2020's flight system apart from the rover (metres): the cruise stage, the aeroshell (heat shield and backshell) and
// the descent stage, the "sky crane". Mars 2020 was built to Mars Science Laboratory's drawings, so the shapes are MSL's.
// Axes: +Y along the axis from the heat shield's nose (Y = 0) toward the cruise stage; the heat shield leads into the air.
// The parts' proportions and layout follow NASA's exploded drawing of the spacecraft (PIA24128) and photographs of it
// being put together (PIA23887, PIA23886; MSL's descent stage, PIA11425).
//
// Aeroshell (MSL entry papers: Edquist 2009, Johansen 2011, Schoenenberger 2013): 4.5 m across. The heat shield is a 70°
// sphere-cone (nose radius 1.125 m) rounded at its shoulder (radius 0.126 m), 0.835 m from the nose to its widest point,
// covered in about a hundred PICA tiles (dark) with filled gaps between them. The backshell, painted white, is two cones
// (half-angles 36.9° and 59.7°, meeting at the 3.04 m "hip") up to the backshell interface plate (1.31 m across); on it the
// 29° parachute closeout cone and its lid, which the parachute is fired through, 3.0 m from the nose. A row of round ports
// and an access panel on the lower cone, a gold-rimmed port on the upper cone, bolts round the interface plate.
// Cruise stage: a disc as wide as the aeroshell, its outward face covered in solar cells, bolted to the interface plate
// round the parachute cone; ten radiator panels hang from its rim toward the aeroshell, so that it looks like a drum. Inside
// it: two propellant tanks, the cooling loop's pipes, electronics in gold blankets; two clusters of four thrusters on
// struts below the rim, on opposite sides; the medium-gain antenna's horn in a gap between two radiators. The cruise stage
// and the aeroshell together are 3.0 m tall (MSL launch press kit).
// Descent stage: a tapered octagonal frame, wider at its foot, holding three propellant tanks and two pressurant tanks in
// blankets; below its centre a keel with the bridle device at its point; eight throttleable engines in pairs on outriggers
// at the four diagonals, one of each pair canted 5° outboard and the other 22.5°; the radar's six antennas on a plate on one
// side. The rover hangs under the keel with its wheels folded up beside its body until it is lowered on three bridles and
// an umbilical, 6.4 m long (Perseverance's: Curiosity's were 7.5 m).
// ============================================================================
const M20 = { mats: {} };
// the profile [r, y] of the aeroshell's outer surface, resampled evenly along its length (so a texture's rows follow it)
function m20Resample(pts, n) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = []; let j = 0;
  for (let k = 0; k < n; k++) { const s = L[L.length - 1] * k / (n - 1); while (j < L.length - 2 && L[j + 1] < s) j++; const f = (s - L[j]) / Math.max(L[j + 1] - L[j], 1e-9); out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]); }
  out.len = L[L.length - 1]; out.at = s => { let i = 0; while (i < L.length - 2 && L[i + 1] < s) i++; const f = (s - L[i]) / Math.max(L[i + 1] - L[i], 1e-9); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; };
  out.sOf = L; return out;
}
// heat shield: nose sphere to its tangent cone (20° from the axis), the 70° cone, the shoulder round to the seal with the backshell
function m20HeatShieldProfile() {
  const p = [];
  for (let a = 0; a <= 20; a += 2) p.push([1.125 * Math.sin(a * DEG), 1.125 * (1 - Math.cos(a * DEG))]);
  for (let a = -70; a <= 37; a += 6) p.push([2.124 + 0.126 * Math.cos(a * DEG), 0.835 + 0.126 * Math.sin(a * DEG)]); // shoulder (centre r 2.124, y 0.835)
  p.push([2.124 + 0.126 * Math.cos(37 * DEG), 0.835 + 0.126 * Math.sin(37 * DEG)]);
  return p;
}
const M20_SEAL = [2.225, 0.911], M20_HIP = [1.519, 1.850], M20_BIP = [0.654, 2.355], M20_PCC = [0.366, 2.875], M20_TOP = 3.001;
function m20BackshellProfile() { const p = [M20_SEAL, M20_HIP, M20_BIP, M20_PCC]; for (let k = 1; k <= 4; k++) { const f = k / 4; p.push([M20_PCC[0] * Math.cos(f * Math.PI / 2), M20_PCC[1] + (M20_TOP - M20_PCC[1]) * Math.sin(f * Math.PI / 2)]); } return p; }
// the inside of a shell: the profile moved in along its normals, in reverse order (its faces turned inward)
function m20Inner(pts, d) {
  const out = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], tr = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tr, ty) || 1; return [Math.max(0, p[0] - d * ty / l), p[1] + d * tr / l]; });
  return out.reverse();
}
// a texture drawn on a canvas, its top row at v = 0 (where a lathe's profile starts)
function m20Canvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
let m20Seed = 7; const m20Rnd = () => (m20Seed = (m20Seed * 9301 + 49297) % 233280) / 233280;
// the heat shield's PICA tiles: rings of tiles about 0.4 m across from the nose cap out over the shoulder, each a slightly
// different dark brown-black, the filled gaps between them a little lighter; a few sensor plugs near the nose
function m20HeatShieldMat() {
  if (M20.mats.hs) return M20.mats.hs;
  const prof = m20Resample(m20HeatShieldProfile(), 200), L = prof.len, W = 2048, H = 512;
  const tex = m20Canvas(W, H, (g) => {
    m20Seed = 11; g.fillStyle = '#26221f'; g.fillRect(0, 0, W, H);
    const rows = [0, 0.32]; while (rows[rows.length - 1] < L - 0.25) rows.push(Math.min(L, rows[rows.length - 1] + 0.4)); rows.push(L);
    for (let k = 0; k < rows.length - 1; k++) {
      const y0 = rows[k] / L * H, y1 = rows[k + 1] / L * H, r = prof.at((rows[k] + rows[k + 1]) / 2)[0], n = k === 0 ? 1 : Math.max(6, Math.round(2 * Math.PI * r / 0.42)), off = m20Rnd();
      for (let j = 0; j < n; j++) { const x0 = ((j + off) / n) * W, x1 = ((j + 1 + off) / n) * W, v = 30 + Math.floor(m20Rnd() * 16); g.fillStyle = `rgb(${v + 8},${v + 2},${v - 2})`; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillRect(x0 - W, y0, x1 - x0, y1 - y0); }
      g.fillStyle = '#5a4a3e'; if (k > 0) g.fillRect(0, y0 - 1.5, W, 3); // the gap between two rings
      if (k > 0) for (let j = 0; j < n; j++) { const x = ((j + off) / n) * W % W; g.fillRect(x - 1.5, y0, 3, y1 - y0); }
    }
    for (let i = 0; i < 9000; i++) { const v = m20Rnd(); g.fillStyle = v > 0.5 ? 'rgba(255,235,210,0.035)' : 'rgba(0,0,0,0.06)'; g.fillRect(m20Rnd() * W, m20Rnd() * H, 2 + m20Rnd() * 6, 1 + m20Rnd() * 3); } // the ablator's fibrous mottle
    g.fillStyle = '#6a5c50'; for (const [x, s] of [[0, 0.05], [0.25, 0.5], [0.75, 0.5], [0.1, 0.9], [0.6, 0.9], [0.35, 1.4], [0.85, 1.4]]) { g.beginPath(); g.arc(x * W, s / L * H, 3, 0, 2 * Math.PI); g.fill(); } // sensor plugs
  });
  return (M20.mats.hs = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.05 }));
}
// the backshell's white paint and what shows on it: the dark rim of the seal with its bolts; round ports (grey, and
// smaller gold ones) in a row above the seal; an access panel with its rivets; the hip; on the upper cone two gold-rimmed
// ports and a ring of rivets below the interface plate; the plate's aluminium ring; the parachute closeout cone, a slightly
// warmer white, with a slot on one side; the lid
function m20BackshellMat() {
  if (M20.mats.bs) return M20.mats.bs;
  const prof = m20Resample(m20BackshellProfile(), 200), L = prof.len, W = 2048, H = 1024, S = s => s / L * H;
  const sHip = Math.hypot(M20_SEAL[0] - M20_HIP[0], M20_SEAL[1] - M20_HIP[1]), sBip = sHip + Math.hypot(M20_HIP[0] - M20_BIP[0], M20_HIP[1] - M20_BIP[1]), sPcc = sBip + Math.hypot(M20_BIP[0] - M20_PCC[0], M20_BIP[1] - M20_PCC[1]);
  // a disc of radius rho (m) on the shell at azimuth a (deg, from +Z toward +X) and distance s along the profile: an ellipse on the map
  const disc = (g, a, s, rho, fill, rim) => { const r = prof.at(s)[0], ex = rho / (2 * Math.PI * r) * W, ey = rho / L * H, x = ((a / 360) % 1 + 1) % 1 * W;
    for (const dx of [0, -W, W]) { g.beginPath(); g.ellipse(x + dx, S(s), ex, ey, 0, 0, 2 * Math.PI); g.fillStyle = fill; g.fill(); if (rim) { g.lineWidth = 2; g.strokeStyle = rim; g.stroke(); } } };
  const dots = (g, s, step, col) => { const r = prof.at(s)[0], n = Math.round(2 * Math.PI * r / step); g.fillStyle = col; for (let k = 0; k < n; k++) { g.beginPath(); g.arc((k + 0.5) / n * W, S(s), 1.6, 0, 2 * Math.PI); g.fill(); } };
  const tex = m20Canvas(W, H, (g) => {
    m20Seed = 5; g.fillStyle = '#e9e8e3'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6000; i++) { g.fillStyle = m20Rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(90,85,78,0.035)'; g.fillRect(m20Rnd() * W, m20Rnd() * S(sBip), 3 + m20Rnd() * 10, 2 + m20Rnd() * 5); }
    g.fillStyle = '#2f3034'; g.fillRect(0, 0, W, S(0.035)); dots(g, 0.018, 0.3, '#9a9ca0'); // the seal's rim and its bolts
    // round ports above the seal (azimuth, size): large grey ones and small gold ones
    for (const [a, big] of [[-78, 0], [-62, 0], [-40, 1], [-20, 0], [-2, 0], [15, 1], [33, 0], [52, 0], [70, 1], [118, 0], [160, 1], [205, 0], [250, 1], [290, 0], [318, 0]])
      disc(g, a, big ? 0.36 : 0.33, big ? 0.11 : 0.055, big ? '#c3c3bf' : '#a8925a', big ? '#8f8f8b' : '#6f5f37');
    // an access panel (rounded, rivets round its edge)
    { const s0 = 0.6, s1 = 1.0, r = prof.at((s0 + s1) / 2)[0], w = 0.55 / (2 * Math.PI * r) * W, x = (1 - 55 / 360) * W, y0 = S(s0), y1 = S(s1);
      g.strokeStyle = 'rgba(110,108,102,0.8)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x - w / 2, y0, w, y1 - y0, 12); g.stroke();
      g.fillStyle = 'rgba(95,92,86,0.9)'; for (let k = 0; k <= 8; k++) for (const [px, py] of [[x - w / 2 + 6 + k * (w - 12) / 8, y0 + 6], [x - w / 2 + 6 + k * (w - 12) / 8, y1 - 6], [x - w / 2 + 6, y0 + 6 + k * (y1 - y0 - 12) / 8], [x + w / 2 - 6, y0 + 6 + k * (y1 - y0 - 12) / 8]]) { g.beginPath(); g.arc(px, py, 1.8, 0, 2 * Math.PI); g.fill(); } }
    g.strokeStyle = 'rgba(150,147,140,0.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, S(sHip)); g.lineTo(W, S(sHip)); g.stroke(); // the hip
    for (const a of [20, 200]) { disc(g, a, sHip + 0.6, 0.17, '#c49a42'); disc(g, a, sHip + 0.6, 0.12, '#47474a'); disc(g, a, sHip + 0.6, 0.07, '#7d7e82'); } // gold-rimmed ports
    dots(g, sBip - 0.06, 0.07, 'rgba(105,103,98,0.9)'); // rivets below the interface plate
    g.fillStyle = '#b5b8bc'; g.fillRect(0, S(sBip) - 6, W, 12); // the interface plate's ring
    g.fillStyle = '#eeebe4'; g.fillRect(0, S(sBip) + 6, W, S(sPcc) - S(sBip) - 6); // the parachute closeout cone
    dots(g, sBip + 0.05, 0.08, 'rgba(120,118,112,0.8)');
    disc(g, -40, sBip + 0.3, 0.07, 'rgba(60,60,64,0.85)'); // the slot in its side
    g.fillStyle = '#f2f0ea'; g.fillRect(0, S(sPcc), W, H - S(sPcc)); // the lid
  });
  return (M20.mats.bs = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.03 }));
}
const m20InnerMat = () => M20.mats.inner || (M20.mats.inner = new THREE.MeshStandardMaterial({ color: '#3a3c40', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }));
// the heat shield (with its inner face, the structure it is bonded to), y = 0 at the nose
function m20HeatShield() {
  const g = new THREE.Group(), prof = m20Resample(m20HeatShieldProfile(), 70);
  g.add(lathe(prof, m20HeatShieldMat(), 96));
  const inner = m20Inner(prof, 0.06); g.add(lathe(inner, mat('#4a4740', 'dark', { side: THREE.DoubleSide }), 72));
  const rim = new THREE.Mesh(new THREE.RingGeometry(inner[0][0], prof[prof.length - 1][0], 72, 1), mat('#5a5048', 'dark', { side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.position.y = prof[prof.length - 1][1]; g.add(rim);
  g.userData.len = M20_SEAL[1]; return g;
}
// the backshell with the interface plate, the parachute closeout cone and its lid; the bolts round the plate that hold the
// cruise stage; the parachute low-gain antenna's radome on the lid; the cruise balance masses (flags.cbm: there until the
// cruise stage goes)
function m20Backshell(flags = {}) {
  const g = new THREE.Group(), prof = m20Resample(m20BackshellProfile(), 90);
  g.add(lathe(prof, m20BackshellMat(), 96));
  g.add(lathe(m20Inner(m20Resample([M20_SEAL, M20_HIP, M20_BIP], 30), 0.05), m20InnerMat(), 64));
  const radome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, TAU, 0, Math.PI / 2), mat('#f4f1ea', 'paint')); radome.position.set(0.15, M20_TOP - 0.03, 0.04); g.add(radome);
  for (let k = 0; k < 4; k++) { const b = cyl(0.03, 0.03, 0.05, mat('#c9a04a', 'gold'), 10); b.position.set(...m20Polar(0.7, (30 + 90 * k) * DEG, M20_BIP[1] - 0.01)); g.add(b); }
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), m20InnerMat()); plate.rotation.x = Math.PI / 2; plate.position.y = M20_BIP[1] - 0.05; g.add(plate); // the interface plate from inside (the parachute is packed above it)
  if (flags.cbm) for (const a of [0, Math.PI]) { const b = box(0.24, 0.16, 0.2, mat('#6f7378', 'metal')); const r = M20_SEAL[0] - 0.2; b.position.set(Math.sin(a) * r, M20_SEAL[1] + 0.12, Math.cos(a) * r); b.rotation.y = a; b.rotateX(-0.64); g.add(b); }
  g.userData.len = M20_TOP; return g;
}
// small builders: a point at azimuth a (from +Z toward +X), radius r, height y; a round tube and a square beam from p to q
const m20Polar = (r, a, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
const M20_UP = new THREE.Vector3(0, 1, 0);
function m20Span(geo, p, q, m) {
  const a = new THREE.Vector3(...p), d = new THREE.Vector3(...q).sub(a), L = d.length(), o = new THREE.Mesh(geo(L), m);
  o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(M20_UP, d.normalize()); return o;
}
const m20Bar = (p, q, r, m) => m20Span(L => new THREE.CylinderGeometry(r, r, L, 8), p, q, m);
const m20Beam = (p, q, w, m) => m20Span(L => new THREE.BoxGeometry(w, L, w), p, q, m);
// the cruise stage's solar array: cells in ten panels round the central cylinder
function m20SolarTex() {
  if (M20.mats.solarTex) return M20.mats.solarTex;
  const R0 = 0.7, R1 = 2.25;
  return (M20.mats.solarTex = m20Canvas(2048, 2048, (g, W) => {
    m20Seed = 3; const c = W / 2, k = c / R1; g.fillStyle = '#9a9ea4'; g.fillRect(0, 0, W, W);
    for (let p = 0; p < 10; p++) {
      const a0 = p * TAU / 10 + 0.01, a1 = (p + 1) * TAU / 10 - 0.01;
      g.beginPath(); g.arc(c, c, (R1 - 0.03) * k, a0, a1); g.arc(c, c, (R0 + 0.03) * k, a1, a0, true); g.closePath(); g.fillStyle = '#2a3046'; g.fill(); // the panel between its cells
      g.save(); g.clip();
      for (let r = R0 + 0.035; r < R1 - 0.07; r += 0.065) { const n = Math.round((a1 - a0) * r / 0.045); for (let j = 0; j < n; j++) { const a = a0 + (j + 0.5) * (a1 - a0) / n, v = 20 + m20Rnd() * 7; g.fillStyle = `rgb(${v},${v + 9},${v + 38})`; g.beginPath(); g.arc(c, c, (r + 0.062) * k, a - 0.47 * (a1 - a0) / n, a + 0.47 * (a1 - a0) / n); g.arc(c, c, (r + 0.003) * k, a + 0.47 * (a1 - a0) / n, a - 0.47 * (a1 - a0) / n, true); g.closePath(); g.fill(); } }
      g.restore();
    }
  }));
}
const M20_CS_TOP = 2.98; // the solar array's face: the cruise stage and aeroshell stand 3.0 m tall
// the cruise stage, in the aeroshell's frame; userData.mounts: its two thruster clusters
function m20CruiseStage() {
  const g = new THREE.Group(), R = 2.25, top = M20_CS_TOP, y0 = top - 0.05, H = 0.75, yb = y0 - H, mounts = [];
  const white = mat('#ecebe6', 'paint', { side: THREE.DoubleSide }), alu = mat('#b9bdc3', 'metal'), copper = mat('#a86c3e', 'metal'), dark = mat('#2b2c30', 'dark');
  // the solar array: the cells outward, the panels' backs inward, its edge
  const face = new THREE.Mesh(new THREE.RingGeometry(0.7, R, 120, 2), new THREE.MeshStandardMaterial({ map: m20SolarTex(), roughness: 0.32, metalness: 0.35 })); face.rotation.x = -Math.PI / 2; face.position.y = top; g.add(face);
  const back = new THREE.Mesh(new THREE.RingGeometry(0.7, R, 120, 1), mat('#62666c', 'metal')); back.rotation.x = Math.PI / 2; back.position.y = y0; g.add(back);
  const edge = cyl(R, R, 0.05, mat('#26272a', 'dark'), 120, true); edge.position.y = y0; g.add(edge);
  // the central cylinder, from the interface plate up through the array
  const core = cyl(0.7, 0.7, top - M20_BIP[1], mat('#aeb2b8', 'metal', { side: THREE.DoubleSide }), 40, true); core.position.y = M20_BIP[1]; g.add(core);
  const flange = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.82, 40), mat('#9da2a8', 'metal', { side: THREE.DoubleSide })); flange.rotation.x = -Math.PI / 2; flange.position.y = M20_BIP[1] + 0.006; g.add(flange);
  // ten radiators round the rim, a wider gap at +Z for the medium-gain antenna; the cooling loop's pipes along them
  for (let k = 0; k < 10; k++) {
    const a0 = (k * 36 + 1.2 + (k === 0 ? 3.8 : 0)) * DEG, a1 = ((k + 1) * 36 - 1.2 - (k === 9 ? 3.8 : 0)) * DEG;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.012, R - 0.012, H, 8, 1, true, a0, a1 - a0), white); p.position.y = yb + H / 2; g.add(p);
  }
  for (const y of [yb + 0.07, y0 - 0.12]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.07, 0.016, 6, 96), copper); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
  // ribs under the array, struts from the central cylinder down and out to the radiators' feet
  for (let k = 0; k < 10; k++) { const a = k * TAU / 10; g.add(m20Beam(m20Polar(0.72, a, y0 - 0.04), m20Polar(R - 0.05, a, y0 - 0.04), 0.06, alu)); g.add(m20Bar(m20Polar(0.72, a, M20_BIP[1] + 0.1), m20Polar(R - 0.06, a, yb + 0.06), 0.022, copper)); }
  // propellant tanks, electronics in gold blankets
  for (const a of [60, 240]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), mat('#b08a5c', 'metal')); t.position.set(...m20Polar(1.6, a * DEG, yb + 0.32)); g.add(t); g.add(m20Bar(m20Polar(1.6, a * DEG, yb + 0.5), m20Polar(1.6, a * DEG, y0 - 0.05), 0.02, alu)); }
  for (const [a, w] of [[125, 0.4], [162, 0.3], [302, 0.36], [338, 0.3], [205, 0.32]]) { const b = box(w, 0.2, 0.28, foilMat('gold', 1)); b.position.set(...m20Polar(1.75, a * DEG, y0 - 0.3)); b.rotation.y = a * DEG; g.add(b); }
  // two thruster clusters below the rim (±X), four nozzles each pointing down and out
  for (const s of [-1, 1]) {
    const cl = new THREE.Group(); cl.position.set(s * (R + 0.06), yb - 0.05, 0); cl.rotation.y = s * Math.PI / 2; g.add(cl);
    cl.add(box(0.26, 0.08, 0.14, mat('#8c9096', 'metal')));
    for (let i = 0; i < 4; i++) { const n = bell(0.09, 0.028, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); const e = new THREE.Group(); e.position.set((i - 1.5) * 0.06, 0, 0.03); e.rotation.x = -0.55; e.add(n); n.position.y = -0.09; cl.add(e); }
    g.add(m20Bar([s * (R + 0.04), yb - 0.01, 0], [s * (R - 0.15), yb + 0.25, 0], 0.016, alu));
    const d = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-0.55, 0, 0)).applyEuler(cl.rotation), ex = new THREE.Vector3(0, -0.09, 0).applyEuler(new THREE.Euler(-0.55, 0, 0)).add(new THREE.Vector3(0, 0, 0.03)).applyEuler(cl.rotation).add(cl.position);
    mounts.push({ x: ex.x, y: ex.y, z: ex.z, r: 0.04, tag: 'CRUISE', d: [d.x, d.y, d.z] });
  }
  // the medium-gain antenna's horn, looking out through the gap at +Z; a star scanner and sun sensors on the array
  const horn = cyl(0.07, 0.15, 0.3, mat('#2c2d31', 'dark', { side: THREE.DoubleSide }), 24, true); horn.rotation.x = Math.PI / 2; horn.position.set(0, y0 - 0.22, R - 0.42); g.add(horn);
  const throat = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), dark); throat.position.set(0, y0 - 0.22, R - 0.42); g.add(throat);
  g.add(m20Bar([0, y0 - 0.05, R - 0.3], [0, y0 - 0.16, R - 0.3], 0.02, alu));
  const ss = box(0.16, 0.12, 0.16, dark); ss.position.set(...m20Polar(1.2, 200 * DEG, top)); g.add(ss); const shade = cyl(0.06, 0.09, 0.12, mat('#1c1d20', 'dark', { side: THREE.DoubleSide }), 16, true); shade.position.set(...m20Polar(1.2, 200 * DEG, top + 0.12)); g.add(shade);
  for (const a of [100, 280]) { const sn = box(0.07, 0.04, 0.07, mat('#cfa64a', 'gold')); sn.position.set(...m20Polar(2.1, a * DEG, top)); g.add(sn); }
  g.userData.len = top; g.userData.mounts = mounts; return g;
}
// one descent engine: valve and chamber over its bell, canted outboard (+Z) by cant (deg); its exit 0.6 m below the origin
function m20Engine(cant) {
  const e = new THREE.Group(); e.rotation.x = -cant * DEG;
  const v = box(0.13, 0.07, 0.11, mat('#8b8f95', 'metal')); v.position.y = -0.07; e.add(v);
  const ch = cyl(0.072, 0.072, 0.21, mat('#b8bcc2', 'metal'), 16); ch.position.y = -0.28; e.add(ch);
  const b = bell(0.32, 0.12, mat('#6a6b6f', 'metal', { side: THREE.DoubleSide })); b.position.y = -0.6; e.add(b);
  return e;
}
// the descent stage, y = 0 at the foot of its frame; userData.mounts: its eight engines (tag DS, cant, exhaust direction d)
function m20DescentStage() {
  const g = new THREE.Group(), alu = mat('#c3c7cc', 'metal'), grey = mat('#7b8086', 'metal', { side: THREE.DoubleSide }), mli = foilMat('mylar', 2), mounts = [];
  const RB = 1.05, RT = 0.78, YT = 0.85, corner = (r, k, y) => m20Polar(r, (k + 0.5) * TAU / 8, y); // the frame's foot and top (octagons, by their corners)
  for (let k = 0; k < 8; k++) {
    g.add(m20Beam(corner(RB, k, 0.04), corner(RB, k + 1, 0.04), 0.07, alu));
    g.add(m20Beam(corner(RT, k, YT), corner(RT, k + 1, YT), 0.06, alu));
    g.add(m20Beam(corner(RB, k, 0.04), corner(RT, k, YT), 0.055, alu));
    if (k % 2 === 0) g.add(m20Beam(corner(RB, k, 0.06), corner(RT, k + 1, YT - 0.02), 0.035, alu));
  }
  g.add(m20Beam([-0.68, YT, -0.28], [0.68, YT, -0.28], 0.06, alu)); g.add(m20Beam([0.28, YT, -0.68], [0.28, YT, 0.68], 0.06, alu)); // two beams across the top
  // three sides closed by panels with equipment behind them; the deck at the foot
  for (const k of [1, 4, 6]) {
    const q = [corner(RB, k, 0.04), corner(RB, k + 1, 0.04), corner(RT, k + 1, YT), corner(RT, k, YT)], geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]], 3)); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, grey));
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.96, RB * 0.96, 0.03, 8), mat('#9fa4aa', 'metal')); deck.rotation.y = TAU / 16; deck.position.y = 0.02; g.add(deck);
  // propellant tanks and pressurant tanks, in blankets; electronics
  for (const a of [0, 120, 240]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), mli); t.position.set(...m20Polar(0.5, a * DEG, 0.42)); g.add(t); }
  for (const a of [60, 300]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), mli); t.position.set(...m20Polar(0.74, a * DEG, 0.55)); g.add(t); }
  for (const [a, w] of [[180, 0.42], [100, 0.3]]) { const b = box(w, 0.22, 0.26, foilMat('mylar', 1)); b.position.set(...m20Polar(0.62, a * DEG, 0.06)); b.rotation.y = a * DEG; g.add(b); }
  // the keel under the centre and the bridle device at its point
  const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.12, 0.5, 4, 1), grey); keel.rotation.y = Math.PI / 4; keel.position.y = -0.25; g.add(keel);
  const bud = cyl(0.15, 0.15, 0.1, mat('#a9adb3', 'metal'), 20); bud.position.y = -M20_BUD; g.add(bud);
  // four engine pods on outriggers at the diagonals, two engines each
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG, P = m20Polar(1.55, a, 0.08), pod = new THREE.Group(); pod.position.set(...P); pod.rotation.y = a; g.add(pod);
    pod.add(box(0.44, 0.14, 0.24, grey));
    for (const [s, cant] of [[-1, k % 2 ? 22.5 : 5], [1, k % 2 ? 5 : 22.5]]) {
      const e = m20Engine(cant); e.position.set(s * 0.12, 0.02, 0); pod.add(e);
      const ex = new THREE.Vector3(0, -0.6, 0).applyEuler(e.rotation).add(e.position).applyEuler(pod.rotation).add(pod.position);
      const d = new THREE.Vector3(0, -1, 0).applyEuler(e.rotation).applyEuler(pod.rotation);
      mounts.push({ x: ex.x, y: ex.y, z: ex.z, r: 0.12, tag: 'DS', cant, d: [d.x, d.y, d.z] });
    }
    for (const j of [2 * k, 2 * k + 1]) { g.add(m20Bar(corner(RB, j, 0.04), [P[0], 0.14, P[2]], 0.024, alu)); g.add(m20Bar(corner(RT, j, YT), [P[0], 0.2, P[2]], 0.02, alu)); }
    const fit = cyl(0.05, 0.05, 0.06, mat('#c9a04a', 'gold'), 12); fit.position.set(...corner(RT, 2 * k, YT + 0.03)); g.add(fit); // where it hangs from the backshell
  }
  // the radar's six antennas on a plate on the −X side, tilted down and out
  const rad = new THREE.Group(); rad.position.set(-1.12, -0.14, 0); rad.rotation.set(0, -Math.PI / 2, 0); rad.rotateX(-0.35); g.add(rad);
  rad.add(box(0.9, 0.04, 0.4, mat('#dedcd5', 'paint')));
  for (let i = 0; i < 6; i++) { const d = cyl(0.075, 0.075, 0.03, mat('#6d5c3e', 'metal'), 16); d.position.set((i % 3 - 1) * 0.28, -0.06, (Math.floor(i / 3) - 0.5) * 0.19); d.rotation.set((Math.floor(i / 3) - 0.5) * 0.5, 0, (i % 3 - 1) * 0.35); rad.add(d); }
  g.add(m20Bar(corner(RB, 5, 0.04), [-1.05, -0.1, -0.25], 0.02, alu)); g.add(m20Bar(corner(RB, 6, 0.04), [-1.05, -0.1, 0.25], 0.02, alu));
  g.add(m20Bar([0.45, YT, 0.3], [0.45, YT + 0.5, 0.3], 0.016, mat('#1d1e21', 'dark'))); // UHF antenna
  g.userData.len = YT; g.userData.mounts = mounts; return g;
}
// The stack inside the aeroshell: the descent stage's foot 1.35 m above the heat shield's nose (its top just under the
// backshell), the bridle device 0.6 m below it, the rover's deck against the device. Lowered, the rover hangs 6.4 m further
// down: the descent stage stands M20_HANG above the ground when the rover's wheels touch it (edl.hang in src/vehicles.js).
const M20_DS = 1.35, M20_BUD = 0.6, M20_DECK = 1.13, M20_BRIDLE = 6.4, M20_HANG = M20_BUD + M20_BRIDLE + M20_DECK;
// the assemblies the app shows, by part (buildSC 'msl'): the stack in cruise; the entry vehicle (with or without its heat
// shield; the descent stage and rover inside show once it is gone); the heat shield, backshell or cruise stage on their
// own (flags.rest: lying on the ground); the descent stage with the rover (stowed, then lowered from flags.skyT); the
// descent stage alone, flying away; the rover on the ground
function m20Assembly(P, flags) {
  const g = new THREE.Group(); const mounts = []; let len = M20_TOP;
  if (P.has('cruise')) { g.add(m20HeatShield()); g.add(m20Backshell({ cbm: true })); const cs = m20CruiseStage(); g.add(cs); mounts.push(...cs.userData.mounts); }
  else if (P.has('cruisestage')) { const cs = m20CruiseStage(); cs.position.y = -M20_BIP[1]; g.add(cs); for (const m of cs.userData.mounts) mounts.push({ ...m, y: m.y - M20_BIP[1] }); len = 0.7; }
  else if (P.has('aeroshell')) {
    if (flags.hs !== false) g.add(m20HeatShield());
    g.add(m20Backshell({}));
    if (flags.hs === false) { const ds = m20DescentStage(); ds.position.y = M20_DS; g.add(ds); const rv = roverD(false, true); rv.position.y = M20_DS - M20_BUD - M20_DECK; g.add(rv); }
    g.userData.chuteY = M20_TOP; g.userData.capsuleR = 2.25; g.userData.dgb = true;
  }
  else if (P.has('heatshield')) { g.add(m20HeatShield()); g.userData.footY = flags.rest ? 0 : 1.35; }
  else if (P.has('backshell')) { g.add(m20Backshell({})); g.userData.chuteY = M20_TOP; g.userData.capsuleR = 2.25; g.userData.dgb = true; g.userData.footY = flags.rest ? M20_SEAL[1] : 1.35; }
  else if (P.has('descentstage')) { const ds = m20DescentStage(); g.add(ds); mounts.push(...ds.userData.mounts); len = 1; g.userData.yc0 = 0; }
  else if (P.has('lander')) {
    if (flags.landed) { const rv = roverD(true); g.add(rv); g.userData.footY = 0; len = 2.2; }
    else {
      const ds = m20DescentStage(); g.add(ds); mounts.push(...ds.userData.mounts.filter(m => !(flags.skyT != null && m.cant > 10))); // four engines shut down for the sky crane
      const rv = roverD(false, true); rv.position.y = -M20_BUD - M20_DECK; g.add(rv);
      // three bridles from the bridle device down to the rover's deck, and the umbilical beside them; the rover's wheels
      // unfold a second after it starts down
      const lines = [[0.55, 0.45, 0.012], [-0.55, 0.45, 0.012], [0, -0.62, 0.012], [0.16, 0.05, 0.022]].map(([x, z, w]) => {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(w, w, 1, 6), mat(w > 0.015 ? '#3b3d41' : '#d9d4c6', 'fabric')); l.visible = false; g.add(l);
        return { l, a: new THREE.Vector3(x * 0.25, -M20_BUD, z * 0.25), x, z };
      });
      const b = new THREE.Vector3();
      if (flags.skyT != null) g.userData.animate = t => {
        const s = t - flags.skyT, d = M20_BRIDLE * smoothstep(clamp(s / 6.5, 0, 1)); rv.position.y = -M20_BUD - M20_DECK - d;
        if (rv.userData.mobility) rv.userData.mobility(smoothstep(clamp((s - 1) / 2.5, 0, 1)));
        for (const L of lines) {
          b.set(L.x, rv.position.y + M20_DECK, L.z); const n = b.distanceTo(L.a); L.l.visible = d > 0.02;
          L.l.position.copy(L.a).add(b).multiplyScalar(0.5); L.l.scale.y = n; L.l.quaternion.setFromUnitVectors(M20_UP, b.sub(L.a).normalize());
        }
      };
      g.userData.yc0 = 0; len = 1;
    }
  }
  g.userData.len = g.userData.len || len;
  return { inner: g, mounts };
}
