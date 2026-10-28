// ============================================================================
// The James Webb Space Telescope (2021), metres, y = 0 at the foot of the spacecraft bus, +Y the telescope's line of
// sight. Published (NASA/ESA): the primary mirror is 18 gold-coated beryllium hexagons 1.32 m across flat to flat, 6.5 m
// in all, the three on either side folded back for launch; the secondary mirror, 0.74 m, stands on a 7-m tripod; the
// sunshield is five kite-shaped layers of aluminised Kapton 21.2 × 14.2 m, folded on two pallets round the bus for
// launch and drawn open by two mid-booms; the deployable tower lifts the telescope 1.2 m off the bus; the five-panel
// solar array, the high-gain antenna, the aft radiator and the momentum flap all unfold on the way. Stowed it stood
// 10.7 m tall inside Ariane's 5.4-m fairing. Where a size is not published it is estimated from photographs.
// flags.stowed draws the launch pose; flags.deploy (the scenario's deployment table) with flags.deployT (launch) drives
// each part along its own step of that table, so the telescope unfolds over its first two weeks as the real one did.
// ============================================================================
function jwstModel(flags = {}) {
  const g = new THREE.Group();
  const dark = mat('#2a2c31', 'dark'), alu = mat('#b9bec5', 'metal'), gold = mat('#d4a84b', 'gold'), black = mat('#141518', 'dark');
  const foil = typeof foilMat === 'function' ? foilMat('mylar', 2) : mat('#d9dce0', 'foil');
  const lerp = (a, b, f) => a + (b - a) * f;
  // ---- the spacecraft bus: the box the rest hangs off, its thrusters at the foot ----
  const bus = box(3.5, 1.5, 3.5, dark); g.add(bus);
  const busTrim = box(3.6, 0.12, 3.6, alu); busTrim.position.y = 1.5; g.add(busTrim);
  const thr = cyl(0.12, 0.08, 0.25, alu, 12); thr.rotation.x = Math.PI; thr.position.y = 0.02; g.add(thr);
  // ---- the solar array: five panels on a hinge at the aft foot of the bus; flat against its underside for launch,
  // swung down toward the Sun once free ----
  const solarHinge = new THREE.Group(); solarHinge.position.set(-1.7, 0.05, 0); g.add(solarHinge);
  const wing = solarWing(5.0, 2.0, 5); wing.position.set(0, -0.08, 0); solarHinge.add(wing); // the panels out along +X from the hinge: a stack under the bus for launch, the strip swung down once free
  // ---- the high-gain antenna on its boom, at the bus's −Z corner ----
  const hga = new THREE.Group(); hga.position.set(1.2, 0.3, -1.6); g.add(hga);
  const hgaBoom = cyl(0.04, 0.04, 1.0, alu, 10); hgaBoom.rotation.x = Math.PI; hga.add(hgaBoom);
  const hgaDish = dish(0.6, '#ececec'); hgaDish.rotation.x = Math.PI; hgaDish.position.y = -1.0; hga.add(hgaDish);
  // ---- the sunshield pallets, hinged along the bus's ±Z edges: upright round the telescope for launch, then lowered ----
  const pallets = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0, 1.5, s * 1.75); g.add(p); const slab = box(8.0, 0.45, 2.6, dark); slab.position.z = s * 1.3; p.add(slab); p.userData.s = s; p.userData.slab = slab; return p; });
  // ---- the five layers of the sunshield: kites across the bus, stacked between it and the telescope ----
  const kite = new THREE.Shape(); kite.moveTo(-10.6, 0); kite.lineTo(0, 7.1); kite.lineTo(10.6, 0); kite.lineTo(0, -7.1); kite.closePath();
  const kiteGeo = new THREE.ShapeGeometry(kite); kiteGeo.rotateX(-Math.PI / 2);
  const shield = new THREE.Group(); shield.position.y = 1.65; g.add(shield);
  const layers = []; for (let i = 0; i < 5; i++) { const m = i === 0 ? mat('#d8c4e6', 'foil', { side: THREE.DoubleSide }) : i === 4 ? mat('#cfd3e8', 'foil', { side: THREE.DoubleSide }) : mat('#dfe2e8', 'foil', { side: THREE.DoubleSide }); const L = new THREE.Mesh(kiteGeo, m); L.position.y = i * 0.3; shield.add(L); layers.push(L); }
  // the two mid-booms that draw it open, along ±X
  const booms = [-1, 1].map(s => { const b = cyl(0.1, 0.1, 10.6, alu, 12); b.rotation.z = -s * Math.PI / 2; b.position.set(0, 2.3, 0); g.add(b); return b; });
  // the momentum flap at the aft tip of the shield, trimming the push of sunlight
  const flapHinge = new THREE.Group(); flapHinge.position.set(0, 1.65, -7.0); g.add(flapHinge);
  const flap = box(1.8, 0.9, 0.04, alu); flapHinge.add(flap);
  // ---- the deployable tower, and the telescope on it ----
  const dta = cyl(0.3, 0.3, 1.0, alu, 20); dta.position.y = 1.5; g.add(dta);
  const tel = new THREE.Group(); g.add(tel);
  // the backplane and the aft optics behind the mirror
  const back = box(2.9, 0.3, 5.8, black); back.position.y = -0.3; tel.add(back);
  const aft = box(1.2, 1.4, 1.2, black); aft.position.y = -1.7; tel.add(aft);
  // the radiator behind the aft optics, swinging down from the backplane's aft edge
  const radHinge = new THREE.Group(); radHinge.position.set(0, -0.3, -2.9); tel.add(radHinge);
  const rad = box(2.0, 0.04, 1.5, alu); rad.position.z = -0.75; radHinge.add(rad);
  // the eighteen hexagons: a centre ring of six about the hole, a ring of twelve outside; the three at either side on wings
  const hexGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.05, 6); // (its flats face ±X, toward the neighbours along the rows)
  const R1 = 1.32, R2 = 2.286;
  const cells = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cells.push([R1 * Math.cos(a), R1 * Math.sin(a)]); cells.push([2 * R1 * Math.cos(a), 2 * R1 * Math.sin(a)]); const b = a + Math.PI / 6; cells.push([R2 * Math.cos(b), R2 * Math.sin(b)]); }
  const wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(s * 1.65, 0, 0); tel.add(w); const bp = box(1.7, 0.3, 4.2, black); bp.position.set(s * 0.9, -0.3, 0); w.add(bp); w.userData.s = s; return w; });
  for (const [x, z] of cells) { const h = new THREE.Mesh(hexGeo, gold); const s = Math.sign(x); if (Math.abs(x) > 1.9) { h.position.set(x - s * 1.65, 0, z); wings[s < 0 ? 0 : 1].add(h); } else { h.position.set(x, 0, z); tel.add(h); } }
  // the secondary mirror on its tripod: folded flat over the primary for launch, raised to stand 7 m before it
  const smHinge = new THREE.Group(); smHinge.position.set(0, 0.1, -3.0); tel.add(smHinge);
  const apex = [0, 7.0, 3.0]; // in the hinge's frame: 7 m up and over the mirror's centre
  for (const [bx, bz] of [[0, 0], [-2.6, 4.5], [2.6, 4.5]]) { const dx = apex[0] - bx, dy = apex[1], dz = apex[2] - bz, L = Math.hypot(dx, dy, dz); const strut = cyl(0.06, 0.06, L, black, 8); strut.position.set(bx, 0, bz); strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)); smHinge.add(strut); }
  const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 24), gold); sm.rotation.x = Math.PI; sm.position.set(apex[0], apex[1], apex[2]); smHinge.add(sm);
  const smBack = box(0.5, 0.5, 0.5, black); smBack.position.set(apex[0], apex[1], apex[2]); smHinge.add(smBack);
  // ---- the pose: each part between its launch position (0) and its final one (1) ----
  const pose = P => {
    const f = k => P[k] ?? 1;
    solarHinge.rotation.z = lerp(0, -1.25, f('solar')); wing.scale.x = lerp(0.2, 1, f('solar'));
    hga.rotation.x = lerp(-Math.PI / 2, 0, f('hga'));
    for (const p of pallets) { p.rotation.x = p.userData.s * lerp(-Math.PI / 2, 0, f(p.userData.s < 0 ? 'fwdPallet' : 'aftPallet')); p.userData.slab.material = f('covers') > 0.5 ? foil : dark; }
    const rise = f('dta'); dta.scale.y = lerp(1, 2.2, rise); tel.position.y = 2.5 + lerp(0, 1.2, rise);
    const open = Math.min(f('fwdPallet'), f('aftPallet')), bo = f('booms');
    shield.scale.set(lerp(0.12, 1, bo), 1, lerp(0.12, 1, open));
    for (let i = 0; i < 5; i++) { const ti = f('tension' + (i + 1)); layers[i].rotation.x = (i - 2) * 0.035 * ti; layers[i].position.y = i * 0.3 + lerp(-0.1, 0, ti); }
    for (const b of booms) b.scale.y = Math.max(0.03, lerp(0.03, 1, bo));
    flapHinge.rotation.x = lerp(Math.PI / 2, 0, f('flap')); flapHinge.position.z = lerp(-1.0, -7.0, open);
    radHinge.rotation.x = lerp(-Math.PI / 2, 0, f('radiator'));
    smHinge.rotation.x = lerp(1.12, 0, f('smss')); // (folded, the tripod lies over the mirror)
    for (const w of wings) w.rotation.z = -w.userData.s * lerp(Math.PI / 2, 0, f(w.userData.s < 0 ? 'portWing' : 'stbdWing')); // (folded back behind the mirror)
  };
  const steps = flags.deploy || [];
  if (flags.deployT != null) g.userData.animate = t => { const P = {}; for (const s of steps) P[s.key] = smoothstep(clamp((t - (flags.deployT + s.at)) / Math.max(s.dur, 1), 0, 1)); pose(P); };
  const stowed = flags.stowed || flags.deployT != null; const P0 = {}; if (stowed) for (const k of ['solar', 'hga', 'fwdPallet', 'aftPallet', 'dta', 'flap', 'covers', 'booms', 'tension1', 'tension2', 'tension3', 'tension4', 'tension5', 'smss', 'radiator', 'portWing', 'stbdWing']) P0[k] = 0;
  pose(P0);
  g.userData.len = 11.0; g.userData.mounts = [{ y: 0, r: 0.3, tag: 'OBS', prop: 'mmh' }];
  return g;
}
