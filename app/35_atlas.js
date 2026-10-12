// ============================================================================
// Atlas LV-3 Agena-D as it launched Mariner 4 (1964), drawn over its stages' plain geometry (src/vehicles.js, look; called
// from buildStage with the stage's group, bottom at y = 0). The Atlas: a stainless-steel balloon tank 3.05 m across, its
// sheets welded in rings; the booster section a skirt round the foot of the tank with the two booster engines in fairings
// on its sides (±X), making the base 4.9 m wide; the sustainer engine in the middle, under the tank; two small vernier
// engines low on the tank's sides (±Z); a cone up to the Agena. The Agena-D, 1.52 m across: the aft rack, an open frame
// round the engine's top with the pressure spheres and the attitude-control jets; the propellant tanks; the forward
// equipment section; the adapter the spacecraft sits on.
// ============================================================================
const ATLAS = { mats: {} };
let atlasSeed = 21; const atlasRnd = () => (atlasSeed = (atlasSeed * 9301 + 49297) % 233280) / 233280;
// the Atlas tank's steel: faint seams between the welded rings (about 0.8 m tall) and along each sheet
function atlasSteelMat() {
  if (ATLAS.mats.steel) return ATLAS.mats.steel;
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#bcc1c7'; g.fillRect(0, 0, 512, 1024);
  atlasSeed = 21; for (let i = 0; i < 1600; i++) { g.fillStyle = atlasRnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,44,50,0.05)'; g.fillRect(atlasRnd() * 512, atlasRnd() * 1024, 1 + atlasRnd() * 3, 6 + atlasRnd() * 40); } // the sheets' grain, along the tank
  g.fillStyle = 'rgba(85,90,96,0.45)'; for (let y = 0; y < 1024; y += 43) g.fillRect(0, y, 512, 2);
  for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 2, 1024);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); t.anisotropy = 4;
  return (ATLAS.mats.steel = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.75 }));
}
const STAGE_LOOK = {
  // the booster section: the skirt round the foot of the tank (3 m up), the two engine fairings on its sides, a dark base
  atlasBooster(g) {
    const steel = mat('#b3b8be', 'metal'), dark = mat('#2b2c2f', 'dark');
    const skirt = cyl(1.6, 1.58, 3.0, mat('#b3b8be', 'metal', { side: THREE.DoubleSide }), 48, true); g.add(skirt); // (an open ring once it slides off the tank)
    const base = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), dark); base.rotation.x = Math.PI / 2; base.position.y = 0.01; g.add(base);
    for (const s of [-1, 1]) {
      const pod = cyl(0.82, 0.82, 2.1, steel, 24); pod.position.set(s * 1.6, 0, 0); g.add(pod);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.82, 24, 10, 0, TAU, 0, Math.PI / 2), steel); top.position.set(s * 1.6, 2.1, 0); top.scale.y = 1.05; g.add(top); // the fairing's rounded top
      const pb = new THREE.Mesh(new THREE.CircleGeometry(0.82, 24), dark); pb.rotation.x = Math.PI / 2; pb.position.set(s * 1.6, 0.01, 0); g.add(pb);
    }
  },
  // the sustainer: the steel tank, the vernier engines (±Z) just above the skirt, a cone up to the Agena
  atlasSustainer(g) {
    const tank = g.children[0]; if (tank && tank.isMesh) tank.material = atlasSteelMat();
    for (const s of [-1, 1]) {
      const v = new THREE.Group(); v.position.set(0, 2.5, s * 1.6); v.rotation.x = -s * 0.25; g.add(v); // canted outboard
      v.add(box(0.22, 0.18, 0.22, mat('#7d8288', 'metal')));
      const b = bell(0.38, 0.11, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); b.position.y = -0.38; v.add(b);
    }
    const ring = cyl(1.535, 1.535, 0.12, mat('#8f949a', 'metal'), 48, true); ring.position.y = 19.0 - 0.06; g.add(ring); // where the cone meets the tank
  },
  // the Agena-D: aft rack (y 0–0.7) round the top of the engine, propellant tanks (0.7–4.2), forward section (4.2–5.4)
  agenaD(g) {
    const body = g.children[0]; if (body && body.isMesh) g.remove(body);
    const silver = mat('#d3d6da', 'metal'), white = mat('#e7e6e1', 'paint'), grey = mat('#8d9298', 'metal'), dark = mat('#2e3034', 'dark');
    const tanks = cyl(0.76, 0.76, 3.5, white, 40); tanks.position.y = 0.7; g.add(tanks);
    const fwd = cyl(0.76, 0.76, 1.2, silver, 40); fwd.position.y = 4.2; g.add(fwd);
    for (let k = 0; k < 8; k++) { const p = box(0.32, 0.5, 0.02, k % 2 ? dark : mat('#bfc3c8', 'metal')); const a = (k + 0.5) * TAU / 8; p.position.set(Math.sin(a) * 0.765, 4.45, Math.cos(a) * 0.765); p.rotation.y = a; g.add(p); } // equipment panels
    const band = cyl(0.77, 0.77, 0.08, grey, 40, true); band.position.y = 4.18; g.add(band);
    // the aft rack: rings and struts round the engine, the pressure spheres, the jets on the rim
    const rim = cyl(0.76, 0.76, 0.08, grey, 40, true); rim.position.y = 0.62; g.add(rim);
    const foot = cyl(0.55, 0.55, 0.06, grey, 24, true); foot.position.y = 0.04; g.add(foot);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8, b = (k + 1) * TAU / 8;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), grey), p0 = new THREE.Vector3(Math.sin(a) * 0.74, 0.62, Math.cos(a) * 0.74), p1 = new THREE.Vector3(Math.sin(b) * 0.53, 0.07, Math.cos(b) * 0.53);
      st.scale.y = p0.distanceTo(p1); st.position.copy(p0).add(p1).multiplyScalar(0.5); st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(st); }
    for (const a of [0.6, 2.2, 3.7, 5.3]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat('#c7a24f', 'gold')); s.position.set(Math.sin(a) * 0.5, 0.36, Math.cos(a) * 0.5); g.add(s); }
    for (const a of [0, Math.PI]) { const j = box(0.16, 0.14, 0.16, grey); j.position.set(Math.sin(a) * 0.82, 0.25, Math.cos(a) * 0.82); g.add(j); }
    const chamber = cyl(0.2, 0.2, 0.55, mat('#6a6e74', 'metal'), 16); chamber.position.y = 0.0; g.add(chamber);
    // the spacecraft adapter on top
    const ad = cyl(0.76, 0.6, 0.35, grey, 32); ad.position.y = 5.4; g.add(ad);
  },
};
