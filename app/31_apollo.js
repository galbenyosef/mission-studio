// ============================================================================
// Apollo command and service modules (metres, +Y along the stack, Y = 0 at the module's base).
// Command module: 3.91 m across, 3.23 m tall with its heat shield (3.48 m with the docking probe). Y = 0 at the toroidal
// shoulder where the aft heat shield (a 4.69 m-radius dome, 0.43 m deep) meets the 33° cone; the docking ring on top is
// CM_TOP up. The cone is covered in silver Mylar tape; five windows (two forward-looking rendezvous windows, two side
// windows, one in the hatch), the side hatch and the RCS thrusters. On the pad the boost protective cover and the launch
// escape tower sit on it. Service module: 3.91 m across, 4.52 m from its aft bulkhead to the CM's shoulder (a 3.94 m
// cylinder and the 0.58 m forward fairing with its eight radiators); four RCS quads, the two large radiator panels, the
// high-gain antenna at the aft end and the SPS engine, whose 2.5 m bell reaches 2.97 m below.
// ============================================================================
const CM_TOP = 2.80; // m above the shoulder: the top of the docking ring (where the LM's drogue meets it)
const SM_LEN = 4.52, SM_CYL = 3.94; // m: aft bulkhead to the CM's shoulder, and to the top of the cylinder (the fairing above)
const APOLLO = {};
// crinkled foil, Mylar or Kapton: a colour map and a matching normal map (a height field of soft creases), cached
function foilTex(base, hi, lo, seed = 1, w = 256, creases = 420) {
  const key = 'tex' + base + hi + lo + seed + w; if (APOLLO[key]) return APOLLO[key];
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const H = new Float32Array(w * w);
  for (let n = 0; n < creases; n++) {
    const x0 = rnd() * w, y0 = rnd() * w, ang = rnd() * Math.PI, len = 10 + rnd() * w * 0.22, amp = (rnd() - 0.5) * 2, wid = 1 + rnd() * 4, dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = -len / 2; t < len / 2; t += 1) { const cx = x0 + dx * t, cy = y0 + dy * t;
      for (let o = -wid; o <= wid; o++) { const px = Math.round(cx - dy * o), py = Math.round(cy + dx * o); H[((py % w) + w) % w * w + ((px % w) + w) % w] += amp * (1 - Math.abs(o) / (wid + 1)) * 0.12; } }
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = w; return c; };
  const col = mk(), nor = mk(), g = col.getContext('2d'), gn = nor.getContext('2d'), img = g.createImageData(w, w), imn = gn.createImageData(w, w);
  const cB = new THREE.Color(base), cH = new THREE.Color(hi), cL = new THREE.Color(lo), c = new THREE.Color();
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, hx = H[y * w + (x + 1) % w] - H[y * w + (x + w - 1) % w], hy = H[((y + 1) % w) * w + x] - H[((y + w - 1) % w) * w + x];
    const sh = clamp(0.5 + hx * 1.6 - hy * 0.8, 0, 1); if (sh > 0.5) c.copy(cB).lerp(cH, (sh - 0.5) * 2); else c.copy(cL).lerp(cB, sh * 2);
    img.data[4 * k] = c.r * 255; img.data[4 * k + 1] = c.g * 255; img.data[4 * k + 2] = c.b * 255; img.data[4 * k + 3] = 255;
    const nx = -hx * 3, ny = -hy * 3, nl = Math.hypot(nx, ny, 1);
    imn.data[4 * k] = (nx / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 1] = (ny / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 2] = (1 / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 3] = 255;
  }
  g.putImageData(img, 0, 0); gn.putImageData(imn, 0, 0);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const nmap = new THREE.CanvasTexture(nor); nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping;
  return (APOLLO[key] = { map, nmap });
}
// foil materials: 'mylar' (the CM's silver tape), 'gold', 'amber' (Kapton), 'black'; repeat: tiles per UV unit
function foilMat(kind, repeat = 1) {
  const key = 'mat' + kind + repeat; if (APOLLO[key]) return APOLLO[key];
  const T = { mylar: ['#c9ccd1', '#f4f6f8', '#7c8086', 2], gold: ['#d6a43a', '#f8e08c', '#7c5516', 3], amber: ['#c8862c', '#efbb5c', '#6a3f10', 5], black: ['#1d1e21', '#55575c', '#060607', 7] }[kind];
  const t = foilTex(T[0], T[1], T[2], T[3]), map = t.map.clone(), nmap = t.nmap.clone(); map.repeat.set(repeat, repeat); nmap.repeat.set(repeat, repeat); map.needsUpdate = nmap.needsUpdate = true;
  const p = { mylar: [0.3, 0.55], gold: [0.34, 0.7], amber: [0.38, 0.6], black: [0.6, 0.15] }[kind];
  return (APOLLO[key] = new THREE.MeshStandardMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: p[0], metalness: p[1] }));
}
// the service module's skin: aluminium panels, the two large radiator panels and the panel seams, wrapped around once
function smSkinMat() {
  if (APOLLO.smSkin) return APOLLO.smSkin;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#c6cacf'; g.fillRect(0, 0, 1024, 512);
  for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; g.fillRect(k * 1024 / 6, 0, 1024 / 6, 512); } // six bays
  g.fillStyle = '#eef0f2'; for (const x0 of [96, 608]) g.fillRect(x0, 60, 210, 330); // the ECS/EPS radiator panels (white), on opposite sides
  g.strokeStyle = 'rgba(160,166,172,0.9)'; g.lineWidth = 2; for (const x0 of [96, 608]) for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(x0 + i * 21, 62); g.lineTo(x0 + i * 21, 388); g.stroke(); } // radiator tubes
  g.strokeStyle = 'rgba(40,44,48,0.55)'; g.lineWidth = 2; for (let k = 0; k <= 6; k++) { const x = k * 1024 / 6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); } // bay seams
  for (const y of [40, 470]) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.fillStyle = 'rgba(30,32,36,0.8)'; for (let k = 0; k < 220; k++) g.fillRect((k * 197) % 1024, 40 + ((k * 89) % 430), 2, 2); // fasteners
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (APOLLO.smSkin = new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.45 }));
}
function lathe(pts, m, seg = 48) { return new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg), m); }
// a flat patch on the CM's cone (half-angle 32.7°, radius 1.91 m at y = 0.16): azimuth a from +Z, centred at height y
const CM_CONE = { r0: 1.91, y0: 0.16, tan: Math.tan(32.7 * DEG) };
function cmConePatch(shape, a, y, m, lift = 0.012) {
  const r = CM_CONE.r0 - (y - CM_CONE.y0) * CM_CONE.tan, th = 32.7 * DEG;
  const n = new THREE.Vector3(Math.cos(th) * Math.sin(a), Math.sin(th), Math.cos(th) * Math.cos(a)), t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), b = new THREE.Vector3().crossVectors(n, t);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), m); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, b, n));
  mesh.position.set(Math.sin(a) * r, y, Math.cos(a) * r).addScaledVector(n, lift); return mesh;
}
const rectShape = (w, h, rr = 0.03) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + rr, y); s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr); s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr); s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y); return s; };
function apolloCM(withLES, probe = !withLES) {
  const g = new THREE.Group();
  // aft heat shield (ablator) and the toroidal shoulder
  const hs = []; for (let i = 0; i <= 10; i++) { const r = 1.93 * i / 10; hs.push([r, -0.43 + (4.69 - Math.sqrt(4.69 * 4.69 - r * r))]); }
  hs.push([1.955, 0.0], [1.95, 0.07]);
  g.add(lathe(hs, mat('#4a3424', 'dark')));
  g.add(lathe([[1.95, 0.07], [1.935, 0.12], [1.91, 0.16]], mat('#4a3424', 'dark')));
  // the cone in silver Mylar tape, the forward heat shield, the docking tunnel and ring, the probe
  const coneTop = CM_CONE.y0 + (CM_CONE.r0 - 0.6) / CM_CONE.tan; // r 0.6
  g.add(lathe([[1.91, 0.16], [0.6, coneTop]], foilMat('mylar', 3)));
  g.add(lathe([[0.6, coneTop], [0.55, coneTop + 0.12], [0.46, coneTop + 0.22], [0.42, coneTop + 0.26]], foilMat('mylar', 1)));
  g.add(lathe([[0.42, coneTop + 0.26], [0.42, CM_TOP - 0.1], [0.47, CM_TOP - 0.1], [0.47, CM_TOP], [0.3, CM_TOP]], mat('#b9bec4', 'metal')));
  if (probe) { g.add(lmRodA([0, CM_TOP - 0.2, 0], [0, CM_TOP + 0.25, 0], 0.05, mat('#cfd3d8', 'metal'))); const tip = cyl(0.09, 0.02, 0.08, mat('#cfd3d8', 'metal'), 12); tip.position.y = CM_TOP + 0.25; g.add(tip); }
  // windows: two rendezvous windows looking forward, two side windows, one in the hatch; the hatch and its outline
  const glass = mat('#06080b', 'glass'), frame = mat('#2a2c30', 'dark');
  for (const s of [-1, 1]) { g.add(cmConePatch(rectShape(0.3, 0.36, 0.05), s * 0.42, 1.78, frame, 0.008)); g.add(cmConePatch(rectShape(0.22, 0.28, 0.04), s * 0.42, 1.78, glass, 0.014)); }
  for (const s of [-1, 1]) { g.add(cmConePatch(rectShape(0.4, 0.4, 0.06), s * Math.PI / 2, 1.05, frame, 0.008)); g.add(cmConePatch(rectShape(0.3, 0.3, 0.05), s * Math.PI / 2, 1.05, glass, 0.014)); }
  g.add(cmConePatch(rectShape(0.95, 1.05, 0.08), 0, 0.95, mat('#aeb3b9', 'metal'), 0.006)); // hatch
  g.add(cmConePatch(rectShape(0.24, 0.24, 0.04), 0, 1.15, glass, 0.012));
  // RCS thruster ports (pitch, yaw and roll pairs) as dark recesses
  const port = mat('#1a1b1e', 'dark');
  for (const [a, y] of [[0.2, 2.05], [-0.2, 2.05], [Math.PI + 0.2, 2.05], [Math.PI - 0.2, 2.05], [Math.PI / 2 + 0.25, 0.42], [Math.PI / 2 - 0.25, 0.42], [-Math.PI / 2 + 0.25, 0.42], [-Math.PI / 2 - 0.25, 0.42], [Math.PI + 0.6, 1.45], [Math.PI - 0.6, 1.45]])
    g.add(cmConePatch(rectShape(0.13, 0.13, 0.03), a, y, port, 0.01));
  let len = CM_TOP;
  if (withLES) { const les = apolloLES(); g.add(les); len = les.userData.top; }
  g.userData.len = len; g.userData.r = 1.96; return g;
}
// The launch escape system on the pad: the boost protective cover over the CM (white, one window left open), the tower
// (a four-legged truss, red), the escape motor with its four canted nozzles, the pitch-control motor and canard section,
// and the nose cone with the Q-ball. 10.2 m from the tower's base to the tip.
function apolloLES() {
  const g = new THREE.Group(), white = mat('#ecebe6', 'paint'), red = mat('#c4441f', 'paint'), black = mat('#151517', 'dark');
  const bpcTop = CM_TOP + 0.08; // the cover closes over the docking tunnel; the tower stands on it
  const coneTopR = 0.62, coneTopY = CM_CONE.y0 + (CM_CONE.r0 + 0.07 - coneTopR) / CM_CONE.tan;
  g.add(lathe([[1.99, 0.02], [1.98, 0.16], [coneTopR, coneTopY], [0.56, bpcTop - 0.06], [0.5, bpcTop], [0, bpcTop]], white));
  g.add(cmConePatch(rectShape(0.26, 0.32, 0.04), 0.42, 1.78, mat('#06080b', 'glass'), 0.068)); // the commander's window, uncovered
  const t0 = bpcTop, t1 = t0 + 3.0, rb = 0.62, rt = 0.36;
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, a2 = a + Math.PI / 2;
    g.add(lmRodA([Math.cos(a) * rb, t0, Math.sin(a) * rb], [Math.cos(a) * rt, t1, Math.sin(a) * rt], 0.06, red));
    for (const [y0, y1] of [[t0, t0 + 1.5], [t0 + 1.5, t1]]) { const r0 = rb + (rt - rb) * (y0 - t0) / 3, r1 = rb + (rt - rb) * (y1 - t0) / 3;
      g.add(lmRodA([Math.cos(a) * r0, y0, Math.sin(a) * r0], [Math.cos(a2) * r1, y1, Math.sin(a2) * r1], 0.03, red)); } }
  const m0 = t1;
  g.add(lathe([[0.36, m0 - 0.05], [0.42, m0 + 0.15], [0.33, m0 + 0.4]], black)); // nozzle skirt
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, b = bell(0.5, 0.17, black); b.position.set(Math.cos(a) * 0.3, m0 + 0.25, Math.sin(a) * 0.3); b.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(b); }
  const motor = cyl(0.33, 0.33, 4.3, white, 32); motor.position.y = m0 + 0.4; g.add(motor);
  const band = cyl(0.335, 0.335, 0.25, black, 32); band.position.y = m0 + 3.2; g.add(band);
  const can = cyl(0.33, 0.27, 1.1, white, 32); can.position.y = m0 + 4.7; g.add(can);
  for (const s of [-1, 1]) { const c = box(0.03, 0.6, 0.45, white); c.position.set(s * 0.42, m0 + 5.0, 0); g.add(c); } // canards (folded)
  const nose = lathe([[0.27, 0], [0.22, 0.45], [0.12, 0.9], [0.05, 1.05], [0, 1.1]], black); nose.position.y = m0 + 5.8; g.add(nose);
  g.userData.top = m0 + 6.9; return g;
}
function lmRodA(p0, p1, r, m) { // a cylinder between two points
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return mesh;
}
function apolloSM(damaged, stowed = false) { // stowed: on the launch pad, the high-gain antenna folded inside the adapter
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.955, 1.955, SM_CYL, 64, 1, true), smSkinMat()); body.geometry.translate(0, SM_CYL / 2, 0); g.add(body);
  const aft = new THREE.Mesh(new THREE.CircleGeometry(1.955, 64), mat('#3a3c40', 'dark')); aft.rotation.x = Math.PI / 2; g.add(aft); // aft bulkhead
  const fwd = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), mat('#5d6166', 'metal')); fwd.rotation.x = -Math.PI / 2; fwd.position.y = SM_CYL; g.add(fwd); // forward bulkhead, under the CM
  const fair = new THREE.Mesh(new THREE.CylinderGeometry(1.955, 1.955, SM_LEN - SM_CYL, 64, 1, true), fairingMat()); fair.geometry.translate(0, (SM_CYL + SM_LEN) / 2, 0); g.add(fair); // the forward fairing
  const ring = cyl(1.968, 1.968, 0.05, mat('#9ca1a8', 'metal'), 64); ring.position.y = SM_CYL - 0.025; g.add(ring); // the seam below the fairing
  // four RCS quads: a housing on the skin with four nozzles (up, down and both ways round)
  const noz = mat('#2a2622', 'metal', { side: THREE.DoubleSide }), housing = mat('#d8dadd', 'metal');
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 7.25 * DEG, ux = Math.sin(a), uz = Math.cos(a), q = new THREE.Group(); q.position.set(ux * 2.02, 2.95, uz * 2.02); q.rotation.y = a; g.add(q);
    const h = box(0.55, 0.62, 0.16, housing); h.position.y = -0.31; q.add(h);
    for (const d of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]) { const b = bell(0.24, 0.09, noz); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d)); b.position.set(d[0] * 0.28, d[1] * 0.31, 0.12); q.add(b); }
  }
  // the high-gain antenna on its boom at the aft end: four dishes round a wide-beam horn
  if (!stowed) { const a = Math.PI * 1.25, ux = Math.sin(a), uz = Math.cos(a), dishM = mat('#e9e9e6', 'paint', { side: THREE.DoubleSide });
    const p0 = [ux * 1.9, 0.35, uz * 1.9], p1 = [ux * 2.9, -0.55, uz * 2.9]; g.add(lmRodA(p0, p1, 0.06, mat('#9aa0a6', 'metal')));
    const hg = new THREE.Group(); hg.position.set(...p1); hg.rotation.y = a; hg.rotation.x = 0.6; g.add(hg);
    for (const [x, y] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 6, 0, TAU, 0, Math.PI / 5), dishM); d.rotation.x = -Math.PI / 2; d.position.set(x, y, 0.15); hg.add(d); }
    const horn = cyl(0.12, 0.05, 0.3, dishM, 12); horn.rotation.x = -Math.PI / 2; hg.add(horn); }
  // the SPS engine: the combustion chamber and nozzle throat (dark) and the radiation-cooled extension (lighter)
  { const L = 2.97, R = 1.25, prof = [[R * 0.34, L], [R * 0.3, L * 0.9], [R * 0.48, L * 0.65], [R * 0.72, L * 0.35], [R, 0]].map(p => [p[0], p[1] - L]);
    const split = 2; g.add(lathe(prof.slice(0, split + 1), mat('#2b2c2f', 'dark', { side: THREE.DoubleSide }), 32)); g.add(lathe(prof.slice(split), mat('#8b9097', 'metal', { side: THREE.DoubleSide }), 32)); }
  if (damaged) { // Apollo 13: the outer panel of bay 4 blown away, the bay's shelves and tanks exposed
    const a = 0.8, hole = cmlessPanel(1.6, 3.1, a, 1.75, mat('#2a1d12', 'dark')); g.add(hole);
    for (let k = 0; k < 7; k++) { const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.25 + 0.1 * (k % 3), 0.05), new THREE.Vector2(0.1, 0.3)]); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat('#9aa0a6', 'metal', { side: THREE.DoubleSide })); m.position.set(Math.sin(a + (k % 2 ? 0.42 : -0.42)) * 1.98, 0.4 + k * 0.42, Math.cos(a + (k % 2 ? 0.42 : -0.42)) * 1.98); m.rotation.y = a; g.add(m); }
  }
  g.userData.len = SM_LEN; g.userData.engineY = -2.97; g.userData.engineR = 1.25; return g;
}
// the forward fairing: eight electrical-power radiators (white, with their tubes) between narrow aluminium strips
function fairingMat() {
  if (APOLLO.fairing) return APOLLO.fairing;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#b9bec4'; g.fillRect(0, 0, 1024, 64);
  for (let k = 0; k < 8; k++) { const x0 = k * 128 + 10; g.fillStyle = '#eceef0'; g.fillRect(x0, 6, 108, 52); g.strokeStyle = 'rgba(150,156,162,0.9)'; g.lineWidth = 1.5; for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(x0 + i * 12, 8); g.lineTo(x0 + i * 12, 56); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (APOLLO.fairing = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.35 }));
}
// a dark, recessed panel on the service module's cylinder (azimuth a from +Z, centred at height y)
function cmlessPanel(w, h, a, y, m) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(Math.sin(a) * 1.96, y, Math.cos(a) * 1.96); p.rotation.y = a; return p; }
