// ============================================================================
// The cloud of a launch: what the exhaust does when it hits the pad. The engines' blast goes down the flame trench and
// out of both ends as a horizontal jet of fire that turns, within seconds, into rolling clouds of smoke and steam hundreds
// of metres across, lit orange from inside while the engines are still near and white in the sunlight as they rise and
// spread; round the launch mount the deluge water boils into white steam. Solid boosters make a dense white cloud of
// aluminium oxide, kerosene engines a browner, sootier one, hydrogen engines mostly steam.
// Drawn as puffs (camera-facing quads shaded as billowing balls of smoke, app/47_exhaust.js's shader) fixed to the pad, so
// the cloud stays where it was made as Earth turns. Each puff is a parcel let out of the trench at its own moment: it
// shoots out, slows, rises as the hot gas is buoyant, grows as it mixes with the air and thins out, and fades in a few
// minutes. The parcels follow each other, so the cloud is a continuous rolling mass rather than separate balls.
// ============================================================================
const PCL_N = 1500; // puffs
const PCL_FIRE = [1.0, 0.5, 0.2]; // the flame's light in the cloud
const _pclQ = new THREE.Quaternion(), _pclR = new THREE.Vector3(), _pclU = new THREE.Vector3();
const pclHash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function buildPadCloud() {
  if (!EXH.tex) initExhaust();
  const np = PCL_N, g = new THREE.BufferGeometry(), B = k => new THREE.BufferAttribute(new Float32Array(4 * np * k), k).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', B(3)); g.setAttribute('aUV', B(3)); g.setAttribute('aTau', B(1)); g.setAttribute('aSun', B(3)); g.setAttribute('aAmb', B(3)); g.setAttribute('aFog', B(1)); g.setAttribute('aFade', B(1));
  const ix = new Uint32Array(6 * np); for (let i = 0; i < np; i++) { const a = 4 * i; ix.set([a, a + 1, a + 2, a, a + 2, a + 3], 6 * i); }
  g.setIndex(new THREE.BufferAttribute(ix, 1)); g.setDrawRange(0, 0);
  const uvA = g.attributes.aUV.array; for (let i = 0; i < np; i++) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], k) => { uvA[12 * i + 3 * k] = x; uvA[12 * i + 3 * k + 1] = y; uvA[12 * i + 3 * k + 2] = pclHash(7 * i + 5) * 40; });
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: GLSL_PUFF_V, fragmentShader: GLSL_PUFF_F, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tNoise: { value: EXH.tex }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uFogCol: { value: new THREE.Color(0, 0, 0) }, uExpo: { value: 1 } } }));
  m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.userData.isPadCloud = true;
  return m;
}
// what the cloud is made of, from the engines that fire at liftoff: colour and density per propellant
function pclMix(L) {
  const st = liftoffStages(L); let w = 0, col = [0, 0, 0], soot = 0;
  for (const s of st) { const P = EXH_PROP[s.prop] || EXH_PROP.kerolox, f = stageFlow(s) * (0.4 + P.k); w += f; soot += (s.prop === 'kerolox' ? 1 : s.prop === 'hypergolic' || s.prop === 'udmh' || s.prop === 'mmh' ? 0.8 : 0.1) * f; for (let j = 0; j < 3; j++) col[j] += P.col[j] * f; }
  if (!w) return { col: [0.9, 0.9, 0.9], soot: 0.3 };
  return { col: col.map(x => x / w), soot: soot / w };
}
// g: the pad group (metres, scaled to km); blast(te): how hard the engines hit the pad at te; sC: the vehicle's size of
// blast (1 for the Saturn V); sunUp: sine of the Sun's elevation at the pad
function updatePadCloud(g, t, tIgn, span, blast, sC, L, sunUp) {
  const cl = g.children.find(o => o.userData.isPadCloud); if (!cl || cl.userData.off) return;
  const ud = g.userData, trenchD = ud.trenchD, foot = ud.foot, deckY = ud.deckY;
  if (!cl.userData.mix) cl.userData.mix = pclMix(L);
  if (!cl.userData.wind) { const md = MV.md; let seed = 0; for (const ch of md.cfg.launch + md.cfg.site) seed = (seed * 31 + ch.charCodeAt(0)) | 0; cl.userData.wind = exhWind(seed)(0.05); } // the launch's wind near the ground (m/s east, north), the one the exhaust trail drifts on
  const wind = cl.userData.wind;
  const { soot } = cl.userData.mix, col = cl.userData.mix.col.map(x => x * (1 - 0.3 * soot)); // sooty exhaust is darker
  // light on the cloud: the Sun through the air (reddened low down), the sky's blue, and the flames; at night only the flames
  const day = clamp(0.1 + sunUp * 3, 0, 1), sunC = R.sunLight.color, sunR = 0.5 * sunC.r * day, sunG = 0.5 * sunC.g * day, sunB = 0.5 * sunC.b * day;
  const ambR = 0.03 + 0.14 * day * 0.75, ambG = 0.04 + 0.14 * day * 0.85, ambB = 0.05 + 0.14 * day;
  const U = cl.material.uniforms; U.uSunDir.value.copy(R.sunLight.position).normalize(); U.uExpo.value = 1;
  // camera right and up in the pad's frame, for the quads
  _pclQ.copy(g.quaternion).invert();
  _pclR.set(R.camera.matrixWorld.elements[0], R.camera.matrixWorld.elements[1], R.camera.matrixWorld.elements[2]).applyQuaternion(_pclQ);
  _pclU.set(R.camera.matrixWorld.elements[4], R.camera.matrixWorld.elements[5], R.camera.matrixWorld.elements[6]).applyQuaternion(_pclQ);
  const A = cl.geometry.attributes, pos = A.position.array, tau = A.aTau.array, sun = A.aSun.array, amb = A.aAmb.array, fog = A.aFog.array, fade = A.aFade.array;
  let n = 0;
  const S3 = Math.sqrt(sC);
  for (let i = 0; i < PCL_N; i++) {
    const r1 = pclHash(5 * i + 1), r2 = pclHash(5 * i + 2), r3 = pclHash(5 * i + 3), r4 = pclHash(5 * i + 4);
    const te = tIgn + Math.pow(i / PCL_N, 1.5) * span + r1 * 0.1, a = t - te; if (a < 0) continue; // (most of them in the first seconds, when the blast is fiercest)
    const k = blast(te); if (k < 0.03 || a > 240) continue;
    let x, y, z, sz, od, glow; const kind = i % 4;
    if (kind < 3) { // out of the trench: a jet of fire that becomes rolling smoke
      const side = kind % 2 ? 1 : -1, v0 = (70 + 60 * r2) * (0.35 + 0.65 * k) * (0.6 + 0.4 * S3), tauV = 2.4 + 1.2 * r3;
      const d = trenchD + v0 * tauV * (1 - Math.exp(-a / tauV)) + (1.2 + 1.5 * r4) * a; // along the trench, slowing, then drifting on
      const rise = a < 14 ? 2.5 * a + 0.3 * a * a : 2.5 * 14 + 0.3 * 196 + 10.9 * (a - 14); // buoyant: up to 11 m/s
      const lift = (0.3 + 0.7 * r4) * rise * (0.8 + 0.4 * S3), top = Math.min(lift / Math.max(rise, 1) * 1.4, 1); // how near the parcel is to the top of the column
      // the cap: the hot column's top rolls over as a vortex ring, its parcels going out and round and down; the ring widens as it climbs
      const ring = 0.3 * lift * smoothstep((a - 3) / 8), th = r2 * TAU + 0.35 * a * top, roll = ring * top;
      const spread = (r3 - 0.5) * (18 + 2.4 * a) * S3 + roll * Math.cos(th) * Math.sign(r3 - 0.5);
      x = spread + 10 * Math.sin(0.7 * a + 6 * r2) * Math.min(a / 5, 1); z = side * d + roll * 0.5 * Math.sin(th); y = 7 + lift * (0.25 + 0.75 * Math.min(a / 2, 1)) + roll * 0.6 * Math.sin(th);
      sz = (18 + 65 * (1 - Math.exp(-a / 7)) + 1.1 * a) * (0.5 + 0.5 * S3) * (0.8 + 0.4 * r2);
      od = (1.8 + 1.4 * soot) * Math.pow(18 / sz, 0.8) * (0.5 + 0.5 * k); glow = Math.exp(-a / 1.6) * (0.4 + 0.6 * k) * 1.4;
    } else { // steam from the deluge water, boiling up round the launch mount
      const ang = r2 * TAU, rr = foot + 4 + 14 * r3 + 2.5 * a; x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; y = deckY + 2 + (3 + 4 * r1) * a + 0.1 * a * a;
      sz = (9 + 30 * (1 - Math.exp(-a / 5)) + 0.7 * a) * (0.5 + 0.5 * S3); od = 1.6 * Math.pow(10 / sz, 0.7) * (0.5 + 0.5 * k); glow = 0.35 * Math.exp(-a / 1.5) * k;
    }
    const wd = 0.7 * Math.max(a - 2, 0); x -= wind[0] * wd; z += wind[1] * wd; // the surface wind carries the cloud off (pad frame: +X west, +Z north)
    const life = Math.exp(-a / (70 + 40 * sC)) * (1 - smoothstep((a - 150) / 90));
    const o = 4 * n, hs = sz; // the quad's half-size (the puff's radius is 0.75 of it)
    for (let c = 0; c < 4; c++) {
      const qx = c === 0 || c === 3 ? -1 : 1, qy = c < 2 ? -1 : 1, j = 3 * (o + c);
      pos[j] = x + (_pclR.x * qx + _pclU.x * qy) * hs; pos[j + 1] = y + (_pclR.y * qx + _pclU.y * qy) * hs; pos[j + 2] = z + (_pclR.z * qx + _pclU.z * qy) * hs;
      tau[o + c] = od * life; fade[o + c] = 1; fog[o + c] = 0; // (fully billowed from the start: the jet is one continuous mass)
      sun[j] = sunR * col[0]; sun[j + 1] = sunG * col[1]; sun[j + 2] = sunB * col[2];
      amb[j] = ambR * col[0] + PCL_FIRE[0] * glow * 2.2; amb[j + 1] = ambG * col[1] + PCL_FIRE[1] * glow * 2.2; amb[j + 2] = ambB * col[2] + PCL_FIRE[2] * glow * 2.2;
    }
    n++;
  }
  for (const k of ['position', 'aTau', 'aSun', 'aAmb', 'aFog', 'aFade']) A[k].needsUpdate = true;
  cl.geometry.setDrawRange(0, 6 * n); cl.visible = n > 0;
}
