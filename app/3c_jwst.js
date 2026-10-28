// ============================================================================
// The James Webb Space Telescope (2021), metres, y = 0 at the foot of the spacecraft bus, +Y the deployable tower's
// axis. Published (NASA/ESA): the primary mirror is 18 gold-coated beryllium hexagons 1.32 m across flat to flat, 6.5 m
// in all, the column of three on either side folded back for launch; the secondary mirror, 0.74 m, stands on a 7-m
// tripod; the sunshield is five kite-shaped layers of aluminised Kapton 21.2 × 14.2 m, folded on two pallets round the
// bus for launch and drawn open by two mid-booms; the deployable tower lifts the telescope 1.2 m off the bus; the
// five-panel solar array, the high-gain antenna, the aft radiator and the momentum flap all unfold on the way. Stowed
// it stood 10.7 m tall inside Ariane's 5.4-m fairing. The mirror stands on edge across the shield's short axis, looking
// out along +Z over the forward pallet. Where a size is not published it is estimated from photographs and NASA's
// renderings (the pink layers with their seams fanning from the corners, the black spreader bars at the tips, the black
// aft-optics wedge in the mirror's centre, the pale solar array).
// flags.stowed draws the launch pose; flags.deploy (the scenario's deployment table) with flags.deployT (launch) drives
// each part along its own step of that table, so the telescope unfolds over its first two weeks as the real one did.
// ============================================================================
const JW = {};
// the sunshield's membrane: lavender aluminised Kapton with its seams fanning from the four corners and ripples between
// them, as a colour map and a normal map over the kite's UV square (u across the long axis, v across the short one)
function jwKiteTex(tint) {
  const key = 'kite' + tint; if (JW[key]) return JW[key];
  const w = 512, H = new Float32Array(w * w); let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const inKite = (x, y) => Math.abs(x / w - 0.5) * 2 + Math.abs(y / w - 0.5) * 2 <= 1.0;
  // the seams: from each corner of the kite, lines fanning across to the far edges (the membranes are sewn in gores)
  const corners = [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]];
  const line = (x0, y0, x1, y1, amp, wid) => { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L; for (let t = 0; t < L; t += 1) { const cx = x0 + ux * t, cy = y0 + uy * t; for (let o = -wid; o <= wid; o++) { const px = Math.round(cx - uy * o), py = Math.round(cy + ux * o); if (px < 0 || py < 0 || px >= w || py >= w) continue; H[py * w + px] += amp * (1 - Math.abs(o) / (wid + 1)); } } };
  for (const [cx, cy] of corners) for (let k = 0; k < 7; k++) { const a = (k + 0.5) / 7; const tx = cx < 0.5 && cy === 0.5 ? 0.5 + a * 0.5 : cx > 0.5 && cy === 0.5 ? 0.5 - a * 0.5 : 0.5 + (a - 0.5) * 0.9; const ty = cy === 0.5 ? (k % 2 ? 0.08 + a * 0.84 : 0.92 - a * 0.84) : cy < 0.5 ? 0.5 + a * 0.5 : 0.5 - a * 0.5; line(cx * w, cy * w, tx * w, ty * w, 0.26, 1); }
  // ripples: long shallow creases roughly along the seams, and short ones anywhere
  for (let n = 0; n < 260; n++) { const x0 = rnd() * w, y0 = rnd() * w, ang = rnd() * Math.PI, len = 20 + rnd() * 160, amp = (rnd() - 0.5) * 0.5, wid = 2 + rnd() * 6; line(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, amp, wid); }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = w; return c; };
  const col = mk(), nor = mk(), g = col.getContext('2d'), gn = nor.getContext('2d'), img = g.createImageData(w, w), imn = gn.createImageData(w, w);
  const cB = new THREE.Color(tint), cH = cB.clone().lerp(new THREE.Color('#ffffff'), 0.45), cL = cB.clone().multiplyScalar(0.62), c = new THREE.Color();
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, hx = H[y * w + Math.min(x + 1, w - 1)] - H[y * w + Math.max(x - 1, 0)], hy = H[Math.min(y + 1, w - 1) * w + x] - H[Math.max(y - 1, 0) * w + x];
    const sh = clamp(0.5 + hx * 1.4 - hy * 0.9 + (rnd() - 0.5) * 0.06, 0, 1); if (sh > 0.5) c.copy(cB).lerp(cH, (sh - 0.5) * 2); else c.copy(cL).lerp(cB, sh * 2);
    if (!inKite(x, y)) c.copy(cB);
    img.data[4 * k] = c.r * 255; img.data[4 * k + 1] = c.g * 255; img.data[4 * k + 2] = c.b * 255; img.data[4 * k + 3] = 255;
    const nx = -hx * 2.2, ny = -hy * 2.2, nl = Math.hypot(nx, ny, 1);
    imn.data[4 * k] = (nx / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 1] = (ny / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 2] = (1 / nl * 0.5 + 0.5) * 255; imn.data[4 * k + 3] = 255;
  }
  g.putImageData(img, 0, 0); gn.putImageData(imn, 0, 0);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const nmap = new THREE.CanvasTexture(nor);
  return (JW[key] = { map, nmap });
}
// a dark composite with the lattice of a truss showing through: the backplane and the tower
function jwTrussMat() {
  if (JW.truss) return JW.truss;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#17181c'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#2b2d33'; g.lineWidth = 3;
  for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); }
  g.strokeStyle = '#34363c'; g.lineWidth = 4; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return (JW.truss = new THREE.MeshStandardMaterial({ map: t, color: '#ffffff', roughness: 0.62, metalness: 0.3 }));
}
// the solar array's cells: pale blue-grey with the grid of cell edges
function jwCellMat() {
  if (JW.cell) return JW.cell;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#b6c3d6'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#8d9bb0'; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); } for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = '#6f7d93'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (JW.cell = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.2 }));
}
function jwstModel(flags = {}) {
  const g = new THREE.Group();
  const dark = mat('#2a2c31', 'dark'), alu = mat('#b9bec5', 'metal'), black = mat('#141518', 'dark'), truss = jwTrussMat();
  // the gold: metallic, but with a glow of its own colour so that it reads as gold in the dark of space, where a true
  // metal reflects nothing but black
  const gold = JW.gold || (JW.gold = new THREE.MeshStandardMaterial({ color: '#e9b94c', roughness: 0.22, metalness: 0.85, emissive: '#5a3c0c', emissiveIntensity: 1 }));
  const foil = typeof foilMat === 'function' ? foilMat('mylar', 2) : mat('#d9dce0', 'foil');
  const lerp = (a, b, f) => a + (b - a) * f;
  // ---- the spacecraft bus: aluminium panels under silver blankets, its thrusters, star trackers and radiators ----
  const bus = box(3.5, 1.5, 3.5, foil); g.add(bus);
  const busTrim = box(3.6, 0.12, 3.6, alu); busTrim.position.y = 1.5; g.add(busTrim);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const t = cyl(0.07, 0.12, 0.22, alu, 12); t.rotation.x = Math.PI; t.position.set(x, 0.02, z); g.add(t); } // the SCAT thrusters at the corners
  const thr = cyl(0.12, 0.08, 0.25, alu, 12); thr.rotation.x = Math.PI; thr.position.y = 0.02; g.add(thr); // the main engine
  for (const z of [-0.5, 0.5]) { const st = cyl(0.12, 0.1, 0.45, black, 12); st.rotation.z = -Math.PI / 2; st.position.set(1.75, 0.9, z); g.add(st); } // star trackers on the +X face
  const radB = box(1.2, 0.9, 0.05, alu); radB.position.set(-1.0, 0.3, 1.76); g.add(radB); // a radiator panel on the +Z face
  // ---- the solar array: five pale panels on a hinge at the aft foot of the bus; a stack under the bus for launch, the
  // strip swung down toward the Sun once free ----
  const solarHinge = new THREE.Group(); solarHinge.position.set(-1.7, 0.05, 0); g.add(solarHinge);
  const wing = new THREE.Group(); wing.position.y = -0.08; solarHinge.add(wing);
  { const cellM = jwCellMat(), pw = 1.0; for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.96, 0.04, 2.0), cellM); p.position.x = pw * (i + 0.5) + 0.3; wing.add(p); } const arm = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 0.08), alu); arm.position.set(2.7, -0.06, 0); wing.add(arm); }
  // ---- the high-gain antenna on its boom at the bus's −Z corner, a silver dish ----
  const hga = new THREE.Group(); hga.position.set(1.2, 0.3, -1.6); g.add(hga);
  const hgaBoom = cyl(0.04, 0.04, 1.0, alu, 10); hgaBoom.rotation.x = Math.PI; hga.add(hgaBoom);
  const hgaDish = dish(0.6, '#d8dce2'); hgaDish.rotation.x = Math.PI; hgaDish.position.y = -1.0; hga.add(hgaDish);
  // ---- the sunshield pallets, hinged along the bus's ±Z edges: standing up either side of the folded telescope for
  // launch (the membranes folded inside them), then lowered flat under the shield ----
  const pallets = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(0, 1.5, s * 1.75); g.add(p); const slab = box(3.4, 0.3, 4.0, dark); slab.position.z = s * 2.0; p.add(slab); const hinge = cyl(0.08, 0.08, 3.6, alu, 10); hinge.rotation.z = Math.PI / 2; hinge.position.x = 1.8; p.add(hinge); p.userData.s = s; p.userData.slab = slab; return p; });
  // ---- the five layers of the sunshield: kites across the bus, stacked between it and the telescope, the Sun side
  // pink-lavender and the telescope side cooler; the layers held apart at the four tips by spreader bars, their edges
  // drawn taut by cables; the two mid-booms under them along ±X ----
  const kite = new THREE.Shape(); kite.moveTo(-10.6, 0); kite.lineTo(0, 7.1); kite.lineTo(10.6, 0); kite.lineTo(0, -7.1); kite.closePath();
  const kiteGeo = new THREE.ShapeGeometry(kite, 1); { const p = kiteGeo.attributes.position, uv = []; for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + 10.6) / 21.2, (p.getY(i) + 7.1) / 14.2); kiteGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); } kiteGeo.rotateX(-Math.PI / 2);
  const shield = new THREE.Group(); shield.position.y = 1.65; g.add(shield);
  const kiteMat = tint => { const key = 'kiteM' + tint; if (JW[key]) return JW[key]; const T = jwKiteTex(tint); return (JW[key] = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.nmap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.32, metalness: 0.6, side: THREE.DoubleSide })); };
  const layers = []; for (let i = 0; i < 5; i++) { const L = new THREE.Mesh(kiteGeo, kiteMat(i === 4 ? '#b9c3d3' : i === 0 ? '#e2bfe0' : '#dcc4e4')); L.position.y = i * 0.3; const sc = 1 - 0.012 * i; L.scale.set(sc, 1, sc); shield.add(L); layers.push(L); }
  for (const [x, z] of [[-10.5, 0], [10.5, 0], [0, 7.0], [0, -7.0]]) { const bar = box(0.22, 1.9, 0.22, black); bar.position.set(x, -0.3, z); shield.add(bar); } // the spreader bars at the tips
  for (const [a, b] of [[[-10.6, 0], [0, 7.1]], [[0, 7.1], [10.6, 0]], [[10.6, 0], [0, -7.1]], [[0, -7.1], [-10.6, 0]]]) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), c = cyl(0.025, 0.025, L, black, 6); c.position.set(a[0], 1.35, a[1]); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3((b[0] - a[0]) / L, 0, (b[1] - a[1]) / L)); shield.add(c); } // the edge cables along the top layer
  const booms = [-1, 1].map(s => { const b = cyl(0.1, 0.1, 10.6, black, 12); b.rotation.z = -s * Math.PI / 2; b.position.set(0, 2.3, 0); g.add(b); return b; });
  // the momentum flap at the aft tip of the shield, trimming the push of sunlight
  const flapHinge = new THREE.Group(); flapHinge.position.set(0, 1.65, -7.0); g.add(flapHinge);
  const flap = box(1.8, 0.9, 0.04, alu); flap.rotation.x = 0.35; flapHinge.add(flap);
  // ---- the deployable tower, and the telescope on it: the primary mirror stands on edge across the shield's short axis,
  // looking out along +Z over the forward pallet, 6.6 m tall and 6.1 m across with its wings out; the secondary on its
  // tripod 7 m in front. Folded, the wings swing back behind it and the tripod lies up its face: 3.8 m across, 10.7 m tall ----
  const dta = cyl(0.3, 0.3, 1.0, truss, 20); dta.position.y = 1.5; g.add(dta);
  const tel = new THREE.Group(); g.add(tel);
  const yc = 3.7; // the mirror's centre above the tower's top
  const back = box(3.8, 6.6, 0.3, truss); back.position.set(0, yc - 3.3, -0.3); tel.add(back); // the backplane, a carbon truss
  const aft = box(1.2, 1.4, 1.4, black); aft.position.set(0, yc - 0.7, -1.7); tel.add(aft); // the instrument module behind
  const aos = box(0.72, 0.8, 1.3, black); aos.position.set(0, yc - 0.4, 0.05); tel.add(aos); // the aft optics, a black wedge standing out of the mirror's centre
  const radHinge = new THREE.Group(); radHinge.position.set(0, yc - 1.0, -1.7); tel.add(radHinge); // the radiator, swinging down behind
  const rad = box(2.0, 0.04, 1.5, alu); rad.position.z = -0.75; radHinge.add(rad);
  // the eighteen hexagons, 1.32 m flat to flat, stacked across their flats in columns, a dark gap between them and a
  // bevel at each edge: a centre ring of six about the hole, a ring of twelve outside; the outer column of three on
  // either side is a wing
  const hexGeo = new THREE.CylinderGeometry(0.625, 0.645, 0.07, 6); hexGeo.rotateX(Math.PI / 2); hexGeo.rotateZ(Math.PI / 6); // facing +Z, flats up and down
  const R1 = 1.32, R2 = 2.286;
  const cells = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; cells.push([R1 * Math.cos(a), R1 * Math.sin(a)]); cells.push([2 * R1 * Math.cos(a), 2 * R1 * Math.sin(a)]); const b = k * Math.PI / 3; cells.push([R2 * Math.cos(b), R2 * Math.sin(b)]); }
  const wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(s * 1.7, yc, 0); tel.add(w); const bp = box(1.4, 4.0, 0.3, truss); bp.position.set(s * 0.7, -2.0, -0.3); w.add(bp); w.userData.s = s; return w; });
  for (const [x, y] of cells) { const h = new THREE.Mesh(hexGeo, gold); const s = Math.sign(x); if (Math.abs(x) > 2.2) { h.position.set(x - s * 1.7, y, 0); wings[s < 0 ? 0 : 1].add(h); } else { h.position.set(x, yc + y, 0); tel.add(h); } }
  // the secondary mirror on its tripod: two struts from the mirror's lower corners, hinged there, and one from the top
  // of the backplane that follows the apex; folded, the apex lies up the mirror's face, deployed it stands 7 m before it
  const smHinge = new THREE.Group(); smHinge.position.set(0, yc - 3.1, 0.1); tel.add(smHinge);
  const apex = new THREE.Vector3(0, 3.1, 7.0); // in the hinge's frame: out in front of the mirror's centre
  for (const [bx, by, bz] of [[-2.3, 0, -0.2], [2.3, 0, -0.2]]) { const d = apex.clone().sub(new THREE.Vector3(bx, by, bz)), L = d.length(); const strut = cyl(0.06, 0.06, L, black, 8); strut.position.set(bx, by, bz); strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); smHinge.add(strut); }
  const smHouse = box(0.55, 0.55, 0.6, black); smHouse.position.set(0, apex.y - 0.3, apex.z); smHinge.add(smHouse); // the secondary's housing
  const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.06, 24), gold); sm.rotation.x = Math.PI / 2; sm.position.set(0, apex.y, apex.z - 0.32); smHinge.add(sm); // the 0.74-m secondary, facing the primary
  const topFoot = new THREE.Vector3(0, yc + 3.25, -0.2), topStrut = cyl(0.06, 0.06, 1, black, 8); topStrut.position.copy(topFoot); tel.add(topStrut);
  const _ap = new THREE.Vector3();
  const aimTop = () => { smHinge.updateMatrix(); _ap.copy(apex).applyMatrix4(smHinge.matrix).sub(topFoot); const L = _ap.length(); topStrut.scale.y = L; topStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _ap.normalize()); };
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
    radHinge.rotation.x = lerp(Math.PI / 2, 0, f('radiator')); // (folded up against the back)
    smHinge.rotation.x = lerp(-1.154, 0, f('smss')); aimTop(); // (folded, the tripod lies up the mirror's face)
    for (const w of wings) w.rotation.y = w.userData.s * lerp(Math.PI / 2, 0, f(w.userData.s < 0 ? 'portWing' : 'stbdWing')); // (folded back behind the mirror)
  };
  const steps = flags.deploy || [];
  if (flags.deployT != null) g.userData.animate = t => { const P = {}; for (const s of steps) P[s.key] = smoothstep(clamp((t - (flags.deployT + s.at)) / Math.max(s.dur, 1), 0, 1)); pose(P); };
  const stowed = flags.stowed || flags.deployT != null; const P0 = {}; if (stowed) for (const k of ['solar', 'hga', 'fwdPallet', 'aftPallet', 'dta', 'flap', 'covers', 'booms', 'tension1', 'tension2', 'tension3', 'tension4', 'tension5', 'smss', 'radiator', 'portWing', 'stbdWing']) P0[k] = 0;
  pose(P0);
  g.userData.len = 12.0; g.userData.mounts = [{ y: 0, r: 0.3, tag: 'OBS', prop: 'mmh' }];
  return g;
}
