// ============================================================================
// The Hubble Space Telescope as it was launched in 1990 (STS-31). Sizes from the HST media reference guide: the aft shroud,
// 4.3 m across and 3.5 m long, closed by the flat aft bulkhead; the equipment section, a ring of twelve bays as wide as the
// shroud and 1.1 m long, round the primary mirror; the forward shell and the light shield, 3.05 m across and 4 m long
// each; the aperture door, 3 m across, which opens 105°. Most of the outside is blanketed: aluminised Teflon over the
// forward shell and light shield, a quilt of blankets with the shell's reinforcing rings showing as bands; silvered tape on
// the aft shroud and the bays' doors. Yellow handrails run round it and along it; four magnetic torquers lie along the
// forward shell, 90° apart.
// The first solar arrays, ESA's: two "double roll-out" wings 12.1 m long and 2.5 m wide, each a pair of blankets rolled out
// both ways from a drum along two booms, the drum on a 1.2 m mast from the aft end of the forward shell; stowed, mast and
// drum lie folded forward along the forward shell. Two high-gain antennas, dishes on masts, stowed along the light shield
// and the forward shell.
// +Y toward the aperture; origin at the middle of the 13.2 m body; the arrays on ±X, the antennas and the grapple fixture
// (on the equipment section) on ±Z.
// ============================================================================
const HST = { mats: {}, aft: -6.6, es: -3.1, fwd: -2.0, door: 6.45, R: 2.15, r: 1.53 };
function hstCanvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
let hstSeed = 3; const hstRnd = () => (hstSeed = (hstSeed * 9301 + 49297) % 233280) / 233280;
// the blankets over the forward shell and light shield (8.45 m, the map's height, from the shell's aft end): panels about
// 1.2 m round and 1.4 m along, each a slightly different silver, with darker seams; the shell's rings as bands under them
function hstBlanketMat() {
  if (HST.mats.mli) return HST.mats.mli;
  const L = HST.door - HST.fwd, C = TAU * HST.r;
  const tex = hstCanvas(1024, 1024, (g, W, H) => {
    hstSeed = 5; g.fillStyle = '#dcdee1'; g.fillRect(0, 0, W, H);
    const nu = Math.round(C / 1.2), nv = Math.round(L / 1.4);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const v = 216 + Math.floor(hstRnd() * 22); g.fillStyle = `rgb(${v},${v + 2},${v + 4})`; g.fillRect(i / nu * W + 2, j / nv * H + 2, W / nu - 4, H / nv - 4); }
    for (let k = 0; k < 2600; k++) { g.fillStyle = hstRnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,64,70,0.07)'; g.fillRect(hstRnd() * W, hstRnd() * H, 2 + hstRnd() * 14, 1 + hstRnd() * 3); } // creases
    g.fillStyle = 'rgba(120,124,130,0.35)'; for (let y = 0.4; y < 4.0; y += 0.8) g.fillRect(0, (1 - y / L) * H - 3, W, 6); // the forward shell's rings
    g.strokeStyle = 'rgba(95,98,104,0.8)'; g.lineWidth = 2;
    for (let i = 0; i <= nu; i++) { g.beginPath(); g.moveTo(i / nu * W, 0); g.lineTo(i / nu * W, H); g.stroke(); }
    for (let j = 0; j <= nv; j++) { g.beginPath(); g.moveTo(0, j / nv * H); g.lineTo(W, j / nv * H); g.stroke(); }
  });
  return (HST.mats.mli = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.3 }));
}
// the aft shroud's silvered tape: sixteen panels between its longerons, the doors to the instruments
function hstShroudMat() {
  if (HST.mats.shroud) return HST.mats.shroud;
  const tex = hstCanvas(1024, 512, (g, W, H) => {
    hstSeed = 9; g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) { const v = 188 + Math.floor(hstRnd() * 26); g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(i / 16 * W + 4, 0, W / 16 - 8, H); }
    for (let k = 0; k < 1600; k++) { g.fillStyle = hstRnd() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(40,44,50,0.06)'; g.fillRect(hstRnd() * W, hstRnd() * H, 2 + hstRnd() * 10, 1 + hstRnd() * 2); }
    g.fillStyle = '#7d8187'; for (let i = 0; i <= 16; i++) g.fillRect(i / 16 * W - 4, 0, 8, H); // longerons
    g.strokeStyle = 'rgba(80,84,90,0.9)'; g.lineWidth = 3; for (const [u, w, v0, v1] of [[0.06, 0.1, 0.12, 0.85], [0.31, 0.1, 0.12, 0.85], [0.56, 0.1, 0.12, 0.85], [0.81, 0.1, 0.12, 0.85]]) g.strokeRect(u * W, v0 * H, w * W, (v1 - v0) * H); // instrument doors
  });
  return (HST.mats.shroud = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.28, metalness: 0.7 }));
}
// a solar array blanket: dark blue cells with silver bus bars on the face, the brown Kapton behind
function hstCellMat(back) {
  const k = back ? 'kapton' : 'cells'; if (HST.mats[k]) return HST.mats[k];
  const tex = hstCanvas(256, 1024, (g, W, H) => {
    hstSeed = back ? 13 : 17; g.fillStyle = back ? '#7a5631' : '#1a2140'; g.fillRect(0, 0, W, H);
    if (back) { g.strokeStyle = 'rgba(40,26,12,0.5)'; for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } return; }
    for (let x = 0; x < W; x += 16) for (let y = 0; y < H; y += 12) { const v = 22 + hstRnd() * 10; g.fillStyle = `rgb(${v},${v + 8},${v + 40})`; g.fillRect(x + 1, y + 1, 14, 10); }
    g.fillStyle = '#9da3ad'; for (let y = 0; y < H; y += 96) g.fillRect(0, y, W, 3); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
  });
  tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 6);
  return (HST.mats[k] = new THREE.MeshStandardMaterial({ map: tex, roughness: back ? 0.6 : 0.35, metalness: back ? 0.3 : 0.4 }));
}
const hstYellow = () => mat('#e2b33a', 'paint'), hstSilver = () => mat('#cfd3d8', 'metal');
// one solar array wing in its mast's frame: the mast along +X from the drive, the drum and the blanket beyond it, the
// blanket rolled out both ways along ±Y. userData.unroll(u): u from 0 (rolled up on the drum) to 1.
function hstWing() {
  const g = new THREE.Group(), mastL = 1.2, drumL = 2.5, x0 = mastL + 0.05, xc = x0 + drumL / 2, half = 6.05;
  const mast = cyl(0.07, 0.07, mastL, hstSilver(), 10); mast.rotation.z = -Math.PI / 2; g.add(mast);
  const drive = cyl(0.16, 0.16, 0.2, mat('#8d9298', 'metal'), 14); drive.rotation.z = -Math.PI / 2; g.add(drive);
  const drum = cyl(0.13, 0.13, drumL, mat('#b9bec4', 'metal'), 16); drum.rotation.z = -Math.PI / 2; drum.position.x = x0; g.add(drum);
  const bl = new THREE.Group(); bl.position.x = xc; g.add(bl); // the blankets, in the plane of X and Y: the cells face +Z
  const face = new THREE.Mesh(new THREE.PlaneGeometry(drumL - 0.1, 2 * half), hstCellMat(false)); face.position.z = 0.006; bl.add(face);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(drumL - 0.1, 2 * half), hstCellMat(true)); back.rotation.y = Math.PI; back.position.z = -0.006; bl.add(back);
  const booms = [], spread = [];
  for (const s of [-1, 1]) for (const e of [-1, 1]) { const b = cyl(0.025, 0.025, half, hstSilver(), 6); b.position.set(xc + e * (drumL / 2 - 0.04), 0, 0); b.rotation.x = s > 0 ? 0 : Math.PI; g.add(b); booms.push(b); }
  for (const s of [-1, 1]) { const sb = cyl(0.03, 0.03, drumL, mat('#9ca1a7', 'metal'), 6); sb.rotation.z = -Math.PI / 2; sb.position.set(x0, s * half, 0); g.add(sb); spread.push({ sb, s }); }
  g.userData.unroll = u => { const f = 0.012 + 0.988 * u; bl.scale.y = f; bl.visible = u > 0.002; for (const b of booms) b.scale.y = Math.max(f, 0.01); for (const { sb, s } of spread) sb.position.y = s * half * f; };
  g.userData.unroll(1); return g;
}
// a high-gain antenna on its mast, along +Z from the hinge, the dish on its gimbal at the end (userData.dish: facing out
// along the mast; turned 90° about X it lies flat against the body when the mast is stowed)
function hstAntenna() {
  const g = new THREE.Group(), L = 4.0, dg = new THREE.Group(); dg.position.z = L; g.add(dg);
  const m = cyl(0.06, 0.06, L, hstSilver(), 8); m.rotation.x = Math.PI / 2; g.add(m);
  const gim = box(0.3, 0.25, 0.3, mat('#8d9298', 'metal')); gim.position.y = -0.12; dg.add(gim);
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 8, 0, TAU, 0, 0.88), mat('#e8e9ea', 'paint', { side: THREE.DoubleSide })); d.rotation.x = -Math.PI / 2; d.position.z = 0.95; dg.add(d); // 1.3 m across
  const feed = cyl(0.04, 0.04, 0.5, mat('#6d7177', 'metal'), 8); feed.rotation.x = Math.PI / 2; feed.position.z = 0.25; dg.add(feed);
  g.userData.dish = dg; return g;
}
function hubbleModel(flags = {}) {
  const g = new THREE.Group(), H = HST, dark = mat('#141517', 'dark', { side: THREE.DoubleSide });
  // aft bulkhead and shroud, the ring of bays, the forward shell and light shield in their blankets
  const shroud = cyl(H.R, H.R, H.es - H.aft, hstShroudMat(), 48, true); shroud.position.y = H.aft; g.add(shroud);
  const bulk = new THREE.Mesh(new THREE.CircleGeometry(H.R, 48), mat('#b8bcc1', 'metal')); bulk.rotation.x = Math.PI / 2; bulk.position.y = H.aft; g.add(bulk);
  for (let k = 0; k < 3; k++) { const b = box(0.12, 0.08, H.R * 1.9, mat('#8b9096', 'metal')); b.rotation.y = k * TAU / 3; b.position.y = H.aft - 0.08; g.add(b); } // its radial beams
  const bays = new THREE.Mesh(new THREE.CylinderGeometry(H.R, H.R, H.fwd - H.es, 12, 1, true), mat('#c3c7cc', 'metal', { flatShading: true })); bays.position.y = (H.es + H.fwd) / 2; bays.rotation.y = TAU / 24; g.add(bays);
  for (let k = 0; k < 12; k++) { const a = k * TAU / 12, d = box(0.9, 0.85, 0.02, mat('#d8dbdf', 'metal')); d.position.set(Math.sin(a) * H.R * 0.985, H.es + 0.12, Math.cos(a) * H.R * 0.985); d.rotation.y = a; g.add(d); // the bays' doors
    const hd = box(0.5, 0.04, 0.04, hstYellow()); hd.position.set(Math.sin(a) * (H.R + 0.05), H.es + 0.55, Math.cos(a) * (H.R + 0.05)); hd.rotation.y = a; g.add(hd); }
  const step = new THREE.Mesh(new THREE.RingGeometry(H.r, H.R, 48), mat('#a4a9af', 'paint', { side: THREE.DoubleSide, roughness: 0.7 })); step.rotation.x = -Math.PI / 2; step.position.y = H.fwd; g.add(step); // the bays' forward face, blanketed
  const tube = cyl(H.r, H.r, H.door - H.fwd, hstBlanketMat(), 48, true); tube.position.y = H.fwd; g.add(tube);
  const rim = cyl(H.r + 0.03, H.r + 0.03, 0.12, mat('#9ea3a9', 'metal'), 48, true); rim.position.y = H.door - 0.12; g.add(rim);
  // inside the aperture: the dark light shield and its baffles, the secondary mirror's spider far down
  const inside = cyl(H.r - 0.02, H.r - 0.02, 3.0, dark, 32, true); inside.position.y = H.door - 3.0; g.add(inside);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.RingGeometry(H.r - 0.22, H.r - 0.02, 32), dark); b.rotation.x = -Math.PI / 2; b.position.y = H.door - 0.4 - k * 0.7; g.add(b); }
  const ap = new THREE.Mesh(new THREE.CircleGeometry(H.r - 0.02, 32), mat('#050506', 'dark')); ap.rotation.x = -Math.PI / 2; ap.position.y = H.door - 3.0; g.add(ap);
  // the aperture door, hinged at +Z
  const dg = new THREE.Group(); dg.position.set(0, H.door + 0.06, H.r); g.add(dg);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.1, 40), mat('#dfe2e5', 'metal')); door.position.set(0, 0, -H.r); dg.add(door);
  const hinge = cyl(0.08, 0.08, 0.6, mat('#8f949a', 'metal'), 10); hinge.rotation.z = Math.PI / 2; hinge.position.set(-0.3, 0, 0); dg.add(hinge);
  if (flags.doorT != null) g.userData.animate = t => { dg.rotation.x = 105 * DEG * smoothstep(clamp((t - flags.doorT) / 60, 0, 1)); }; // up and over, forward
  else if (flags.door) dg.rotation.x = 105 * DEG;
  // handrails: rings round the light shield and the shroud, rails along them; the magnetic torquers; sun sensors; the
  // low-gain antennas; trunnions; the grapple fixture
  for (const y of [3.2, 5.6]) { const t = new THREE.Mesh(new THREE.TorusGeometry(H.r + 0.1, 0.018, 6, 64), hstYellow()); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
  for (const y of [H.aft + 0.4]) { const t = new THREE.Mesh(new THREE.TorusGeometry(H.R + 0.1, 0.02, 6, 64), hstYellow()); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * TAU / 8, r = cyl(0.02, 0.02, 2.8, hstYellow(), 6); r.position.set(Math.sin(a) * (H.R + 0.1), H.aft + 0.4, Math.cos(a) * (H.R + 0.1)); g.add(r); }
  for (const a of [0.6, 2.2, 3.8, 5.3]) { const r = cyl(0.018, 0.018, 3.4, hstYellow(), 6); r.position.set(Math.sin(a) * (H.r + 0.1), 2.2, Math.cos(a) * (H.r + 0.1)); g.add(r); }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, m = box(0.1, 2.5, 0.1, mat('#5b5f65', 'metal')); m.position.set(Math.sin(a) * (H.r + 0.14), -0.6, Math.cos(a) * (H.r + 0.14)); g.add(m); }
  for (const x of [-0.45, 0.45]) { const s = box(0.16, 0.12, 0.12, mat('#2c2e32', 'dark')); s.position.set(x, H.door - 0.3, H.r + 0.06); g.add(s); }
  for (const [y, z, up] of [[H.door - 1.0, -(H.r + 0.05), 0], [H.aft - 0.05, -1.2, 1]]) { const c = cyl(0.12, 0.02, 0.3, mat('#d9d9d4', 'paint'), 12); if (up) { c.rotation.x = Math.PI; c.position.set(0.6, y, z); } else { c.rotation.x = -Math.PI / 2; c.position.set(0, y, z); } g.add(c); }
  for (const s of [-1, 1]) { const tr = cyl(0.1, 0.1, 0.45, hstSilver(), 10); tr.rotation.z = Math.PI / 2; tr.position.set(s * (H.R + 0.22), H.es + 0.3, 0); g.add(tr); } // aft trunnions
  const keel = cyl(0.1, 0.1, 0.4, hstSilver(), 10); keel.rotation.x = Math.PI / 2; keel.position.set(0, -0.2, -(H.r + 0.2)); g.add(keel);
  const fix = cyl(0.25, 0.25, 0.15, mat('#e0e0e0', 'metal'), 12); fix.rotation.x = Math.PI / 2; fix.position.set(0, -3.0, H.R + 0.07); g.add(fix); // grapple fixture
  const pin = cyl(0.04, 0.04, 0.3, mat('#d0d0d0', 'metal'), 8); pin.rotation.x = Math.PI / 2; pin.position.set(0, -3.0, H.R + 0.27); g.add(pin);
  // the solar array wings (±X) and the high-gain antennas (±Z), from the aft end of the forward shell
  const wings = [-1, 1].map(s => { const piv = new THREE.Group(); piv.position.set(s * (H.r + 0.12), H.fwd + 0.15, 0); g.add(piv);
    const w = hstWing(); if (s < 0) w.rotation.z = Math.PI; piv.add(w); return { piv, w, s }; }); // (both wings' cells face +Z)
  const ants = [-1, 1].map(s => { const piv = new THREE.Group(); piv.position.set(0, H.fwd + 0.3, s * (H.r + 0.15)); g.add(piv);
    const a = hstAntenna(); if (s < 0) a.rotation.y = Math.PI; piv.add(a); return { piv, s, dish: a.userData.dish }; });
  // f: 0 stowed (masts and drums folded forward along the forward shell, the blankets rolled up; the antenna masts along the
  // shell and light shield, dishes forward), 1 deployed. Wings swing out to f 0.25 and unroll to f 1; antennas out by f 0.4.
  const pose = f => {
    const sw = smoothstep(clamp(f / 0.25, 0, 1)), un = smoothstep(clamp((f - 0.25) / 0.75, 0, 1)), bm = smoothstep(clamp(f / 0.4, 0, 1));
    for (const { piv, w, s } of wings) { piv.rotation.z = s * Math.PI / 2 * (1 - sw); w.userData.unroll(un); }
    for (const { piv, s, dish } of ants) { piv.rotation.x = -s * Math.PI / 2 * (1 - bm); dish.rotation.x = Math.PI / 2 * (1 - bm); }
  };
  if (flags.arrays && flags.deployable) g.userData.deploy = pose;
  pose(flags.arrays ? (flags.deployable ? 0 : 1) : 0);
  g.userData.len = 13.2; g.userData.yc0 = 0; return g;
}
