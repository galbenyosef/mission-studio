// ============================================================================
// Europa Clipper (2024), metres, y = 0 at the foot of the propulsion module. Published (NASA/JPL press kit): the
// propulsion module is an aluminium cylinder about 3 m tall and 1.5 m wide, with the propellant tanks inside and 24
// engines of 27.5 N; the electronics vault, an aluminium-zinc box, is bolted on top of it; the high-gain antenna is a
// 3 m dish; the two solar arrays have five panels each and span 14.2 × 4.1 m apiece, about 30.5 m tip to tip; the
// magnetometer boom is 8.5 m long; the radar's four HF antennas, 17.6 m each, extend crosswise from the solar arrays,
// and its eight VHF antennas, 2.76 m each, sit on the arrays; stowed for launch it stands 4.7 m tall, 3 m wide and 4 m
// deep. The arrays opened within hours of launch, the boom and the radar antennas over the weeks after. Where a size is
// not published (the vault's, the yoke's, where the antennas sit on the arrays) it is estimated from photographs.
// Stowed (flags.stowed), the arrays are folded in a stack against the body and the boom and antennas lie along it;
// from flags.deployT (separation from the Falcon Heavy's upper stage) they open out.
// ============================================================================
const CL_PM_R = 0.75, CL_PM_H = 3.0, CL_VAULT = [1.5, 0.9, 1.3], CL_HGA_R = 1.5, CL_ARRAY = [14.2, 4.1], CL_PANELS = 5, CL_MAG = 8.5, CL_HF = 17.6, CL_VHF = 2.76;
// one solar array along +X from its hinge at the body, the cells facing +Z: five panels in an accordion (even panels fold
// toward the body, odd ones away), userData.fold(f) folds them (f = 1 open, 0 stacked); the radar antennas ride on it
function clArray(side) {
  const L = CL_ARRAY[0], W = CL_ARRAY[1], pw = L / CL_PANELS, g = new THREE.Group(), hinges = [], panels = [];
  let parent = g;
  for (let i = 0; i < CL_PANELS; i++) {
    const h = new THREE.Group(); h.position.x = i ? pw : 0; parent.add(h); hinges.push(h);
    const p = twPanel(pw - 0.04, W, 10, 14, '#b9bdc3'); p.position.x = 0.02; h.add(p); panels.push(p);
    parent = h;
  }
  // the radar on the outer panels: the HF antenna, a thin pole 17.6 m long across the array's width, standing a little
  // off its back; the VHF antennas, two flat rectangles 2.76 m long along the array's edges beside it
  const ant = new THREE.Group(); ant.position.set(pw * 3.5, 0, -0.12); hinges[3].add(ant);
  const hf = twBarMesh(0.03, mat('#d9dcdf', 'metal')); twSetBar(hf, [0, -CL_HF / 2, 0], [0, CL_HF / 2, 0]); ant.add(hf);
  for (const y of [-W / 2 - 0.3, W / 2 + 0.3]) { const v = box(CL_VHF, 0.25, 0.04, mat('#2a2c31', 'dark')); v.rotation.x = Math.PI / 2; v.position.set(0, y, 0); ant.add(v); }
  for (const y of [-W / 2, W / 2]) ant.add(m20Bar([0, y * 0.98, 0.12], [0, y * 0.98, 0], 0.015, mat('#9aa0a6', 'metal'))); // its stand-offs
  g.userData.ant = ant; // the antennas are stowed along the array until they deploy (userData.deployAnt)
  g.userData.fold = f => { for (let i = 1; i < CL_PANELS; i++) { hinges[i].rotation.y = (i % 2 ? 1 : -1) * Math.PI * (1 - f); hinges[i].position.z = (i % 2 ? 0.04 : -0.04) * (1 - f); } };
  g.userData.deployAnt = f => { hf.scale.y = Math.max(0.2 + 0.8 * f, 1e-3) * CL_HF; ant.position.z = -0.12 * f - 0.02 * (1 - f); };
  return g;
}
function clipperModel(flags = {}) {
  const g = new THREE.Group(), alu = mat('#b9bdc3', 'metal'), dark = mat('#2a2c31', 'dark'), white = mat('#ecebe6', 'paint');
  // the propulsion module: the lower cylinder in gold blankets, the upper in silver, a ring between; the four engine
  // modules under it (six 27.5 N engines each, drawn as a cluster of small bells on a plate)
  g.add(cyl(CL_PM_R, CL_PM_R, CL_PM_H * 0.55, foilMat('gold', 3), 40));
  const up = cyl(CL_PM_R, CL_PM_R, CL_PM_H * 0.45, foilMat('mylar', 3), 40); up.position.y = CL_PM_H * 0.55; g.add(up);
  const ring = cyl(CL_PM_R + 0.03, CL_PM_R + 0.03, 0.06, alu, 40); ring.position.y = CL_PM_H * 0.55 - 0.03; g.add(ring);
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + TAU / 8, m = new THREE.Group(); m.position.set(Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55); m.rotation.y = a; g.add(m);
    const plate = box(0.34, 0.06, 0.26, alu); plate.position.y = -0.06; m.add(plate);
    for (let i = 0; i < 3; i++) for (const z of [-0.07, 0.07]) { const b = bell(0.12, 0.035, mat('#4a4c50', 'metal', { side: THREE.DoubleSide })); b.rotation.x = Math.PI; b.position.set(-0.1 + i * 0.1, -0.06, z); m.add(b); }
  }
  // the electronics vault on top, its radiator (white) on one face, the small antennas on it; the vault plate
  const vault = box(CL_VAULT[0], CL_VAULT[1], CL_VAULT[2], foilMat('black', 2)); vault.position.y = CL_PM_H; g.add(vault);
  const rad = box(CL_VAULT[0] * 0.8, CL_VAULT[1] * 0.8, 0.03, white); rad.position.set(0, CL_PM_H + 0.09, -CL_VAULT[2] / 2 - 0.015); g.add(rad);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 3), mat('#8a8c90', 'metal')); plate.rotation.z = Math.PI / 2; plate.position.set(CL_VAULT[0] / 2 + 0.005, CL_PM_H + 0.5, 0.2); g.add(plate);
  // the high-gain antenna on top: the 3 m dish on a short pedestal, its feed on a tripod, the sunshade over the rim
  const hga = new THREE.Group(); hga.position.y = CL_PM_H + CL_VAULT[1]; g.add(hga);
  const ped = cyl(0.3, 0.3, 0.25, alu, 24); hga.add(ped);
  const d = twDish(CL_HGA_R, 0.38, mat('#f2f2ee', 'paint', { side: THREE.DoubleSide })); d.position.y = 0.25; hga.add(d);
  const shade = cyl(CL_HGA_R + 0.02, CL_HGA_R + 0.02, 0.1, foilMat('black', 1), 40, true); shade.position.y = 0.25 + 0.38 - 0.05; shade.material = shade.material.clone(); shade.material.side = THREE.DoubleSide; hga.add(shade);
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3; hga.add(m20Bar([Math.sin(a) * 1.0, 0.25 + 0.17, Math.cos(a) * 1.0], [0, 1.15, 0], 0.018, alu)); }
  const feed = cyl(0.08, 0.08, 0.22, white, 12); feed.position.y = 1.0; hga.add(feed);
  const mga = twDish(0.2, 0.05, white, 20); mga.position.set(1.0, 0.3, 0.9); mga.rotation.x = -0.3; hga.add(mga); // a medium-gain horn beside the rim
  for (const [x, z] of [[-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) { const lg = cyl(0.03, 0.03, 0.3, white, 8); lg.position.set(x, 0.55, z); hga.add(lg); } // the low-gain antennas
  // the solar arrays on their yokes from the sides of the propulsion module (±X), the cells toward +Z. Stowed, each
  // array is a stack of its five panels standing on edge against the body's side, its long edge along the body; on
  // deployment the stack swings out on its yoke (f 0 → 0.4), then the panels unfold (0.4 → 1)
  const arrays = [];
  for (const s of [-1, 1]) {
    const yoke = new THREE.Group(); yoke.position.set(s * CL_PM_R, CL_PM_H * 0.5, 0); yoke.rotation.y = s < 0 ? Math.PI : 0; g.add(yoke);
    const arm = new THREE.Group(); yoke.add(arm);
    arm.add(m20Bar([0, 0, 0], [0.9, 0, 0], 0.04, alu)); arm.add(m20Bar([0, 0.5, 0], [0.9, 0, 0], 0.025, alu)); arm.add(m20Bar([0, -0.5, 0], [0.9, 0, 0], 0.025, alu));
    const hub = cyl(0.12, 0.12, 0.3, dark, 16); hub.rotation.z = Math.PI / 2; hub.position.set(0.9, 0, 0); arm.add(hub);
    const arr = clArray(s); yoke.add(arr);
    const pw = CL_ARRAY[0] / CL_PANELS;
    arr.userData.swing = f => { // between the stowed pose (the stack flat against the side, centred on the body) and the deployed one (out along the yoke)
      arr.position.set(twLerp(0.2, 0.95, f), twLerp(0.55, 0, f), twLerp(-pw / 2, 0, f)); arr.rotation.set(0, twLerp(-Math.PI / 2, 0, f), 0);
      arm.scale.x = Math.max(twLerp(0.15, 1, f), 1e-3);
    };
    arrays.push(arr);
  }
  // the magnetometer boom from the top of the propulsion module, three sensors along it; stowed, it lies along the body
  const boom = new THREE.Group(); boom.position.set(0.3, CL_PM_H - 0.1, CL_PM_R); g.add(boom);
  const can = cyl(0.14, 0.14, 0.3, alu, 16); can.rotation.x = Math.PI / 2; can.position.z = -0.15; boom.add(can);
  const pole = twBarMesh(0.035, mat('#d9dcdf', 'metal')); boom.add(pole);
  const sensors = [0.4, 0.7, 1.0].map(f => { const sn = box(0.14, 0.1, 0.1, mat('#d7a94a', 'gold')); boom.add(sn); return { sn, f }; });
  const setBoom = f => { const L = 0.3 + (CL_MAG - 0.3) * f; twSetBar(pole, [0, 0, 0], [0, 0, L]); for (const { sn, f: k } of sensors) sn.position.set(0, -0.05, L * k); boom.rotation.x = 0; };
  // folded (f = 0): the arrays stacked against the body and the antennas along them, the boom in its canister;
  // deployed (1): all out. Arrays over the first two hours after separation, the boom at three days, the radar at a month
  const pose = (fa, fb, fr) => { for (const a of arrays) { a.userData.swing(twPhase(fa, 0, 0.4)); a.userData.fold(twPhase(fa, 0.4, 1)); a.userData.deployAnt(fr); } setBoom(fb); };
  const D = 86400;
  if (flags.deployT != null) g.userData.animate = t => { const dt = t - flags.deployT; pose(twPhase(dt, 1800, 7200), twPhase(dt, 3 * D, 3 * D + 1200), twPhase(dt, 30 * D, 30 * D + 3600)); };
  const stowed = flags.stowed || flags.deployT != null; pose(stowed ? 0 : 1, stowed ? 0 : 1, stowed ? 0 : 1);
  g.userData.len = CL_PM_H + CL_VAULT[1] + 1.2; g.userData.mounts = [{ y: -0.12, r: 0.1, tag: 'SC' }];
  return g;
}
