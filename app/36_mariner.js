// ============================================================================
// Mariner 4 (1964): an octagonal bus 1.27 m across its corners and 0.457 m high, louvres for its temperature on four of its
// sides; four solar panels, 1.76 × 0.90 m, from the top edge of the other four, each with a solar pressure vane at its tip
// (the vanes steered it a little by the push of sunlight); the elliptical high-gain dish, 1.17 × 0.53 m, on top; the low-
// gain antenna on a mast, 2.89 m from the foot of the bus to its tip, the magnetometer part way up; the television camera
// on its scan platform under the bus; the midcourse motor's nozzle on one side. For launch the panels are folded up
// round the mast, inside the shroud (flags.stowed); they open out after the spacecraft leaves the Agena (flags.deployT).
// y = 0 at the foot of the bus.
// ============================================================================
function marinerPanel() { // a solar panel along +X from its hinge, the cells on top; its vane at the tip (userData.vane)
  const g = new THREE.Group(), L = 1.76, W = 0.9;
  const cells = box(L, 0.03, W, mat('#1b2550', 'solar')); cells.position.set(L / 2, 0, 0); cells.geometry.translate(0, -0.015, 0); g.add(cells);
  const frame = box(L + 0.02, 0.035, 0.03, mat('#c8ccd1', 'metal')); for (const z of [-W / 2, W / 2]) { const f = frame.clone(); f.position.set(L / 2, -0.02, z); g.add(f); }
  for (let i = 1; i < 6; i++) { const ln = box(0.012, 0.032, W, mat('#9aa0a8', 'metal')); ln.position.set(i * L / 6, -0.019, 0); g.add(ln); }
  const vane = new THREE.Group(); vane.position.set(L, 0, 0); g.add(vane);
  const v = box(0.62, 0.012, 0.66, mat('#e3e5e8', 'metal')); v.position.set(0.31, 0, 0); v.geometry.translate(0, -0.006, 0); vane.add(v);
  const act = cyl(0.03, 0.03, 0.1, mat('#5c6066', 'metal'), 8); act.rotation.x = Math.PI / 2; act.position.set(0.02, 0.02, 0); vane.add(act);
  g.userData.vane = vane; return g;
}
function marinerModel(flags = {}) {
  const g = new THREE.Group(), H = 0.457, Rc = 0.635, Rf = Rc * Math.cos(Math.PI / 8);
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(Rc, Rc, H, 8, 1), mat('#3c3f45', 'metal', { flatShading: true })); bus.rotation.y = Math.PI / 8; bus.position.y = H / 2; g.add(bus);
  // the sides: louvres (bright slats) between the panel hinges, gold foil where the panels are
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, side = new THREE.Group(); side.position.set(Math.sin(a) * (Rf + 0.006), H / 2, Math.cos(a) * (Rf + 0.006)); side.rotation.y = a; g.add(side);
    if (k % 2) { side.add(box(0.4, 0.36, 0.01, mat('#2a2c30', 'dark'))); for (let i = 0; i < 6; i++) { const s = box(0.05, 0.34, 0.015, mat('#e2e4e8', 'metal')); s.position.set(-0.16 + i * 0.064, -0.17, 0.008); s.rotation.y = 0.5; side.add(s); } }
    else { const f = box(0.46, 0.4, 0.01, foilMat('gold', 1)); f.position.y = -0.2; side.add(f); }
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(Rc * 0.98, Rc * 0.98, 0.03, 8), mat('#9da2a8', 'metal')); lid.rotation.y = Math.PI / 8; lid.position.y = H + 0.015; g.add(lid);
  // high-gain dish (elliptical) on a short support, tilted; low-gain antenna mast with the magnetometer
  const hga = new THREE.Group(); hga.position.set(0, H + 0.3, 0.08); hga.rotation.x = 0.35; g.add(hga);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 8, 0, TAU, 0, 0.62), mat('#eef0f2', 'paint', { side: THREE.DoubleSide })); dish.rotation.x = Math.PI; dish.position.y = 0.62; dish.scale.set(1.62, 1, 0.74); hga.add(dish); // 1.17 × 0.53 m
  for (const [x, z] of [[-0.18, -0.08], [0.18, -0.08], [0, 0.14]]) hga.add(m20Bar([x * 1.6, -0.3, z], [x * 0.3, 0.02, z * 0.3], 0.012, mat('#9aa0a6', 'metal'))); // its tripod
  const feed = cyl(0.025, 0.025, 0.32, mat('#7f848a', 'metal'), 8); feed.position.y = 0.05; hga.add(feed);
  const mx = -0.3, mz = -0.25, top = 2.89;
  g.add(m20Bar([mx, H, mz], [mx, top - 0.12, mz], 0.022, mat('#c9cdd2', 'metal')));
  const lga = cyl(0.06, 0.06, 0.12, mat('#e6e6e2', 'paint'), 12); lga.position.set(mx, top - 0.12, mz); g.add(lga);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 6, 0, TAU, 0, Math.PI / 2), mat('#e6e6e2', 'paint')); dome.position.set(mx, top, mz); g.add(dome);
  const mag = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), mat('#d7a94a', 'gold')); mag.position.set(mx, 1.75, mz); g.add(mag);
  // the scan platform and the camera under the bus; the midcourse motor's nozzle
  const plat = cyl(0.2, 0.2, 0.04, mat('#55595f', 'metal'), 16); plat.position.set(0.15, -0.06, 0.1); g.add(plat);
  const cam = cyl(0.07, 0.07, 0.32, mat('#2c2e33', 'dark'), 14); cam.rotation.z = 0.5; cam.position.set(0.15, -0.3, 0.1); g.add(cam);
  const noz = bell(0.12, 0.05, mat('#4a4c50', 'metal', { side: THREE.DoubleSide })); noz.position.set(0, -0.12, 0); g.add(noz);
  // the four solar panels on the louvre-free sides (±X, ±Z)
  const panels = [];
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, piv = new THREE.Group(); piv.position.set(Math.sin(a) * Rf, H - 0.02, Math.cos(a) * Rf); piv.rotation.y = a - Math.PI / 2; g.add(piv);
    const p = marinerPanel(); piv.add(p); panels.push({ p, vane: p.userData.vane }); }
  // folded (f = 0): panels up along the mast, vanes folded back flat; deployed (1): out flat, the vanes turned 25°
  const pose = f => { for (const { p, vane } of panels) { p.rotation.z = Math.PI / 2 * (1 - f); vane.rotation.z = Math.PI * (1 - f) + 0.44 * f; } };
  if (flags.deployT != null) g.userData.animate = t => pose(smoothstep(clamp((t - flags.deployT - 20) / 60, 0, 1)));
  pose(flags.stowed || flags.deployT != null ? 0 : 1);
  g.userData.len = H; return g;
}
