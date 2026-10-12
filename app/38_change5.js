// ============================================================================
// Chang'e 5 (2020), metres: the orbiter, the returner, the lander and the ascender, stacked for launch with the lander and
// ascender on top of the orbiter.
// Published: launch mass 8.2 t; the returner (about 300 kg) is a scaled-down Shenzhou capsule and rides in a cavity of the
// orbiter, which shortens the stack; the orbiter's docking mechanism is three K-shaped claws that close on three rods on
// the ascender's top, and its transfer mechanism pushes the sample container down into the returner; the orbiter has
// five separation planes (the rocket, the lander, the docking module with the ascender, the support module, the
// returner); the lander, built on Chang'e 3's, stands on four legs, lands on a 7500 N throttleable engine, has two solar
// wings that open and fold, a rotary-percussive drill, a four-jointed arm with a scoop, and the first fabric flag China
// put on the Moon; the ascender sits on the lander's deck on its 3000 N engine. The sizes are estimates made to fit the
// stack in Long March 5's fairing and the masses: the orbiter's propulsion module 2.7 m across, the lander's body 2.5 m,
// the ascender's 1.6 m, the returner 1.25 m across its heat shield.
// ============================================================================
const CE5 = {
  O: { R: 1.35, H: 1.6, eng: 0.7 }, // the orbiter's propulsion module (y = 0 at its foot)
  S: { y0: 1.6, y1: 3.3, r0: 1.15, r1: 0.95 }, // its support module, round the returner
  D: { y: 3.3, h: 0.1, r: 0.95, rc: 0.65 }, // the docking module's ring on top; its claws at radius rc
  RET: { y0: 1.62, r: 0.625, h: 1.18 }, // the returner, on the propulsion module's deck
  L: { y0: 3.6, R: 1.25, H: 0.95, eng: 0.75, foot: 0.95 }, // the lander (its own y = 0 at the foot of its body; feet 0.95 m below)
  A: { R: 0.8, H: 0.95, gap: 0.12, eng: 0.5 }, // the ascender (its own y = 0 at the foot of its body), on the lander's deck
};
CE5.dockY = CE5.D.y + CE5.D.h + 0.3; // the ascender's top deck, docked upside down on the claws

// ---------------------------------------------------------------------------------------------------------------------
// The returner (y = 0 at the centre of its heat shield): the heat shield a shallow spherical cap, the side wall flaring in
// to the flat top with its parachute hatch; the ablative coat dark grey-brown, its seams lighter; thruster ports.
function ce5ReturnerProfile() {
  const { r, h } = CE5.RET, Rc = 1.25, p = [];
  for (let k = 0; k <= 8; k++) { const x = (r - 0.04) * k / 8; p.push([x, Rc - Math.sqrt(Rc * Rc - x * x)]); }
  const y0 = p[p.length - 1][1]; for (let a = -60; a <= 90; a += 30) p.push([r - 0.04 + 0.04 * Math.cos(a * DEG), y0 + 0.04 + 0.04 * Math.sin(a * DEG)]); // the shoulder
  const ys = y0 + 0.08; for (let k = 1; k <= 8; k++) { const f = k / 8; p.push([r - (r - 0.3) * (0.15 * f + 0.85 * f * f), ys + (h - ys) * f]); } // the side wall, bowed out
  p.push([0.3, h]); p.push([0, h]); return p;
}
function ce5ReturnerMat() {
  return twMat('ce5ret', () => {
    const prof = m20Resample(ce5ReturnerProfile(), 120), L = prof.len, W = 1024, H = 512, sSide = (() => { let s = 0; for (let i = 1; i < prof.length; i++) { s += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]); if (prof[i][1] > 0.2) return s; } return 0; })();
    let sd = 23; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    const map = m20Canvas(W, H, g => {
      g.fillStyle = '#2f2a26'; g.fillRect(0, 0, W, H); // the heat shield
      g.fillStyle = '#5d554d'; g.fillRect(0, sSide / L * H, W, H); // the side wall
      for (let i = 0; i < 4000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 5, 1 + rnd() * 3); }
      g.strokeStyle = 'rgba(150,140,128,0.5)'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(k / 8 * W, sSide / L * H); g.lineTo(k / 8 * W, H * 0.97); g.stroke(); }
      for (const f of [0.45, 0.7]) { g.beginPath(); g.moveTo(0, (sSide + (L - sSide) * f) / L * H); g.lineTo(W, (sSide + (L - sSide) * f) / L * H); g.stroke(); }
      g.fillStyle = '#1d1e21'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse((k + 0.5) / 6 * W, (sSide + (L - sSide) * 0.82) / L * H, 9, 7, 0, 0, TAU); g.fill(); } // thruster ports
      g.fillStyle = '#8a8d92'; g.fillRect(0, H * 0.97, W, H * 0.03); // the top
    });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.05 });
  });
}
function ce5Returner() {
  const g = new THREE.Group(); g.add(lathe(ce5ReturnerProfile(), ce5ReturnerMat(), 64));
  const hatch = cyl(0.2, 0.18, 0.04, mat('#a3a7ac', 'metal'), 24); hatch.position.y = CE5.RET.h; g.add(hatch);
  for (let k = 0; k < 3; k++) { const b = box(0.06, 0.05, 0.1, mat('#c9a04a', 'gold')); b.position.set(...m20Polar(0.24, k * TAU / 3, CE5.RET.h)); g.add(b); }
  g.userData.len = CE5.RET.h; return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// The orbiter: the propulsion module, an octagonal prism in gold blankets with white radiators on two faces and the flag on
// one, the main engine under it, four 150 N engines and attitude thrusters round its foot, a solar wing of three panels on
// each of the ±X faces, a dish antenna on a boom; on its deck the returner, inside the support module (a truncated cone),
// and on top of that the docking module: a ring with the three claws, and the channel the sample container is pushed down.
// opts: support (the support and docking modules are there), claws ('open' | 'closed'), channel (the transfer channel
// out), stowed / deployT (the wings fold against their faces; they open after separation), returner.
function ce5Orbiter(opts = {}) {
  const g = new THREE.Group(), { R, H } = CE5.O, rf = R * Math.cos(Math.PI / 8);
  const gold = foilMat('gold', 2), white = mat('#e8e8e3', 'paint'), alu = mat('#b9bec4', 'metal'), grey = mat('#80858c', 'metal'), dark = mat('#2b2d31', 'dark');
  g.add(twPrismSides(8, R, 0, H, 0, () => gold));
  g.add(twDeck(8, R, H, 0, mat('#d5d8db', 'metal', { side: THREE.DoubleSide })));
  g.add(twDeck(8, R, 0, 0, mat('#5d6066', 'metal', { side: THREE.DoubleSide }), 0.62, true));
  for (const a of [0, Math.PI]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), white); r.position.set(Math.sin(a) * (rf + 0.004), 0.68, Math.cos(a) * (rf + 0.004)); r.rotation.y = a; g.add(r); }
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), cnFlagMat()); f.position.set(0, 1.38, rf + 0.006); g.add(f); }
  // the launch adapter's ring, the main engine, the four 150 N engines, thruster pods at the corners
  const lv = cyl(0.64, 0.62, 0.12, alu, 40, true); lv.position.y = -0.12; g.add(lv);
  const valve = cyl(0.13, 0.13, 0.16, grey, 16); valve.position.y = -0.16; g.add(valve);
  const eng = bell(CE5.O.eng, 0.24, mat('#3c3e42', 'metal', { side: THREE.DoubleSide })); eng.position.y = -CE5.O.eng; g.add(eng);
  for (let k = 0; k < 4; k++) { const n = bell(0.2, 0.06, mat('#45474b', 'metal', { side: THREE.DoubleSide })); n.position.set(...m20Polar(0.92, (45 + 90 * k) * DEG, -0.2)); g.add(n); }
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG, pod = new THREE.Group(); pod.position.set(...m20Polar(R - 0.1, a, 0.05)); pod.rotation.y = a; g.add(pod);
    pod.add(box(0.12, 0.07, 0.1, grey)); const n = bell(0.08, 0.03, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); n.position.set(0, -0.08, 0.02); pod.add(n);
  }
  // the dish antenna on a boom at the 135° face
  { const a = 135 * DEG, d = new THREE.Group(); d.position.set(...m20Polar(rf + 0.55, a, 0.85)); d.rotation.y = a; g.add(d);
    const dd = twDish(0.45, 0.1, mat('#efeee9', 'paint', { side: THREE.DoubleSide }), 32); dd.rotation.x = Math.PI / 2; d.add(dd);
    const fd = cyl(0.03, 0.03, 0.3, grey, 8); fd.rotation.x = Math.PI / 2; d.add(fd);
    g.add(m20Bar(m20Polar(rf, a, 0.85), m20Polar(rf + 0.52, a, 0.85), 0.03, alu)); }
  // the solar wings (accordions of three 1.3 × 1.5 m panels)
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(s * rf, H / 2, 0); if (s < 0) w.rotation.z = Math.PI; g.add(w);
    const yoke = [twBarMesh(0.02, alu), twBarMesh(0.02, alu)]; w.add(...yoke);
    const h0 = new THREE.Group(); w.add(h0); const hs = [h0];
    let par = h0; for (let i = 0; i < 3; i++) { par.add(twPanel(1.3, 1.5, 6, 7)); if (i < 2) { const h = new THREE.Group(); h.position.set(1.3, 0, i ? -0.035 : 0.035); par.add(h); hs.push(h); par = h; } }
    wings.push({ yoke, hs });
  }
  const wingPose = f => {
    for (const { yoke, hs } of wings) {
      const fu = twPhase(f, 0, 0.35), fo = twPhase(f, 0.25, 1);
      hs[0].position.set(twLerp(0.14, 0.4, fu), 0, twLerp(0.65, 0, fu));
      hs[0].rotation.y = twLerp(Math.PI / 2, 0, fo); hs[1].rotation.y = twLerp(-Math.PI, 0, fo); hs[2].rotation.y = twLerp(Math.PI, 0, fo);
      const t0 = hs[0].position; twSetBar(yoke[0], [0, 0.45, 0], [t0.x, 0.2, t0.z]); twSetBar(yoke[1], [0, -0.45, 0], [t0.x, -0.2, t0.z]);
    }
  };
  if (opts.deployT != null) g.userData.animate = t => wingPose(clamp((t - opts.deployT - 30) / 180, 0, 1));
  wingPose(opts.stowed || opts.deployT != null ? 0 : 1);
  // the returner on its ring
  const rr = cyl(0.6, 0.6, 0.04, alu, 32); rr.position.y = H - 0.02; g.add(rr);
  if (opts.returner !== false) { const r = ce5Returner(); r.position.y = CE5.RET.y0; g.add(r); }
  if (opts.support) g.add(ce5Upper(opts));
  g.userData.len = opts.support ? CE5.D.y + CE5.D.h : H; g.userData.mounts = [{ y: -CE5.O.eng, r: 0.24, tag: 'ORB' }];
  return g;
}

// the support module (a truncated cone round the returner) and the docking module on top of it: a ring with the three
// claws (opts.claws 'open' | 'closed') and the channel the sample container is pushed down (opts.channel)
function ce5Upper(opts = {}) {
  const g = new THREE.Group(), gold = foilMat('gold', 6), white = mat('#e8e8e3', 'paint'), alu = mat('#b9bec4', 'metal'), grey = mat('#80858c', 'metal'), dark = mat('#2b2d31', 'dark');
  const { y0, y1, r0, r1 } = CE5.S;
  const sh = cyl(r0, r1, y1 - y0, gold, 48, true); sh.position.y = y0; g.add(sh);
  const ins = cyl(r0 - 0.03, r1 - 0.03, y1 - y0, mat('#3a3c40', 'metal', { side: THREE.BackSide }), 48, true); ins.position.y = y0; g.add(ins);
  for (const [y, h] of [[y0, 0.08], [y0 + 0.75, 0.1], [y1 - 0.08, 0.08]]) { const f = (y + h / 2 - y0) / (y1 - y0), r = twLerp(r0, r1, f) + 0.006; const b = cyl(r + 0.004, r, h, white, 48, true); b.position.y = y; g.add(b); }
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * TAU / 8; g.add(m20Bar(m20Polar(r0 + 0.02, a, y0 + 0.05), m20Polar(r1 + 0.02, a, y1 - 0.05), 0.018, alu)); }
  const { y, h, r, rc } = CE5.D;
  const ring = cyl(r, r, h, alu, 48); ring.position.y = y; g.add(ring);
  const top = new THREE.Mesh(new THREE.RingGeometry(rc - 0.12, r, 48), mat('#9da2a8', 'metal', { side: THREE.DoubleSide })); top.rotation.x = -Math.PI / 2; top.position.y = y + h + 0.002; g.add(top);
  const claws = [];
  for (let k = 0; k < 3; k++) { // a K-shaped claw: a post and two fingers that close on the ascender's rod
    const a = k * TAU / 3, c = new THREE.Group(); c.position.set(...m20Polar(rc, a, y + h)); c.rotation.y = a; g.add(c);
    c.add(box(0.12, 0.2, 0.1, grey));
    const fs = [-1, 1].map(s => { const f = new THREE.Group(); f.position.set(0, 0.18, s * 0.03); c.add(f); const b = box(0.1, 0.17, 0.035, mat('#c9cdd2', 'metal')); b.geometry.translate(0, 0, s * 0.0175); f.add(b); f.userData.s = s; return f; });
    claws.push(fs);
  }
  const clawPose = closed => { for (const fs of claws) for (const f of fs) f.rotation.x = f.userData.s * (closed ? -0.12 : 0.55); };
  clawPose(opts.claws === 'closed');
  if (opts.channel) { const ch = box(0.24, 0.6, 0.24, mat('#c6cacf', 'metal')); ch.position.y = CE5.RET.y0 + CE5.RET.h + 0.02; g.add(ch); const cc = box(0.18, 0.04, 0.18, dark); cc.position.y = CE5.RET.y0 + CE5.RET.h + 0.6; g.add(cc); for (let k = 0; k < 3; k++) g.add(m20Bar(m20Polar(0.14, k * TAU / 3 + 0.5, CE5.D.y + 0.04), m20Polar(r - 0.04, k * TAU / 3 + 0.5, CE5.D.y + 0.04), 0.02, alu)); }
  return g;
}
// ---------------------------------------------------------------------------------------------------------------------
// The ascender (y = 0 at the foot of its body): an octagonal body in gold blankets on four short feet, its 3000 N engine
// under its centre, a solar panel fixed on each of the ±X faces, thruster pods at four corners; on its top deck the sealed
// sample container in the middle, the three rods the orbiter's claws close on, the rendezvous laser and camera.
function ce5Ascender() {
  const g = new THREE.Group(), { R, H } = CE5.A, rf = R * Math.cos(Math.PI / 8);
  const gold = foilMat('gold', 1.5), alu = mat('#bfc4ca', 'metal'), grey = mat('#80858c', 'metal'), dark = mat('#2a2c30', 'dark');
  g.add(twPrismSides(8, R, 0, H, 0, () => gold));
  g.add(twDeck(8, R, H, 0, mat('#e2e2de', 'paint', { side: THREE.DoubleSide })));
  g.add(twDeck(8, R, 0, 0, mat('#5d6066', 'metal', { side: THREE.DoubleSide }), 0, true));
  const eng = bell(CE5.A.eng, 0.2, mat('#3c3e42', 'metal', { side: THREE.DoubleSide })); eng.position.y = -CE5.A.eng; g.add(eng);
  for (let k = 0; k < 4; k++) { const ft = box(0.1, CE5.A.gap, 0.1, alu); ft.position.set(...m20Polar(0.55, (45 + 90 * k) * DEG, -CE5.A.gap)); g.add(ft); }
  for (const s of [1, -1]) { const p = twPanel(0.8, 0.66, 5, 4, '#7d838a'); p.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; p.position.set(s * (rf + 0.03), H / 2, s * 0.4); g.add(p); }
  for (let k = 0; k < 4; k++) { const a = (22.5 + 90 * k) * DEG, pod = new THREE.Group(); pod.position.set(...m20Polar(R - 0.06, a, H * 0.55)); pod.rotation.y = a; g.add(pod); pod.add(box(0.1, 0.1, 0.08, grey)); for (const s of [-1, 1]) { const n = bell(0.06, 0.025, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); n.rotation.z = s * Math.PI / 2; n.position.set(s * 0.05, 0.03, 0.03); pod.add(n); } }
  // on the top deck
  const can = cyl(0.17, 0.17, 0.3, mat('#eeeeea', 'paint'), 24); can.position.y = H; g.add(can);
  const lid = cyl(0.17, 0.12, 0.06, mat('#c9a04a', 'gold'), 24); lid.position.y = H + 0.3; g.add(lid);
  for (let k = 0; k < 3; k++) { // the rods: a bar across two short posts, facing out, at the claws' radius
    const a = k * TAU / 3, r = new THREE.Group(); r.position.set(...m20Polar(CE5.D.rc, a, H)); r.rotation.y = a; g.add(r);
    for (const x of [-0.12, 0.12]) { const p = box(0.035, 0.16, 0.035, alu); p.position.x = x; r.add(p); }
    const bar = cyl(0.022, 0.022, 0.3, mat('#d8dbde', 'metal'), 10); bar.rotation.z = Math.PI / 2; bar.position.set(0.15, 0.15, 0); r.add(bar);
  }
  const lz = box(0.16, 0.12, 0.16, dark); lz.position.set(...m20Polar(0.42, 60 * DEG, H)); g.add(lz);
  const cam = cyl(0.05, 0.05, 0.12, dark, 12); cam.position.set(...m20Polar(0.42, 300 * DEG, H)); g.add(cam);
  const ant = cyl(0.015, 0.015, 0.35, mat('#1d1e21', 'dark'), 8); ant.position.set(...m20Polar(0.5, 180 * DEG, H)); g.add(ant);
  g.userData.len = H; return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// The lander (y = 0 at the foot of its body): an octagonal body in gold blankets, its deck white round the hole the
// ascender's engine sits in; four legs from the diagonal faces (folded close to the body for launch, then swung out),
// footpads; the engine under its centre; the two solar wings at the top of the ±X faces (hanging down for launch, out flat
// in flight, raised on the Moon); the drill's tower on the −Z face, its rod going down into the ground; the arm with its
// scoop along the +Z edge; the panoramic camera's mast, the dish antenna; the flag on its pole at the back. pose:
// { legs(f), wings(φ), drill(d), arm(k), flag(f) }.
function ce5Lander() {
  const g = new THREE.Group(), { R, H } = CE5.L, rf = R * Math.cos(Math.PI / 8);
  const gold = foilMat('gold', 1.5), white = mat('#e8e8e3', 'paint'), alu = mat('#bfc4ca', 'metal'), grey = mat('#80858c', 'metal'), dark = mat('#2a2c30', 'dark');
  g.add(twPrismSides(8, R, 0, H, 0, k => k === 2 || k === 6 ? white : gold));
  g.add(twDeck(8, R, H, 0, mat('#deded9', 'paint', { side: THREE.DoubleSide }), 0.3));
  g.add(twDeck(8, R, 0, 0, mat('#5d6066', 'metal', { side: THREE.DoubleSide }), 0, true));
  const well = cyl(0.3, 0.3, 0.5, mat('#3a3c40', 'metal', { side: THREE.DoubleSide }), 24, true); well.position.y = H - 0.5; g.add(well);
  const eng = bell(CE5.L.eng, 0.3, mat('#3c3e42', 'metal', { side: THREE.DoubleSide })); eng.position.y = -CE5.L.eng; g.add(eng);
  const ch = cyl(0.14, 0.14, 0.14, grey, 16); ch.position.y = -0.14; g.add(ch);
  for (let k = 0; k < 4; k++) { const a = (22.5 + 90 * k) * DEG, pod = new THREE.Group(); pod.position.set(...m20Polar(rf - 0.12, a, 0)); pod.rotation.y = a; g.add(pod); pod.add(box(0.2, 0.08, 0.14, grey)); for (const s of [-1, 1]) { const n = bell(0.13, 0.045, mat('#3a3b3f', 'metal', { side: THREE.DoubleSide })); n.position.set(s * 0.06, -0.13, 0.02); pod.add(n); } }
  for (const [x, z] of [[0.5, 0.45], [-0.5, 0.45]]) { const r = box(0.24, 0.07, 0.18, dark); r.position.set(x, -0.07, z); g.add(r); } // the laser ranger and the altimeter
  // legs at the diagonal faces: the main strut on its hinge near the top, two side struts from the foot, the pad
  const legs = [], hingeY = 0.85, len = Math.hypot(0.85, hingeY + CE5.L.foot - 0.035);
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG, Lg = new THREE.Group(); Lg.position.set(...m20Polar(rf, a, hingeY)); Lg.rotation.y = a - Math.PI / 2; g.add(Lg);
    const main = twBarMesh(0.05, alu, 10), side = [twBarMesh(0.024, alu), twBarMesh(0.024, alu)], pad = cyl(0.25, 0.22, 0.07, mat('#c9a04a', 'gold'), 20);
    const cap = cyl(0.07, 0.07, 0.1, grey, 10); Lg.add(main, ...side, pad, cap); cap.position.y = -0.05;
    legs.push({ main, side, pad });
  }
  const legPose = f => {
    const b = twLerp(6, Math.atan2(0.85, hingeY + CE5.L.foot - 0.035) * RAD, f) * DEG, e = [len * Math.sin(b), -len * Math.cos(b), 0];
    for (const l of legs) { twSetBar(l.main, [0, 0, 0], e); for (const s of [0, 1]) twSetBar(l.side[s], [-0.2, -hingeY, s ? 0.36 : -0.36], [e[0] * 0.62, e[1] * 0.62, 0]); l.pad.position.set(e[0], e[1] - 0.035, 0); }
  };
  // solar wings on the ±X faces' top edges: φ = −90° hanging, 0 flat, + raised
  const wings = [];
  for (const s of [1, -1]) { const h = new THREE.Group(); h.position.set(s * (rf + 0.03), H, 0); if (s < 0) h.rotation.y = Math.PI; g.add(h); const p = twPanel(1.8, 1.2, 9, 6, '#5d6268'); p.rotation.x = -Math.PI / 2; h.add(p); wings.push(h); }
  // the drill's tower on the −Z face, and its rod
  const drill = new THREE.Group(); drill.position.set(0, 0, -(rf + 0.2)); g.add(drill);
  { const tw = box(0.3, 1.75, 0.3, white); tw.position.y = -0.7; drill.add(tw); const st = box(0.34, 0.12, 0.34, grey); st.position.y = -0.72; drill.add(st);
    for (const y of [0.15, 0.75]) g.add(m20Bar([0, y, -rf], [0, y, -(rf + 0.06)], 0.03, alu)); }
  const rod = cyl(0.035, 0.035, 1, mat('#9ea3a9', 'metal'), 10); rod.geometry.translate(0, -1, 0); drill.add(rod); rod.position.y = -0.72;
  // the arm: shoulder (yaw, pitch), elbow, wrist, the scoop; its base at the +Z edge of the deck
  const arm = new THREE.Group(); arm.position.set(0.42, H + 0.12, rf - 0.05); g.add(arm);
  const base = cyl(0.09, 0.09, 0.12, grey, 16); base.position.set(0.42, H, rf - 0.05); g.add(base);
  const j1 = new THREE.Group(); arm.add(j1); const up = box(1.3, 0.12, 0.12, white); up.geometry.translate(0.65, 0, 0); j1.add(up);
  const j2 = new THREE.Group(); j2.position.set(1.3, 0, 0.13); j1.add(j2); const fo = box(1.15, 0.1, 0.1, white); fo.geometry.translate(0.575, 0, 0); j2.add(fo);
  for (const [j, x] of [[j1, 0], [j2, 0]]) { const m = cyl(0.09, 0.09, 0.2, grey, 14); m.rotation.x = Math.PI / 2; m.position.x = x; j.add(m); }
  const j3 = new THREE.Group(); j3.position.set(1.15, 0, 0); j2.add(j3);
  { const w = cyl(0.06, 0.06, 0.12, grey, 12); w.rotation.x = Math.PI / 2; j3.add(w); const sc = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, TAU, 0, Math.PI / 2), mat('#c3c7cc', 'metal', { side: THREE.DoubleSide })); sc.rotation.z = -Math.PI / 2; sc.position.x = 0.14; j3.add(sc); const nc = box(0.06, 0.06, 0.06, dark); nc.position.set(0.08, 0.08, 0); j3.add(nc); }
  // arm poses [yaw, shoulder, elbow, wrist]: stowed along the edge; out over the ground in front, down into it; raised
  // upright (so that it turns clear of the ascender); over the ascender's sample container
  const ARM = { stow: [-Math.PI, 0.02, Math.PI - 0.02, 0], up: [-Math.PI / 2, 0.4, -1.2, -0.6], dig: [-Math.PI / 2, -0.62, -0.85, -0.55], lift: [-Math.PI / 2, 1.52, -1.3, -1.8], over: [1.936 - TAU, 1.52, -1.3, -1.8] };
  const armSet = q => { arm.rotation.y = q[0]; j1.rotation.z = q[1]; j2.rotation.z = q[2]; j3.rotation.z = q[3]; };
  // the panoramic camera's mast (front-left corner), the dish antenna (back-right)
  { const p = m20Polar(rf - 0.2, 315 * DEG, H), m = cyl(0.04, 0.04, 0.6, white, 10); m.position.set(...p); g.add(m); const hd = box(0.22, 0.14, 0.14, white); hd.position.set(p[0], H + 0.6, p[2]); g.add(hd); for (const x of [-0.06, 0.06]) { const l = cyl(0.025, 0.025, 0.03, dark, 12); l.rotation.x = Math.PI / 2; l.position.set(p[0] + x, H + 0.67, p[2] + 0.075); g.add(l); } }
  { const p = m20Polar(rf - 0.25, 135 * DEG, H), m = cyl(0.04, 0.04, 0.45, grey, 10); m.position.set(...p); g.add(m); const d = twDish(0.32, 0.08, mat('#efeee9', 'paint', { side: THREE.DoubleSide }), 28); d.position.set(p[0], H + 0.45, p[2]); d.rotation.x = -0.6; g.add(d); }
  // the flag: a pole that runs up from a box on the back-left face, the flag on a bar from its top
  const fa = 225 * DEG, flag = new THREE.Group(); flag.position.set(...m20Polar(rf + 0.08, fa, 0.5)); flag.rotation.y = fa - Math.PI / 2; g.add(flag);
  const fbox = box(0.16, 0.5, 0.12, grey); fbox.position.y = -0.25; flag.add(fbox);
  const pole = cyl(0.02, 0.02, 1, alu, 8); flag.add(pole);
  const fpiv = new THREE.Group(); flag.add(fpiv); const bar = cyl(0.012, 0.012, 1.25, alu, 6); bar.rotation.z = Math.PI / 2; bar.position.x = 0.62; fpiv.add(bar);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), cnFlagMat()); cloth.geometry.translate(0.6, -0.4, 0); fpiv.add(cloth);
  const flagPose = f => { const fp = twPhase(f, 0, 0.6), fc = twPhase(f, 0.5, 1), hgt = twLerp(0.3, 1.9, fp); pole.scale.y = hgt; fpiv.position.y = hgt; cloth.scale.set(Math.max(fc, 0.04), Math.max(fc, 0.15), 1); bar.scale.y = Math.max(fc, 0.05); bar.position.x = 0.62 * Math.max(fc, 0.05); cloth.visible = bar.visible = f > 0.3; };
  g.userData.pose = { legs: legPose, wings: phi => { for (const h of wings) h.rotation.z = phi; }, drill: d => { rod.scale.y = Math.max(d, 0.02); rod.visible = d > 0.01; }, arm: armSet, flag: flagPose, ARM };
  legPose(1); wings.forEach(h => h.rotation.z = 0); rod.visible = false; armSet(ARM.stow); flagPose(0);
  g.userData.len = H; g.userData.footY = -CE5.L.foot;
  return g;
}
// the arm's work on the surface, k from 0 to 1 over the scooping: several scoops in front, each emptied into the container
// on the ascender's top; joint angles interpolated between key poses
function ce5ArmAt(A, k) {
  const keys = [[0, A.stow], [0.05, A.up]];
  for (let i = 0; i < 3; i++) {
    const t0 = 0.06 + i * 0.3, yaw = -Math.PI / 2 + (i - 1) * 0.35, Y = q => [yaw, ...q.slice(1)];
    keys.push([t0, Y(A.up)], [t0 + 0.05, Y(A.dig)], [t0 + 0.09, [yaw + 0.08, ...A.dig.slice(1)]], [t0 + 0.13, Y(A.up)], [t0 + 0.16, Y(A.lift)], [t0 + 0.2, A.over], [t0 + 0.23, A.over], [t0 + 0.27, Y(A.lift)]);
  }
  keys.push([0.97, A.up], [1, A.stow]);
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] < k) i++;
  const [ta, qa] = keys[i], [tb, qb] = keys[i + 1], f = smoothstep(clamp((k - ta) / Math.max(tb - ta, 1e-6), 0, 1));
  return qa.map((v, j) => twLerp(v, qb[j], f));
}

// ---------------------------------------------------------------------------------------------------------------------
// The assemblies the app shows, by part (buildSC 'change5'): the four together (flags.stowed for launch, flags.deployT: the
// orbiter's wings and the lander's legs and wings open after separation); the orbiter with the returner (flags.dock ===
// false: the docking and support modules gone with the ascender); the orbiter with the ascender docked; the lander with
// the ascender (flags.landed: on the Moon, working from flags.tLand: the drill, the arm, the flag); the lander alone
// after the ascender has gone; the ascender (flags.dock: with the docking and support modules, released together); the
// orbiter without the returner; the returner.
const CE5_HOURS = { drill: [1.0, 5.7], arm: [6.0, 22.5], flag: 46.0 }; // after touchdown (2020-12-01 15:11 UTC: drilling done by 20:53, sampling sealed by 14:00 the next day; the flag before liftoff)
function ce5Assembly(P, flags) {
  const g = new THREE.Group(), mounts = [], H3 = 3600, has = k => P.has(k);
  const ascOnLander = (ln) => { const a = ce5Ascender(); a.position.y = CE5.L.H + CE5.A.gap; ln.add(a); return a; };
  const dockedAsc = () => { const a = ce5Ascender(); a.rotation.x = Math.PI; a.position.y = CE5.dockY + CE5.A.H; return a; };
  if (has('orbiter') && has('lander')) {
    const o = ce5Orbiter({ support: true, claws: 'open', stowed: flags.stowed, deployT: flags.deployT }); g.add(o); mounts.push(...o.userData.mounts);
    const ln = ce5Lander(); ln.position.y = CE5.L.y0; g.add(ln); ascOnLander(ln);
    for (let k = 0; k < 4; k++) { const a = (45 + 90 * k) * DEG; g.add(m20Bar(m20Polar(CE5.D.r - 0.05, a, CE5.D.y + CE5.D.h), m20Polar(0.9, a, CE5.L.y0), 0.04, mat('#b9bec4', 'metal'))); }
    const lp = ln.userData.pose, fold = f => { lp.legs(twPhase(f, 0.5, 1)); lp.wings(twLerp(-Math.PI / 2, 0, twPhase(f, 0, 0.5))); };
    if (flags.deployT != null) { const oa = o.userData.animate; g.userData.animate = t => { oa(t); fold(clamp((t - flags.deployT - 240) / 240, 0, 1)); }; }
    fold(flags.stowed || flags.deployT != null ? 0 : 1);
    g.userData.len = CE5.L.y0 + CE5.L.H + CE5.A.gap + CE5.A.H + 0.36; g.userData.yc0 = 2.4;
  }
  else if (has('orbiter') && has('ascent')) { const o = ce5Orbiter({ support: true, claws: 'closed', channel: true }); g.add(o, dockedAsc()); mounts.push(...o.userData.mounts); g.userData.len = CE5.dockY + CE5.A.H + CE5.A.eng; g.userData.yc0 = 2.0; }
  else if (has('orbiter')) { const sup = flags.dock !== false, o = ce5Orbiter({ support: sup, claws: 'open', channel: sup }); g.add(o); mounts.push(...o.userData.mounts); g.userData.yc0 = 2.0; }
  else if (has('service')) { const o = ce5Orbiter({ returner: false }); g.add(o); mounts.push(...o.userData.mounts); g.userData.yc0 = 2.0; }
  else if (has('ascent') && flags.dock) { g.add(ce5Upper({ claws: 'closed', channel: true }), dockedAsc()); g.userData.len = CE5.dockY + CE5.A.H + CE5.A.eng; g.userData.yc0 = 2.0; } // released with the docking and support modules (in the orbiter's frame)
  else if (has('ascent')) { const a = ce5Ascender(); g.add(a); mounts.push({ y: -CE5.A.eng, r: 0.2, tag: 'ASC' }); g.userData.footY = -(CE5.L.H + CE5.A.gap + CE5.L.foot); g.userData.len = CE5.A.H; }
  else if (has('lander') || has('descent')) {
    const ln = ce5Lander(); g.add(ln); const lp = ln.userData.pose; g.userData.footY = -CE5.L.foot; g.userData.len = has('lander') ? CE5.L.H + CE5.A.gap + CE5.A.H : CE5.L.H;
    if (has('lander')) ascOnLander(ln);
    if (has('descent')) { lp.wings(0.6); lp.flag(1); }
    else if (!flags.landed) mounts.push({ y: -CE5.L.eng, r: 0.3, tag: 'LDR' });
    else if (flags.tLand != null) {
      const T = flags.tLand, h = t => (t - T) / H3, [d0, d1] = CE5_HOURS.drill, [a0, a1] = CE5_HOURS.arm;
      g.userData.animate = t => {
        const x = h(t);
        lp.wings(twLerp(0, 0.6, clamp(x / 0.1, 0, 1)));
        lp.drill(x < d0 ? 0 : x < d1 - 0.7 ? 1.3 * (x - d0) / (d1 - 0.7 - d0) : 1.3 * clamp((d1 - x) / 0.7, 0, 1));
        lp.arm(x <= a0 || x >= a1 ? lp.ARM.stow : ce5ArmAt(lp.ARM, (x - a0) / (a1 - a0)));
        lp.flag(clamp((x - CE5_HOURS.flag) / 0.05, 0, 1));
      };
      g.userData.animate(T);
    } else lp.wings(0.6);
  }
  else if (has('capsule')) { g.add(ce5Returner()); g.userData.chuteY = CE5.RET.h; g.userData.capsuleR = CE5.RET.r; g.userData.len = CE5.RET.h; }
  g.userData.len = g.userData.len || 2;
  return { inner: g, mounts };
}
