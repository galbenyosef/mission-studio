// ============================================================================
// Exhaust in the air after liftoff: the trail a launch leaves through the atmosphere. Solid boosters lay a dense white
// column of aluminium-oxide smoke, kerosene engines a thinner grey one, hydrogen and methane engines little but a contrail
// where their water freezes in the cold upper troposphere. The trail spreads, fades over half an hour and drifts on the
// winds: kinked by the shear around the jet stream and, higher up, twisted into corkscrews by the tides and gravity waves of
// the upper atmosphere. Above 60 km the exhaust no longer mixes into the air: it expands into a vast thin cloud that freezes
// into ice.
// Sunlight reaches each part of it through the air between it and the Sun: reddened through the long path at dawn and dusk,
// cut off in Earth's shadow. After sunset the high exhaust is still in sunlight while the ground is dark, and glows against
// the night sky as a spreading, luminous cloud (the "twilight phenomenon"). Near the vehicle the flame lights the smoke.
// The trail is a ribbon along the path the engines took (where they were at each moment, carried round by the turning Earth
// and the wind since), turned to face the camera and shaded as a round column of smoke: thick through the middle, thin at the
// edges, billowing. Where a ribbon would show its edge (high up, where the trail spreads wider than it is long, and seen
// end-on or from close by) round puffs facing the camera carry the smoke instead.
// ============================================================================
const EXH = { n: 0, mesh: null, puffs: null, tex: null, off: false };
// what each propellant leaves in the air: optical thickness per kg burnt per metre of path (relative), extra for water
// freezing out where the air is cold, how long the trail lasts (s), its colour
const EXH_PROP = {
  solid: { k: 1.0, ice: 0.02, life: 1500, col: [0.93, 0.92, 0.9] }, // aluminium oxide smoke: the dense column of solid boosters
  kerolox: { k: 0.3, ice: 0.03, life: 700, col: [0.8, 0.78, 0.75] }, // soot and steam
  hydrolox: { k: 0.05, ice: 0.05, life: 420, col: [0.96, 0.97, 0.98] }, // water only: a contrail where it freezes
  methalox: { k: 0.08, ice: 0.05, life: 480, col: [0.95, 0.95, 0.96] },
  hypergolic: { k: 0.28, ice: 0.03, life: 600, col: [0.88, 0.78, 0.64] }, // nitrogen dioxide tints it orange-brown
};
EXH_PROP.udmh = EXH_PROP.hypergolic; EXH_PROP.mmh = EXH_PROP.hypergolic;
const EXH_C = 100; // optical depth per (kg of exhaust per m² of trail), scaled by the propellant's k
const EXH_H = 8.5; // km: scale height of the air for the light's path
const EXH_EXT = [0.042, 0.085, 0.17]; // vertical optical depth of the air down to sea level, red, green, blue (scattering and haze)
// The exhaust's spread at emission (m) for a vehicle w across at the base: the plume widens as the air thins (an under-
// expanded jet), up to 20 km
const exhW0 = (w, h) => Math.min(w * Math.pow(Math.exp(Math.max(h, 0) / 7.2), 0.4), 20000);
// how fast the exhaust expands into the near-vacuum above 60 km (m/s)
const exhVx = h => 600 * Math.pow(smoothstep((h - 60) / 90), 1.3);
// water freezing out of the exhaust: in the cold upper troposphere, and into the ice clouds of the mesosphere and above
const exhIce = h => 3 * Math.exp(-Math.pow((h - 11) / 3.5, 2)) + 40 * smoothstep((h - 62) / 40);
// A wind profile for the launch (m/s toward east and north at height h, km), drawn from the date and site: a surface wind
// veering into the westerlies, the jet stream near 11 km, stratospheric winds turning with height, and gravity waves whose
// winds grow as the air thins and turn with height.
function exhWind(seed) {
  const rnd = mulberry32(seed);
  const jetDir = (rnd() * 2 - 1) * 0.7, jet = 15 + 25 * rnd(), jetH = 10 + 3 * rnd(), sfc = 3 + 6 * rnd(), sfcDir = rnd() * TAU, str = 5 + 15 * rnd(), strDir = rnd() * TAU;
  const waves = [3.6, 5.9, 9.4, 14.5, 22].map(l => ({ lam: l * (0.8 + 0.4 * rnd()), ph: rnd() * TAU, a: (0.5 + 0.5 * rnd()) * Math.sqrt(l / 9), s: rnd() < 0.5 ? 1 : -1 })); // vertical wavelengths (km): the short ones weaker
  return h => {
    const fs = Math.exp(-h / 1.5), fj = Math.exp(-Math.pow((h - jetH) / 4.5, 2)) + 0.2 * smoothstep(h / 6) * (1 - smoothstep((h - 20) / 10)), fu = smoothstep((h - 18) / 12);
    let e = sfc * fs * Math.cos(sfcDir) + jet * fj * Math.cos(jetDir) + str * fu * Math.cos(strDir + h / 25);
    let n = sfc * fs * Math.sin(sfcDir) + jet * fj * Math.sin(jetDir) + str * fu * Math.sin(strDir + h / 25);
    const A = (2.5 + 55 * smoothstep((h - 50) / 40)) * 0.45; // m/s per wave
    for (const w of waves) { const ph = w.s * TAU * h / w.lam + w.ph; e += A * w.a * Math.cos(ph); n += A * w.a * Math.sin(ph); }
    return [e, n];
  };
}
// the engines firing at te: [[propellant, kg/s] …], from the launch configuration (the core stage's throttle, the boosters'
// thrust curve) or the upper stage's thrust
function exhFlows(c, L, te, t0) {
  const s = c.o.stateAt(te); if (!s || !(s.T > 0)) return { s, flows: [] };
  const cf = cfgAt(c, te), out = [];
  if (cf && cf.key === 'launch') {
    const st = L.stages.find(x => x.id === (s.extra && s.extra.stage)); if (st) out.push([st.prop, stageFlow(st) * (s.extra.throttle ?? 1)]);
    const b = L.stages[0].parallel ? L.stages[0] : null;
    if (b && cf.boosters) { const f = b.curve ? Math.max(curveAt(b.curve, te - t0), 0) : 1; if (f > 0.02) out.push([b.prop, stageFlow(b) * f]); }
  } else if (cf && cf.key === 'stack') { const st = L.stages[cf.stage]; if (st) out.push([st.prop, s.T / (st.ispVac * G0)]); }
  return { s, flows: out };
}
function initExhaust() {
  // tileable billows: value noise in a few octaves
  const N = 256, rnd = mulberry32(11), v = new Float32Array(N * N);
  for (const [S, amp] of [[4, 0.4], [8, 0.27], [16, 0.17], [32, 0.1], [64, 0.06]]) {
    const L = new Float32Array(S * S); for (let i = 0; i < S * S; i++) L[i] = rnd();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * S, fy = y / N * S, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = L[(y0 % S) * S + x0 % S], b = L[(y0 % S) * S + (x0 + 1) % S], c = L[((y0 + 1) % S) * S + x0 % S], d = L[((y0 + 1) % S) * S + (x0 + 1) % S];
      v[y * N + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const q = clamp(Math.round(255 * smoothstep((v[i] - 0.18) / 0.64)), 0, 255); img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = q; img.data[4 * i + 3] = 255; }
  g.putImageData(img, 0, 0);
  EXH.tex = new THREE.CanvasTexture(cv); EXH.tex.wrapS = EXH.tex.wrapT = THREE.RepeatWrapping; EXH.tex.generateMipmaps = true; EXH.tex.minFilter = THREE.LinearMipmapLinearFilter;
}
const GLSL_EXH_COMMON = `
uniform sampler2D tNoise; uniform vec3 uSunDir; uniform vec3 uFogCol; uniform float uExpo; uniform float uHG;
varying vec3 vUV; varying float vTau; varying vec3 vSun; varying vec3 vAmb; varying float vFog; varying vec3 vWP; varying float vFade;
// Smoke of optical depth tau seen at a point where its surface (a column's or a puff's) faces N. Dense smoke scatters like a
// matt surface (light diffusing through it reaches its far side too); thin smoke glows looking toward the Sun (forward
// scattering, Henyey–Greenstein g = 0.6). Premultiplied: a thin veil in sunlight against a dark sky (exposed for the dark:
// uExpo) can outshine its own opacity many times over, so the light is not capped by it.
vec4 smoke(float tau, float edge, vec3 N, float n) {
  // out of the flame the smoke billows into view, the bulging parts (n high) first (vFade: 0 at the flame, 1 clear of it)
  float fd = clamp((vFade - 0.45 * (1.0 - n)) / 0.55, 0.0, 1.0);
  float a = (1.0 - exp(-tau)) * edge * fd * fd;
  vec3 V = normalize(cameraPosition - vWP);
  float wrap = clamp((dot(N, uSunDir) + 0.8) / 1.8, 0.0, 1.0);
  float ct = dot(-V, uSunDir), hg = 0.64 / pow(1.36 - 1.2 * ct, 1.5);
  vec3 sunL = vSun * mix(wrap, 0.12 + 0.3 * hg * uHG, exp(-tau)) * uExpo, ambL = vAmb * (0.8 + 0.4 * n);
  float af = a * (1.0 - 0.7 * vFog);
  vec3 col = mix(sunL + ambL, uFogCol, vFog) * af;
  float mx = max(max(col.r, col.g), col.b); if (mx > 1.0) col /= mx; // overexposed: keep the hue
  return vec4(col, af);
}
float bil(vec2 p) { return texture2D(tNoise, p * vec2(0.37, 0.19) + vec2(0.0, 0.5)).r * 0.62 + texture2D(tNoise, p * vec2(1.21, 0.47) + vec2(0.31, 0.17)).r * 0.38; }`;
const GLSL_EXH_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aUV; attribute float aTau; attribute vec3 aSun; attribute vec3 aAmb; attribute float aFog; attribute vec3 aSide; attribute float aFade;
varying vec3 vUV; varying float vTau; varying vec3 vSun; varying vec3 vAmb; varying float vFog; varying vec3 vSide; varying vec3 vWP; varying float vFade;
void main(){ vUV = aUV; vTau = aTau; vSun = aSun; vAmb = aAmb; vFog = aFog; vSide = aSide; vFade = aFade;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
#include <logdepthbuf_vertex>
}`;
// the ribbon: a round column seen from the side; vUV = (along the trail, across it −1.25 … 1.25, log2 of its spread)
const GLSL_EXH_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_EXH_COMMON}
varying vec3 vSide;
void main(){
  #include <logdepthbuf_fragment>
  float v = vUV.y;
  // billows fixed to the smoke push its edge in and out and vary its thickness. They are sized to the trail's width now:
  // as it spreads, the pattern it was emitted with gives way to one twice, four times … as coarse
  float k = floor(vUV.z), f = vUV.z - k, s0 = exp2(-k);
  float n = mix(bil(vec2(vUV.x * s0 + 0.43 * k, v)), bil(vec2(vUV.x * s0 * 0.5 + 0.43 * (k + 1.0), v)), f);
  float rEdge = 0.62 + 0.62 * n, x = abs(v) / rEdge; if (x >= 1.0) discard; // the column's edge, in its nominal radius
  float chord = sqrt(1.0 - x * x);
  vec3 V = normalize(cameraPosition - vWP);
  vec4 c = smoke(vTau * chord * (0.45 + 1.1 * n), 1.0 - smoothstep(0.62, 1.0, x), normalize(vSide * (v / rEdge) + V * chord), n);
  if (max(max(c.r, c.g), c.b) < 0.0015 && c.a < 0.002) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.a = c.a;
}`;
// the puffs: the exhaust high up, which spreads into a wide, thin cloud, as overlapping round puffs facing the camera (a
// ribbon would fold on itself seen end-on); vUV = (corner −1 … 1, −1 … 1, a number for the puff's own billows)
const GLSL_PUFF_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aUV; attribute float aTau; attribute vec3 aSun; attribute vec3 aAmb; attribute float aFog; attribute float aFade; attribute vec3 aN;
varying vec3 vUV; varying float vTau; varying vec3 vSun; varying vec3 vAmb; varying float vFog; varying vec3 vWP; varying float vFade; varying vec3 vN;
void main(){ vUV = aUV; vTau = aTau; vSun = aSun; vAmb = aAmb; vFog = aFog; vFade = aFade; vN = mat3(modelMatrix) * aN;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
#include <logdepthbuf_vertex>
}`;
const GLSL_PUFF_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
${GLSL_EXH_COMMON}
varying vec3 vN;
void main(){
  #include <logdepthbuf_fragment>
  vec2 q = vUV.xy; float n = bil(q * 0.45 + vec2(vUV.z * 0.137, vUV.z * 0.071));
  float n2 = bil(q * 1.4 + vec2(vUV.z * 0.311, vUV.z * 0.197)); // finer billows, which eat into the outline
  float rEdge = 0.75 * (0.7 + 0.6 * n), x = length(q) / rEdge; if (x >= 1.0) discard; // the puff's radius is 0.75 of the quad's half-size
  float chord = sqrt(1.0 - x * x);
  vec3 V = normalize(cameraPosition - vWP), right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // the outline: faded over most of the radius and eroded by the finer billows, so no puff reads as a disc
  float edge = (1.0 - smoothstep(0.25, 1.0, x)) * smoothstep(0.12, 0.55, n2 + 0.6 * (1.0 - x));
  // the shading: a soft blob is nearly flat, but where the puff knows which way it bulges out of its cloud (aN, the
  // launch cloud's rolling mass) it is lit as that surface, with the finer billows modelling it
  vec3 Nf = normalize(0.4 * (right * q.x + up * q.y) / rEdge + V * chord);
  float hasN = step(0.5, length(vN));
  vec3 Nc = normalize(mix(Nf, normalize(vN + 1.1 * (right * (n2 - 0.5) + up * (n - 0.5))), 0.75 * hasN));
  vec4 c = smoke(vTau * chord * (0.45 + 1.1 * n), edge, Nc, n);
  c.rgb *= mix(1.0, 0.55 + 0.5 * smoothstep(0.2, 0.8, n2), hasN); // the clefts between the billows, where less light gets in
  if (max(max(c.r, c.g), c.b) < 0.0015 && c.a < 0.002) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.a = c.a;
}`;
const EXH_PUFF_H = [50, 68]; // km: the ribbon gives way to puffs between these heights
const EXH_SUB = 400; // points the ribbon may add between samples near the engines
function disposeExhaust() {
  for (const k of ['mesh', 'puffs']) if (EXH[k]) { R.scene.remove(EXH[k]); EXH[k].geometry.dispose(); EXH[k].material.dispose(); EXH[k] = null; }
  EXH.n = 0;
}
// Samples along the ascent, from liftoff until the vehicle reaches orbit (or rises out of the atmosphere's reach): where the
// engines were, their exhaust's spread, thickness, colour and lifetime, the wind there, a coordinate along the trail for the
// billows.
function buildExhaust(md) {
  disposeExhaust();
  const c = craftById('ship'), L = md.L, site = LAUNCH_SITES[md.cfg.site];
  if (!c || !L || !site || !c.o.segs.length) return;
  const asc = c.o.segs[0]; if (!asc.meta || asc.meta.phase !== 'ascent') return;
  const t0 = md.M.t0, R0 = BODIES.earth.R, stand = padStandH() / 1000;
  let seed = 0; for (const ch of md.cfg.launch + md.cfg.site) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const wind = exhWind(seed);
  const bst = L.stages[0].parallel ? L.stages[0] : null;
  const base = 3.5 * Math.max(L.diameter, bst && bst.booster ? 2 * (bst.booster.offset + bst.geom[0][1]) : 0); // m: the column just behind the engines
  const S = []; let te = t0 + 0.05, u = 0, prev = null, dtP = 0, vP = 0;
  while (te < asc.t1) {
    const { s, flows } = exhFlows(c, L, te, t0); if (!s) break;
    const h = vnorm(s.r) - R0; if (h > 450) break;
    const om = bodyOmegaEcl('earth', te), va = vsub(s.v, vcross(om, s.r)), vAir = vnorm(va) * 1000;
    const ax = s.dir && vnorm(s.dir) > 0.5 ? vunit(s.dir) : vunit(s.r);
    const r = vadd(s.r, vscale(ax, stand)); // the engines: the stack stands on its state point (app/40_missionview.js anchorY)
    const w0 = exhW0(base, h), ice = exhIce(h);
    let kf = 0, life = 0, col = [0, 0, 0];
    for (const [p, f] of flows) { const P = EXH_PROP[p] || EXH_PROP.kerolox, k = (P.k + P.ice * ice) * f; kf += k; life += P.life * k; for (let j = 0; j < 3; j++) col[j] += P.col[j] * k; }
    if (kf > 0) { life /= kf; col = col.map(x => x / kf); } else { life = 600; col = [0.9, 0.9, 0.9]; }
    life *= 1 + 2 * smoothstep((h - 60) / 40); // ice high up lasts
    const tau0 = EXH_C * kf / Math.max(vAir, 15) / w0;
    const lf = localFrame('earth', s.r, te), [we, wn] = wind(h), dW = vscale(vadd(vscale(lf.east, we), vscale(lf.north, wn)), 0.001); // km/s
    if (prev) u += 0.5 * (vAir + vP) * dtP / Math.max(0.5 * (w0 + prev.w0), 1); // along the path through the air, in trail widths
    const x = { te, r, dW, h, w0, tau0, col, life, u, vx: exhVx(h) }; S.push(x); prev = x;
    dtP = clamp(0.35 * w0 / Math.max(vAir, 1), 0.08, 2.5); vP = vAir; te += dtP;
  }
  if (S.length < 2) return;
  EXH.n = S.length; EXH.t0 = t0; EXH.t1 = asc.t1;
  const N = S.length, F = k => new Float64Array(k * N); // the samples as flat arrays, for the work done every frame
  const NR = N + 1 + EXH_SUB; // the ribbon's points: kept samples and the extra ones near the engines
  Object.assign(EXH, { TE: F(1), RX: F(3), DW: F(3), W0: F(1), TAU0: F(1), LIFE: F(1), U: F(1), VX: F(1), H: F(1), COL: F(3), P: new Float64Array(3 * (N + 1)), dH: new Float64Array(N + 1), W: new Float64Array(N + 1), keep: new Int32Array(N + 1),
    ra: new Int32Array(NR), rb: new Int32Array(NR), rf: new Float64Array(NR), rg: new Float64Array(3 * NR) });
  S.forEach((x, i) => { EXH.TE[i] = x.te; EXH.W0[i] = x.w0; EXH.TAU0[i] = x.tau0; EXH.LIFE[i] = x.life; EXH.U[i] = x.u; EXH.VX[i] = x.vx; EXH.H[i] = x.h; for (let k = 0; k < 3; k++) { EXH.RX[3 * i + k] = x.r[k]; EXH.DW[3 * i + k] = x.dW[k]; EXH.COL[3 * i + k] = x.col[k]; } });
  const cap = NR;
  const g = new THREE.BufferGeometry(), A = k => new THREE.BufferAttribute(new Float32Array(2 * cap * k), k).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', A(3)); g.setAttribute('aUV', A(3)); g.setAttribute('aTau', A(1)); g.setAttribute('aSun', A(3)); g.setAttribute('aAmb', A(3)); g.setAttribute('aFog', A(1)); g.setAttribute('aSide', A(3)); g.setAttribute('aFade', A(1));
  const idx = new Uint32Array(6 * (cap - 1)); for (let i = 0; i < cap - 1; i++) { const a = 2 * i; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], 6 * i); }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const U = { tNoise: { value: EXH.tex }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uFogCol: { value: new THREE.Color(0, 0, 0) }, uExpo: { value: 1 }, uHG: { value: 1 } }; // shared by both
  const mk = (geo, vs, fs) => { const ms = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide, uniforms: U }));
    ms.frustumCulled = false; ms.renderOrder = 4; ms.visible = false; R.scene.add(ms); return ms; };
  EXH.mesh = mk(g, GLSL_EXH_V, GLSL_EXH_F);
  { // the puffs: as many as the trail could need (one per ribbon point at most)
    const np = NR, gp = new THREE.BufferGeometry(), B = k => new THREE.BufferAttribute(new Float32Array(4 * np * k), k).setUsage(THREE.DynamicDrawUsage);
    gp.setAttribute('position', B(3)); gp.setAttribute('aUV', B(3)); gp.setAttribute('aTau', B(1)); gp.setAttribute('aSun', B(3)); gp.setAttribute('aAmb', B(3)); gp.setAttribute('aFog', B(1)); gp.setAttribute('aFade', B(1)); gp.setAttribute('aN', B(3)); // (aN stays zero: the trail's puffs are shaded as flat blobs)
    const ix = new Uint32Array(6 * np); for (let i = 0; i < np; i++) { const a = 4 * i; ix.set([a, a + 1, a + 2, a, a + 2, a + 3], 6 * i); }
    gp.setIndex(new THREE.BufferAttribute(ix, 1));
    const uvA = gp.attributes.aUV.array; for (let i = 0; i < np; i++) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], k) => { uvA[12 * i + 3 * k] = x; uvA[12 * i + 3 * k + 1] = y; });
    EXH.puffs = mk(gp, GLSL_PUFF_V, GLSL_PUFF_F);
  }
}
// sunlight reaching geocentric point p (km) along direction sd (unit, toward the Sun): [r, g, b], 0 in Earth's shadow
const _exhT = [0, 0, 0];
function exhSunlight(px, py, pz, sd) {
  const R0 = BODIES.earth.R, rr = Math.sqrt(px * px + py * py + pz * pz), h = rr - R0, d = px * sd[0] + py * sd[1] + pz * sd[2];
  let ht, am, sh;
  // the shadow's soft edge: haze, clouds and hills block light that skims the ground
  if (d >= 0) { ht = h; const mu = d / rr, k = (R0 + Math.max(h, 0)) / EXH_H; am = Math.sqrt(k * k * mu * mu + 2 * k + 1) - k * mu; sh = 1 - (1 - smoothstep((h + 1.5) / 7.5)) * (1 - smoothstep(mu / 0.035)); } // air mass along the slant path up and out
  else { ht = Math.sqrt(Math.max(rr * rr - d * d, 0)) - R0; am = Math.sqrt(Math.PI * (R0 + Math.max(ht, 0)) / (2 * EXH_H)) * (1 + smoothstep((h - ht) / (3 * EXH_H))); sh = smoothstep((ht + 1.5) / 7.5); } // through the air down to the ray's lowest point (and up again)
  const tr = Math.exp(-Math.max(ht, 0) / EXH_H) * am;
  for (let j = 0; j < 3; j++) _exhT[j] = sh * Math.min(1, Math.exp(-EXH_EXT[j] * (tr - 1)));
  return _exhT;
}
const _exhV = new THREE.Vector3(), _exhR = new THREE.Vector3(), _exhU = new THREE.Vector3();
const EXH_TINT = [0.82, 0.9, 1.0], EXH_FIRE = [1.0, 0.55, 0.24]; // skylight; the flame's light
function updateExhaust(t) {
  const mesh = EXH.mesh; if (!mesh) return;
  const N = EXH.n, t0 = EXH.t0, pf = EXH.puffs;
  const hide = () => { mesh.visible = false; if (pf) pf.visible = false; };
  if (t < t0 + 0.2 || t > t0 + 2700 || EXH.off) { hide(); return; }
  const O = R.O, E = helio('earth', t).r, om = bodyOmegaEcl('earth', t), wm = vnorm(om), kx = om[0] / wm, ky = om[1] / wm, kz = om[2] / wm, R0 = BODIES.earth.R;
  const cam = R.camera.position, cgx = cam.x + O[0] - E[0], cgy = cam.y + O[1] - E[1], cgz = cam.z + O[2] - E[2], hc = Math.hypot(cgx, cgy, cgz) - R0;
  const { TE, RX, DW, W0, TAU0, LIFE, U, VX, H, COL, P, dH, W, keep } = EXH;
  // the samples emitted so far, carried round by the turning Earth and moved by the wind since (geocentric, km)
  let n = 0; while (n < N && TE[n] <= t) n++;
  if (n < 2) { hide(); return; }
  for (let i = 0; i < n; i++) {
    const a = t - TE[i], c = Math.cos(wm * a), sn = Math.sin(wm * a), vx = RX[3 * i] + DW[3 * i] * a, vy = RX[3 * i + 1] + DW[3 * i + 1] * a, vz = RX[3 * i + 2] + DW[3 * i + 2] * a, kv = (kx * vx + ky * vy + kz * vz) * (1 - c);
    P[3 * i] = vx * c + (ky * vz - kz * vy) * sn + kx * kv; P[3 * i + 1] = vy * c + (kz * vx - kx * vz) * sn + ky * kv; P[3 * i + 2] = vz * c + (kx * vy - ky * vx) * sn + kz * kv;
  }
  // the head: where the engines are now (the ship's plumes), while it climbs on them
  const ship = craftById('ship'); let m = n, lum = 0, Lf = 0;
  if (ship && ship.s && t < EXH.t1 && ship.node.visible) {
    let k = 0; _exhV.set(0, 0, 0);
    const sc = ship.node.scale.x; for (const p of ship.plumes) if (p.visible) { k++; _exhU.copy(p.position).multiplyScalar(sc).applyQuaternion(ship.node.quaternion).add(ship.node.position); _exhV.add(_exhU); }
    if (k) { _exhV.multiplyScalar(1 / k); P[3 * n] = _exhV.x + O[0] - E[0]; P[3 * n + 1] = _exhV.y + O[1] - E[1]; P[3 * n + 2] = _exhV.z + O[2] - E[2]; m = n + 1; lum = ship.flameLum || 0; Lf = (ship.flameLen || 50) / 1000; }
  }
  const dc = j => Math.hypot(P[3 * j] - cgx, P[3 * j + 1] - cgy, P[3 * j + 2] - cgz);
  if (dc(m - 1) > 3000 && dc(0) > 3000) { hide(); return; }
  // distance back from the head (m) and the width now (m): turbulent mixing and, high up, free expansion. Behind the engines
  // the plume opens out like a cone, over its own width or twice the flame's length, whichever is longer
  const Lm = Lf * 1000; // m
  dH[m - 1] = 0; for (let i = m - 2; i >= 0; i--) dH[i] = dH[i + 1] + 1000 * Math.hypot(P[3 * i + 3] - P[3 * i], P[3 * i + 4] - P[3 * i + 1], P[3 * i + 5] - P[3 * i + 2]);
  for (let i = 0; i < m; i++) { const j = Math.min(i, n - 1), a = Math.max(t - TE[j], 0), w0 = W0[j], x = Math.min(dH[i] / Math.max(1.5 * w0, 2 * Lm), 1); W[i] = w0 * (0.25 + 0.75 * x * (2 - x)) + 4 * Math.sqrt(a) + 0.25 * a + VX[j] * a; }
  // the samples the ribbon runs through: one every third of its width or so (or every half degree, seen from afar), and all
  // of them near the engines, where the plume opens and the smoke comes out of the flame
  const zone = i => Math.max(3 * W[i], 2.5 * Lm);
  let nk = 0; keep[nk++] = 0;
  for (let i = 1, acc = 0; i < m; i++) { acc += dH[i - 1] - dH[i]; if (i === m - 1 || acc >= Math.max(0.3 * W[i], 8 * dc(i)) || dH[i] < zone(i)) { keep[nk++] = i; acc = 0; } }
  // its points: those samples and, near the engines, more in between (every sixth of the width, every eighth of the flame),
  // so the cone and the smoke fading in are smooth however far apart the samples were laid. A point lies a fraction f of the
  // way from point a to point b of P.
  const { ra, rb, rf, rg } = EXH; let nr = 0, extra = 0;
  for (let kk = 0; kk < nk; kk++) {
    const a = keep[kk]; ra[nr] = a; rb[nr] = a; rf[nr] = 0; nr++;
    const b = keep[kk + 1]; if (kk + 1 >= nk || dH[b] >= zone(b)) continue;
    const step = Math.max(Lm > 0 ? Math.min(W[b] / 6, Lm / 8) : W[b] / 6, 0.5), ns = Math.min(Math.ceil((dH[a] - dH[b]) / step), 24, EXH_SUB - extra + 1);
    for (let k = 1; k < ns; k++) { ra[nr] = a; rb[nr] = b; rf[nr] = k / ns; nr++; extra++; }
  }
  for (let r = 0; r < nr; r++) { const a = ra[r], b = rb[r], f = rf[r]; for (let k = 0; k < 3; k++) rg[3 * r + k] = P[3 * a + k] + (P[3 * b + k] - P[3 * a + k]) * f; }
  // light
  const sd = vunit(vscale(E, -1)), sun = [1.0, 0.97, 0.92];
  const elS = Math.asin(clamp((cgx * sd[0] + cgy * sd[1] + cgz * sd[2]) / (hc + R0), -1, 1)) * RAD, day = smoothstep((elS + 7) / 17), fill = MV.layers.fill !== false;
  // exposure: after sunset the sky darkens about tenfold for every 4° the Sun sinks below the camera's horizon, and eyes and
  // cameras open up to match; the exhaust high overhead, still in sunlight, then blazes against it
  const dip = Math.acos(clamp(R0 / (R0 + Math.max(hc, 0)), -1, 1)) * RAD;
  const u = mesh.material.uniforms; u.uSunDir.value.set(sd[0], sd[1], sd[2]); u.uExpo.value = Math.pow(10, clamp(-(elS + dip), 0, 11) / 4);
  u.uFogCol.value.copy(R.sky.material.uniforms.uHorizon.value).multiplyScalar(0.25 + 0.75 * day);
  const G = mesh.geometry.attributes, pos = G.position.array, uv = G.aUV.array, ta = G.aTau.array, su = G.aSun.array, am = G.aAmb.array, fo = G.aFog.array, si = G.aSide.array, fa = G.aFade.array;
  const PG = pf && pf.geometry.attributes, cap = pf ? PG.aTau.count / 4 : 0;
  const crR = _exhR.set(1, 0, 0).applyQuaternion(R.camera.quaternion), crU = _exhU.set(0, 1, 0).applyQuaternion(R.camera.quaternion);
  const ox = E[0] - O[0], oy = E[1] - O[1], oz = E[2] - O[2]; // geocentric → scene
  let px0 = 0, py0 = 0, pz0 = 0, hasPs = false, nv = 0, np = 0, pAcc = 0, dPrev = 0;
  const col = [0, 0, 0];
  for (let r = 0; r < nr; r++) {
    const a = ra[r], b = rb[r], f = rf[r], ja = Math.min(a, n - 1), jb = Math.min(b, n - 1), isHead = a === n;
    const lerp = A => A[ja] + (A[jb] - A[ja]) * f;
    const age = Math.max(t - lerp(TE), 0), w0 = lerp(W0), dHr = dH[a] + (dH[b] - dH[a]) * f, w = W[a] + (W[b] - W[a]) * f;
    for (let k = 0; k < 3; k++) col[k] = COL[3 * ja + k] + (COL[3 * jb + k] - COL[3 * ja + k]) * f;
    const gx = rg[3 * r], gy = rg[3 * r + 1], gz = rg[3 * r + 2], sx = gx + ox, sy = gy + oy, sz = gz + oz; // geocentric; in the scene
    const tau0 = isHead ? 0 : lerp(TAU0) * (w0 / w) * Math.exp(-age / lerp(LIFE));
    // the smoke shows beyond the bright flame (from a third of its length, fully past it); with the engines off, the trail's
    // end thins out over its width
    const fade = Lm > 0 ? smoothstep((dHr - 0.3 * Lm) / (0.8 * Lm)) : smoothstep(dHr / (0.6 * w));
    // the ribbon's side: across the trail and across the line of sight. Seen end-on that side is ill-defined: it keeps
    // turning smoothly from the last one, and the puffs take over from the ribbon there (as they do high up, where the
    // exhaust spreads into a wide, thin cloud)
    const rp = Math.max(r - 1, 0), rq = Math.min(r + 1, nr - 1);
    const tx = rg[3 * rq] - rg[3 * rp], ty = rg[3 * rq + 1] - rg[3 * rp + 1], tz = rg[3 * rq + 2] - rg[3 * rp + 2], cx = cam.x - sx, cy = cam.y - sy, cz = cam.z - sz;
    let vx = ty * cz - tz * cy, vy = tz * cx - tx * cz, vz = tx * cy - ty * cx; const sl = Math.hypot(vx, vy, vz), D = Math.hypot(cx, cy, cz), sn = sl / Math.max(Math.hypot(tx, ty, tz) * D, 1e-30);
    if (sl > 1e-15) { vx /= sl; vy /= sl; vz /= sl; } else if (hasPs) { vx = px0; vy = py0; vz = pz0; } else { const q = vperp([cx, cy, cz]); vx = q[0]; vy = q[1]; vz = q[2]; }
    if (hasPs) {
      if (vx * px0 + vy * py0 + vz * pz0 < 0) { vx = -vx; vy = -vy; vz = -vz; }
      const wgt = clamp(sn / 0.25, 0, 1);
      if (wgt < 1) { vx = px0 * (1 - wgt) + vx * wgt; vy = py0 * (1 - wgt) + vy * wgt; vz = pz0 * (1 - wgt) + vz * wgt; const d = (vx * cx + vy * cy + vz * cz) / Math.max(D * D, 1e-30); vx -= cx * d; vy -= cy * d; vz -= cz * d; const l = Math.hypot(vx, vy, vz); if (l > 1e-12) { vx /= l; vy /= l; vz /= l; } else { vx = px0; vy = py0; vz = pz0; } }
    }
    px0 = vx; py0 = vy; pz0 = vz; hasPs = true;
    // the ribbon's share: high up, seen end-on or from close by (a camera beside the column would see the ribbon twist round
    // it) the puffs draw the smoke instead
    const fr = (1 - smoothstep((lerp(H) - EXH_PUFF_H[0]) / (EXH_PUFF_H[1] - EXH_PUFF_H[0]))) * (pf ? smoothstep((sn - 0.05) / 0.12) * smoothstep((D * 1000 / w - 0.6) / 0.8) : 1);
    // seen at an angle to its axis the line of sight crosses more of the column: thicker by 1 / sin of that angle
    const tau = tau0 / Math.max(sn, 0.17);
    const Lt = exhSunlight(gx, gy, gz, sd), rgl = Math.hypot(gx, gy, gz), hv = rgl - R0, mu = (gx * sd[0] + gy * sd[1] + gz * sd[2]) / rgl;
    const dayV = smoothstep((mu + 0.1) / 0.3) * (1 - 0.7 * smoothstep((hv - 15) / 50)), amb = 0.42 * dayV + (fill ? 0.035 : 0.012);
    const fire = lum > 0 ? 0.7 * lum / (1 + Math.pow(dHr / (0.45 * Lm), 2)) : 0; // the flame lighting the smoke near it
    const h1 = Math.min(hc, hv), h2 = Math.max(hc, hv), air = h2 - h1 > 0.05 ? EXH_H * (Math.exp(-h1 / EXH_H) - Math.exp(-h2 / EXH_H)) / (h2 - h1) : Math.exp(-h1 / EXH_H);
    const fog = 1 - Math.exp(-D * Math.max(air, 0) / 80); // haze between the camera and the smoke
    const hw = w * 0.000625, lod = Math.max(Math.log2(w / w0), 0), uu = lerp(U); // km: half its width, with a quarter more for the billows
    for (let s = 0; s < 2; s++) {
      const q = 2 * nv + s, sg = s ? hw : -hw;
      pos[3 * q] = sx + vx * sg; pos[3 * q + 1] = sy + vy * sg; pos[3 * q + 2] = sz + vz * sg;
      uv[3 * q] = uu; uv[3 * q + 1] = s ? 1.25 : -1.25; uv[3 * q + 2] = lod; ta[q] = tau * fr; fo[q] = fog; fa[q] = fade; si[3 * q] = vx; si[3 * q + 1] = vy; si[3 * q + 2] = vz;
      for (let k = 0; k < 3; k++) { su[3 * q + k] = col[k] * sun[k] * Lt[k]; am[3 * q + k] = col[k] * (amb * EXH_TINT[k] + fire * EXH_FIRE[k]); }
    }
    nv++;
    // a puff gathers the trail since the last one (out to a third of its width or so) into a ball as wide as the trail: the
    // same smoke, so seen from the side the puffs add up to the column, and seen end-on they add up along it
    if (pf && r > 0) pAcc += (dPrev - dHr) * (1 - fr);
    dPrev = dHr;
    if (pf && !isHead && pAcc > 0 && (pAcc >= 0.33 * w || r >= nr - 2) && np < cap) {
      const rq2 = 0.000667 * w, tp = 1.5 * tau0 * pAcc / w * smoothstep((D / rq2 - 1.2) / 1.5); pAcc = 0; // its half-size (km); τ through its middle, gone once the camera is in it
      const PP = PG.position.array;
      for (let k = 0; k < 4; k++) {
        const q = 4 * np + k, ex = k === 1 || k === 2 ? rq2 : -rq2, ey = k >= 2 ? rq2 : -rq2;
        PP[3 * q] = sx + crR.x * ex + crU.x * ey; PP[3 * q + 1] = sy + crR.y * ex + crU.y * ey; PP[3 * q + 2] = sz + crR.z * ex + crU.z * ey;
        PG.aUV.array[3 * q + 2] = (7 * a + Math.round(7 * f)) % 97; PG.aTau.array[q] = tp; PG.aFog.array[q] = fog; PG.aFade.array[q] = fade;
        for (let c = 0; c < 3; c++) { PG.aSun.array[3 * q + c] = col[c] * sun[c] * Lt[c]; PG.aAmb.array[3 * q + c] = col[c] * (amb * EXH_TINT[c] + fire * EXH_FIRE[c]); }
      }
      np++;
    }
  }
  const upload = (A, nVert) => { for (const k in A) { const at = A[k]; at.clearUpdateRanges(); at.addUpdateRange(0, nVert * at.itemSize); at.needsUpdate = true; } }; // only the part in use
  upload(G, 2 * nv); mesh.geometry.setDrawRange(0, 6 * (nv - 1)); mesh.visible = nv > 1;
  if (pf) { upload(PG, 4 * np); pf.geometry.setDrawRange(0, 6 * np); pf.visible = np > 0; }
}
