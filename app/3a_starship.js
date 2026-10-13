// ============================================================================
// Starship (Block 2) drawn over its stages' plain geometry (src/vehicles.js, look: 'starshipBooster' / 'starshipShip';
// called from buildStage with the stage's group, bottom at y = 0, 4.5 m radius). Both stages are stainless steel, welded
// from rings 1.83 m tall with the long seams of their sheets; the Ship wears black hexagonal heat-shield tiles on its
// windward half (−X, the side the attitude code turns into the airflow) and on the windward faces of its four flaps:
// the forward pair small and set back from the nose on the leeward side (Block 2), the aft pair large, hinged along the
// tile edge. The booster: a vented hot-staging ring on top, four grid fins just under it, the engine skirt round its
// 33 Raptors. Sizes from SpaceX's published figures (ship 52 m, booster 71 m, 9 m across; flaps and fins estimated
// from photographs).
// ============================================================================
const SS = { mats: {} };
let ssSeed = 7; const ssRnd = () => (ssSeed = (ssSeed * 9301 + 49297) % 233280) / 233280;
// the skin: brushed stainless steel, two welded rings (3.66 m) per repeat, the sheets' vertical seams; with tiles: the
// −X half (u 0.5…1) in black hexagons, the tiles' edges a little lighter, a few darker ones
function ssSkinMat(tiles) {
  const key = tiles ? 'tiles' : 'steel'; if (SS.mats[key]) return SS.mats[key];
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#b4b9bf'; g.fillRect(0, 0, W, H);
  ssSeed = 7;
  for (let i = 0; i < 2400; i++) { g.fillStyle = ssRnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(40,44,50,0.06)'; g.fillRect(ssRnd() * W, ssRnd() * H, 1 + ssRnd() * 2, 10 + ssRnd() * 60); } // the brushing
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${120 + ssRnd() * 60 | 0},${110 + ssRnd() * 50 | 0},${90 + ssRnd() * 30 | 0},0.08)`; g.fillRect(ssRnd() * W, ssRnd() * H, 20 + ssRnd() * 120, 8 + ssRnd() * 40); } // heat tint
  g.fillStyle = 'rgba(70,75,82,0.5)'; for (const y of [0, H / 2]) g.fillRect(0, y, W, 3); // ring welds
  for (let x = 0; x < W; x += W / 8) g.fillRect(x, 0, 2, H); // sheet seams
  if (tiles) {
    const r = 6.5, dx = r * Math.sqrt(3), dy = r * 1.5; g.fillStyle = '#17181a'; g.fillRect(W / 2, 0, W / 2, H);
    for (let j = -1; j * dy < H + r; j++) for (let i = -1; i * dx < W / 2 + r; i++) {
      const cx = W / 2 + i * dx + (j % 2 ? dx / 2 : 0), cy = j * dy; const v = 20 + ssRnd() * 14;
      g.fillStyle = `rgb(${v},${v + 1},${v + 3})`; g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + (r - 0.7) * Math.cos(a), cy + (r - 0.7) * Math.sin(a)); } g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(180,185,190,0.35)'; g.fillRect(W / 2 - 1, 0, 2, H); g.fillRect(W - 1, 0, 2, H); // the tile edge
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  // metalness and roughness by half: steel bright, tiles matt (a second map, the same split)
  const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 4; const g2 = c2.getContext('2d');
  g2.fillStyle = 'rgb(0,80,210)'; g2.fillRect(0, 0, 64, 4); if (tiles) { g2.fillStyle = 'rgb(0,200,40)'; g2.fillRect(32, 0, 32, 4); } // G roughness, B metalness
  const rm = new THREE.CanvasTexture(c2); rm.wrapS = rm.wrapT = THREE.RepeatWrapping; rm.magFilter = THREE.NearestFilter;
  return (SS.mats[key] = new THREE.MeshStandardMaterial({ map: t, roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1 }));
}
// a stage's skin: the plain cylinders take the steel, with the welds repeating every two rings of its height
function ssSkin(g, tiles) {
  const m = ssSkinMat(tiles);
  for (const o of g.children) if (o.isMesh && o.geometry.type === 'CylinderGeometry') {
    const h = o.geometry.parameters.height, mm = m.clone(); mm.map = m.map.clone(); mm.map.repeat.set(1, h / 3.66); mm.map.needsUpdate = true; o.material = mm;
  }
}
// a flap: a tapered slab hinged along the body (its hinge line along +Y at the group's origin, the flap out along +Z),
// tiles on its −X face, steel on the back; w: chord at the root, h: span along the body, tip: chord at the tip
function ssFlap(w, h, tip) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(tip, h); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.12, bevelSegments: 2 });
  geo.rotateY(-Math.PI / 2); // the shape's x → +Z (out from the body), the extrusion → −X
  const f = new THREE.Mesh(geo, mat('#b4b9bf', 'metal'));
  const cap = new THREE.Mesh(new THREE.ShapeGeometry(s), mat('#1a1b1e', 'tile')); cap.rotation.y = -Math.PI / 2; cap.position.x = -0.6; f.add(cap); // the windward face, tiled
  return f;
}
const STAGE_LOOK_SS = {
  // Super Heavy: the steel tank, the hot-staging ring on top (dark, vented), the grid fins below it, the engine skirt
  starshipBooster(g, st) {
    ssSkin(g, false);
    const top = st.geom[0][0] + st.geom[1][0], dark = mat('#2c2e31', 'dark'), steel = mat('#9ea3a8', 'metal');
    const ring = g.children[1]; if (ring && ring.isMesh) ring.material = dark;
    for (let k = 0; k < 24; k++) { const a = k * TAU / 24; const v = box(0.5, 1.2, 0.3, mat('#0d0e10', 'dark')); v.position.set(Math.cos(a) * 4.52, top - 1.6, Math.sin(a) * 4.52); v.rotation.y = -a; g.add(v); } // the vents
    for (let k = 0; k < 4; k++) { // the grid fins, in two pairs off the ±X sides (the vehicle's windward sides), folded out
      const a = (k < 2 ? 0.5 : -0.5) * 0.55 + (k % 2 ? Math.PI : 0), fin = new THREE.Group(); fin.position.set(Math.cos(a) * 4.5, top - 5.2, Math.sin(a) * 4.5); fin.rotation.y = -a; g.add(fin);
      const frame = box(3.0, 0.25, 2.0, dark); frame.position.set(1.5, 0, 0); frame.geometry.translate(0, -0.125, 0); fin.add(frame);
      for (let i = 1; i < 6; i++) { const b = box(0.06, 0.22, 2.0, steel); b.position.set(i * 0.5, 0, 0); fin.add(b); }
      for (let i = 1; i < 4; i++) { const b = box(3.0, 0.22, 0.06, steel); b.position.set(1.5, 0, -1 + i * 0.5); fin.add(b); }
      const shaft = cyl(0.3, 0.3, 0.6, steel, 12); shaft.rotation.z = -Math.PI / 2; shaft.position.set(0.3, 0, 0); fin.add(shaft);
    }
    const skirt = cyl(4.55, 4.55, 3.2, mat('#6d7176', 'metal', { side: THREE.DoubleSide }), 48, true); skirt.position.y = -0.4; g.add(skirt); // the engine skirt (a little below the tank)
    const shield = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), mat('#3a3d41', 'dark')); shield.rotation.x = Math.PI / 2; shield.position.y = -0.35; g.add(shield); // the engine shield the Raptors hang from
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8; const p = box(1.1, 10, 0.5, mat('#9ea3a8', 'metal')); p.position.set(Math.cos(a) * 4.55, 3, Math.sin(a) * 4.55); p.rotation.y = -a; g.add(p); } // raceways and the catch pins' housings
    for (const s of [1, -1]) { const pin = cyl(0.45, 0.45, 1.2, steel, 12); pin.rotation.z = -Math.PI / 2 * s; pin.position.set(s * 4.7, top - 7.2, 0); g.add(pin); } // the lift pins the tower catches it by
  },
  // the Ship: the steel body with tiles on its windward half, the four flaps, the nose
  starshipShip(g, st) {
    ssSkin(g, true);
    const body = st.geom[0][0], top = body + st.geom[1][0];
    const nose = g.children[1]; if (nose && nose.isMesh) { const m = ssSkinMat(true).clone(); m.map = m.map.clone(); m.map.repeat.set(1, st.geom[1][0] / 3.66); m.map.needsUpdate = true; nose.material = m; }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), mat('#8d9297', 'metal')); cap.position.y = top - 0.1; g.add(cap);
    // the aft flaps (±Z, hinged along the tile edge, their tiled face to −X): 9.5 m along the body, 4.3 m out at the root
    for (const s of [-1, 1]) { const f = ssFlap(4.3, 9.5, 3.0); f.position.set(-0.6, 1.6, s * 4.1); f.scale.z = s; g.add(f);
      const hinge = cyl(0.4, 0.4, 9.5, mat('#4a4d52', 'metal'), 12); hinge.position.set(-0.3, 1.6, s * 4.25); g.add(hinge); }
    // the forward flaps (Block 2): smaller, 5 m along the body, set back from the nose and round toward the lee side (+X)
    for (const s of [-1, 1]) { const phi = 0.42, f = ssFlap(2.6, 5.2, 1.6); f.position.set(Math.sin(phi) * 4.2, body - 1.4, s * Math.cos(phi) * 4.2); f.scale.z = s; f.rotation.y = s * phi; g.add(f);
      const hinge = cyl(0.3, 0.3, 5.2, mat('#4a4d52', 'metal'), 10); hinge.position.set(Math.sin(phi) * 4.35, body - 1.4, s * Math.cos(phi) * 4.35); g.add(hinge); }
    const skirt = cyl(4.5, 4.5, 1.6, mat('#6d7176', 'metal', { side: THREE.DoubleSide }), 48, true); skirt.position.y = -0.2; g.add(skirt); // the engine skirt
    const shield = new THREE.Mesh(new THREE.CircleGeometry(4.45, 48), mat('#3a3d41', 'dark')); shield.rotation.x = Math.PI / 2; shield.position.y = -0.15; g.add(shield);
  },
};
Object.assign(STAGE_LOOK, STAGE_LOOK_SS);
