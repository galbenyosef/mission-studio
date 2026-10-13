// ============================================================================
// Atmospheres, physically based: Rayleigh and Mie scattering with ozone
// absorption, single scattering plus an approximation of all the higher orders.
// The sky (drawn in the background pass) and the planet surfaces (aerial
// perspective, sunlight and skylight on the ground) use the same model, so the
// haze over distant ground matches the sky behind it.
//   Transmittance table: Bruneton & Neyret 2008 (its (r, mu) mapping).
//   Multiple scattering: Hillaire 2020, "A Scalable and Production Ready Sky and
//   Atmosphere Rendering Technique" (an isotropic term per (height, Sun angle)).
//   Skylight: the sky's irradiance on level ground, integrated from the above.
// The tables are computed once on the CPU. Units: km, and the Sun's irradiance
// is 1 (ATMO_SUN_E converts to the scene's units, in which a white Lambertian
// surface facing the Sun shines at 1.05).
// ============================================================================
const AT_W = 128, AT_H = 32, AM_W = 32, AM_H = 16, AI_W = 40, AI_H = 6;
const ATMO_SUN_E = 1.05 * Math.PI;
const ATMOS = {
  // Earth, on the app's 6378 km sphere. Rayleigh and ozone at the wavelengths the sRGB channels effectively see in skylight
  // (610, 550, 460 nm: the usual 680/550/440 nm samples, taken as RGB, turn low-Sun skies olive); a light maritime aerosol
  // (optical depth ~0.04) in the lowest kilometres; the ozone layer peaking at 25 km. The green airglow line (557.7 nm)
  // shines at 85–105 km on the night side (far brighter here than in life, where only long exposures show it).
  earth: { Rg: 6378.137, top: 100, bR: [8.96e-3, 13.56e-3, 27.7e-3], HR: 8.0, bMs: [0.025, 0.025, 0.025], bMe: [0.028, 0.028, 0.028], HM: 1.4,
    g: [0.78, 0.78, 0.78], bO: [1.3e-3, 1.881e-3, 0.2e-3], ozC: 25, ozW: 15, albedo: 0.1, glow: [0.09e-4, 0.4e-4, 0.16e-4], glowH: 95, glowW: 3.5,
    wbFull: true, grade: [3.2, 1.35, 0.55], autoMax: 2 },
  // Mars: thin CO2 (Rayleigh ~2 % of Earth's) and a dust haze of optical depth ~0.35 (a clear season) mixed through the lower
  // 11 km. The dust absorbs blue and scatters it more narrowly forward: a butterscotch sky with a blue glow around the Sun.
  mars: { Rg: 3389.5, top: 80, bR: [0.11e-3, 0.26e-3, 0.63e-3], HR: 11.1, bMs: [0.0310, 0.0236, 0.0150], bMe: [0.0315, 0.0315, 0.0315], HM: 11.1,
    g: [0.6, 0.66, 0.76], bO: [0, 0, 0], ozC: 0, ozW: 1, albedo: 0.25, glow: [0, 0, 0], glowH: 0, glowW: 1,
    wbFull: false, grade: [2.6, 1.2, 1.1], autoMax: 1.4 },
};
function atmosDensity(A, h, out) { out[0] = Math.exp(-h / A.HR); out[1] = Math.exp(-h / A.HM); out[2] = Math.max(0, 1 - Math.abs(h - A.ozC) / A.ozW); return out; }
function lut2(L, w, h, fx, fy, o) { // bilinear lookup in an RGBA float table; fx, fy in texels
  const x0 = Math.min(Math.floor(fx), w - 2), y0 = Math.min(Math.floor(fy), h - 2), tx = fx - x0, ty = fy - y0;
  for (let k = 0; k < 3; k++) { const i = 4 * (y0 * w + x0) + k, j = i + 4 * w; o[k] = (L[i] * (1 - tx) + L[i + 4] * tx) * (1 - ty) + (L[j] * (1 - tx) + L[j + 4] * tx) * ty; }
  return o;
}
// transmittance from radius r along mu (cosine from the zenith) to the top of the air, from the CPU copy of the table
function atmosT(A, r, mu, o = [0, 0, 0]) {
  const Rt = A.Rg + A.top, H = A.H, rho = Math.sqrt(Math.max(r * r - A.Rg * A.Rg, 0));
  const d = Math.max(-r * mu + Math.sqrt(Math.max(r * r * (mu * mu - 1) + Rt * Rt, 0)), 0), dmin = Rt - r, dmax = rho + H;
  return lut2(A.lutT, AT_W, AT_H, clamp((d - dmin) / Math.max(dmax - dmin, 1e-9), 0, 1) * (AT_W - 1), clamp(rho / H, 0, 1) * (AT_H - 1), o);
}
function atmosMS(A, r, mus, o = [0, 0, 0]) { return lut2(A.lutM, AM_W, AM_H, clamp(mus * 0.5 + 0.5, 0, 1) * (AM_W - 1), clamp((r - A.Rg) / A.top, 0, 1) * (AM_H - 1), o); }
// the sunlight reaching radius r with the Sun at mus: through the air, cut off by the planet as its disc (0.53°) sets
function atmosSunAt(A, r, mus, o = [0, 0, 0]) {
  const muh = -Math.sqrt(Math.max(1 - A.Rg * A.Rg / (r * r), 0)), vis = smoothstep((mus - muh) / 0.0094 + 0.5);
  if (vis <= 0) { o[0] = o[1] = o[2] = 0; return o; }
  atmosT(A, r, Math.max(mus, muh), o); o[0] *= vis; o[1] *= vis; o[2] *= vis; return o;
}
// light scattered towards the eye along cam + t·d (cam relative to the planet's centre) up to tMax (default: through the
// air), with the Sun along sun: single scattering and the multiple-scattering term, in the Sun's irradiance
function atmosInscatter(A, cam, d, sun, n, tMax = Infinity) {
  const Rt = A.Rg + A.top, r = vnorm(cam), b = vdot(cam, d), S = [0, 0, 0];
  const DT = b * b - (r * r - Rt * Rt); if (DT <= 0) return S;
  const t1 = Math.min(-b + Math.sqrt(DT), tMax); if (t1 <= 0) return S;
  const t0 = r > Rt ? -b - Math.sqrt(DT) : 0, DG = b * b - (r * r - A.Rg * A.Rg), tE = b < 0 && DG > 0 ? Math.min(t1, -b - Math.sqrt(DG)) : t1;
  const nu = vdot(d, sun), pR = 3 / (16 * Math.PI) * (1 + nu * nu), Tr = [1, 1, 1], de = [0, 0, 0], Ts = [0, 0, 0], ms = [0, 0, 0];
  const pM = A.g.map(g => 3 / (8 * Math.PI) * (1 - g * g) * (1 + nu * nu) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * nu, 1.5)));
  let tp = t0; const len = tE - t0, inside = r <= Rt;
  for (let i = 1; i <= n; i++) {
    const u = i / n, tn = inside ? t0 + len * u * u : t0 + len * u, dt = tn - tp, tm = 0.5 * (tn + tp); tp = tn;
    const px = cam[0] + d[0] * tm, py = cam[1] + d[1] * tm, pz = cam[2] + d[2] * tm, rr = Math.sqrt(px * px + py * py + pz * pz);
    atmosDensity(A, rr - A.Rg, de); const mus = (px * sun[0] + py * sun[1] + pz * sun[2]) / rr;
    atmosSunAt(A, rr, mus, Ts); atmosMS(A, rr, mus, ms);
    for (let k = 0; k < 3; k++) {
      const sR = A.bR[k] * de[0], sM = A.bMs[k] * de[1], ex = sR + A.bMe[k] * de[1] + A.bO[k] * de[2], ts = Math.exp(-ex * dt), I = ex * dt > 1e-6 ? (1 - ts) / ex : dt;
      S[k] += Tr[k] * ((sR * pR + sM * pM[k]) * Ts[k] + (sR + sM) * ms[k]) * I; Tr[k] *= ts;
    }
  }
  return S;
}
function atmosTables(A) {
  const Rt = A.Rg + A.top, H = Math.sqrt(Rt * Rt - A.Rg * A.Rg); A.H = H;
  const de = [0, 0, 0], Ts = [0, 0, 0];
  // transmittance: texel (i, j) ↔ the distance to the top of the air and the height (Bruneton's mapping); the samples
  // crowd towards the lowest point of each ray, where the air is densest
  const T = new Float32Array(AT_W * AT_H * 4);
  const od = (r, mu, t0, t1, n, acc) => { // ∫ densities over [t0, t1], samples crowded towards t0
    const len = t1 - t0; let tp = t0;
    for (let s = 1; s <= n; s++) { const u = s / n, tn = t0 + len * u * u, tm = 0.5 * (tn + tp), dt = tn - tp; tp = tn;
      atmosDensity(A, Math.sqrt(r * r + tm * tm + 2 * r * mu * tm) - A.Rg, de); acc[0] += de[0] * dt; acc[1] += de[1] * dt; acc[2] += de[2] * dt; }
  };
  for (let j = 0; j < AT_H; j++) for (let i = 0; i < AT_W; i++) {
    const rho = H * j / (AT_H - 1), r = Math.sqrt(rho * rho + A.Rg * A.Rg), dmin = Rt - r, dmax = rho + H, d = dmin + i / (AT_W - 1) * (dmax - dmin);
    const mu = d === 0 ? 1 : clamp((H * H - rho * rho - d * d) / (2 * r * d), -1, 1), acc = [0, 0, 0], tc = -r * mu;
    if (tc > 0 && tc < d) { // the ray dips to a lowest point first: integrate both ways from it
      const accA = [0, 0, 0]; od(r, mu, tc, 0, 24, accA); od(r, mu, tc, d, 40, acc);
      acc[0] -= accA[0]; acc[1] -= accA[1]; acc[2] -= accA[2]; // (the first integral ran backwards: negative dt)
    } else od(r, mu, 0, d, 48, acc);
    for (let k = 0; k < 3; k++) T[4 * (j * AT_W + i) + k] = Math.exp(-(A.bR[k] * acc[0] + A.bMe[k] * acc[1] + A.bO[k] * acc[2]));
    T[4 * (j * AT_W + i) + 3] = 1;
  }
  A.lutT = T;
  // multiple scattering (Hillaire 2020): at each (Sun angle, height), the once-scattered light arriving from all directions
  // (24 of them) and the fraction f of light scattered again; all the orders together are L2 / (1 − f)
  const M = new Float32Array(AM_W * AM_H * 4), dirs = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 6; b++) { const ct = 1 - 2 * (a + 0.5) / 4, st = Math.sqrt(1 - ct * ct), ph = TAU * (b + 0.5 + 0.5 * (a & 1)) / 6; dirs.push([st * Math.cos(ph), st * Math.sin(ph), ct]); }
  for (let j = 0; j < AM_H; j++) for (let i = 0; i < AM_W; i++) {
    const mus = -1 + 2 * i / (AM_W - 1), r = A.Rg + Math.max(A.top * j / (AM_H - 1), 0.01), sun = [Math.sqrt(1 - mus * mus), 0, mus];
    const L2 = [0, 0, 0], F = [0, 0, 0];
    for (const w of dirs) {
      const b = r * w[2], tT = -b + Math.sqrt(Math.max(b * b - (r * r - Rt * Rt), 0)), DG = b * b - (r * r - A.Rg * A.Rg), hitG = w[2] < 0 && DG > 0;
      const tE = hitG ? -b - Math.sqrt(DG) : tT, n = 14, Tr = [1, 1, 1], Ls = [0, 0, 0], Fs = [0, 0, 0];
      let tp = 0;
      for (let s = 1; s <= n; s++) {
        const u = s / n, tn = tE * u * u, t = 0.5 * (tn + tp), dt = tn - tp; tp = tn;
        const px = w[0] * t, py = w[1] * t, pz = r + w[2] * t, rr = Math.sqrt(px * px + py * py + pz * pz);
        atmosDensity(A, rr - A.Rg, de); atmosSunAt(A, rr, (px * sun[0] + py * sun[1] + pz * sun[2]) / rr, Ts);
        for (let k = 0; k < 3; k++) {
          const ss = A.bR[k] * de[0] + A.bMs[k] * de[1], ex = A.bR[k] * de[0] + A.bMe[k] * de[1] + A.bO[k] * de[2], ts = Math.exp(-ex * dt), I = ex * dt > 1e-6 ? (1 - ts) / ex : dt;
          Ls[k] += Tr[k] * ss * Ts[k] / (4 * Math.PI) * I; Fs[k] += Tr[k] * ss * I; Tr[k] *= ts;
        }
      }
      if (hitG) { // sunlight reflected by the ground
        const gx = w[0] * tE, gy = w[1] * tE, gz = r + w[2] * tE, mg = (gx * sun[0] + gy * sun[1] + gz * sun[2]) / Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (mg > 0) { atmosSunAt(A, A.Rg, mg, Ts); for (let k = 0; k < 3; k++) Ls[k] += Tr[k] * Ts[k] * mg * A.albedo / Math.PI; }
      }
      for (let k = 0; k < 3; k++) { L2[k] += Ls[k] / dirs.length; F[k] += Fs[k] / dirs.length; }
    }
    for (let k = 0; k < 3; k++) M[4 * (j * AM_W + i) + k] = L2[k] / (1 - F[k]);
    M[4 * (j * AM_W + i) + 3] = 1;
  }
  A.lutM = M;
  // skylight: the sky's irradiance on level ground (or cloud tops) at each (Sun angle, height), over π — the light a white
  // Lambertian surface sends back — in the scene's units
  const I = new Float32Array(AI_W * AI_H * 4), rings = 4, azs = 5;
  for (let j = 0; j < AI_H; j++) for (let i = 0; i < AI_W; i++) {
    const mus = aiMu(i), r = A.Rg + 0.002 + 20 * j / (AI_H - 1), sun = [Math.sqrt(1 - mus * mus), 0, mus], cam = [0, 0, r], E = [0, 0, 0];
    for (let a = 0; a < rings; a++) for (let b = 0; b < azs; b++) { // cosine-weighted directions over the upper hemisphere, azimuths on the Sun's side mirrored
      const st = Math.sqrt((a + 0.5) / rings), ct = Math.sqrt(1 - st * st), ph = Math.PI * (b + 0.5) / azs;
      const L = atmosInscatter(A, cam, [st * Math.cos(ph), st * Math.sin(ph), ct], sun, 10);
      for (let k = 0; k < 3; k++) E[k] += L[k] / (rings * azs); // cosine-weighted mean radiance = E / π
    }
    for (let k = 0; k < 3; k++) I[4 * (j * AI_W + i) + k] = E[k] * ATMO_SUN_E;
    I[4 * (j * AI_W + i) + 3] = 1;
  }
  A.lutI = I;
  const tex = (data, w, h) => { const t = new THREE.DataTexture(halfData(data), w, h, THREE.RGBAFormat, THREE.HalfFloatType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  A.texT = tex(T, AT_W, AT_H); A.texM = tex(M, AM_W, AM_H); A.texI = tex(I, AI_W, AI_H);
  return A;
}
// the skylight table's Sun angles crowd around sunset, where the light changes fastest
function aiMu(i) { const x = i / (AI_W - 1) * 2 - 1; return Math.sign(x) * x * x; }
function halfData(f) { const u = new Uint16Array(f.length); for (let i = 0; i < f.length; i++) u[i] = THREE.DataUtils.toHalfFloat(f[i]); return u; }
// the uniforms a material needs to draw one planet's air (shared objects: the scene updates them once per frame). The
// tables are computed now, or (later = true) when the browser is next idle — until then the air is clear and dark.
function atmosUniforms(name, later) {
  const A = ATMOS[name];
  if (A.U) return A.U;
  const v3 = a => new THREE.Vector3(...a), one = (v) => { const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1); t.needsUpdate = true; return t; };
  A.U = { tTrans: { value: one(255) }, tMS: { value: one(0) }, tSkyI: { value: one(0) }, aRg: { value: A.Rg }, aRt: { value: A.Rg + A.top }, aBR: { value: v3(A.bR) }, aHR: { value: A.HR },
    aBMs: { value: v3(A.bMs) }, aBMe: { value: v3(A.bMe) }, aG: { value: v3(A.g) }, aHM: { value: A.HM }, aBO: { value: v3(A.bO) }, aOz: { value: new THREE.Vector2(A.ozC, A.ozW) },
    aGlow: { value: v3(A.glow) }, aGlowH: { value: new THREE.Vector2(A.glowH, A.glowW) }, aSunE: { value: ATMO_SUN_E }, aGrade: { value: new THREE.Vector3(1, 1, 0) }, aExpo: { value: 1 }, aWB: { value: new THREE.Vector3(1, 1, 1) },
    aCam: { value: new THREE.Vector3(0, 0, A.Rg + 1000) }, aCamR: { value: A.Rg + 1000 }, aCamH: { value: 1000 }, aSun: { value: new THREE.Vector3(1, 0, 0) }, aRgE: { value: A.Rg } };
  const ready = () => { if (!A.lutT) atmosTables(A); A.U.tTrans.value = A.texT; A.U.tMS.value = A.texM; A.U.tSkyI.value = A.texI; };
  if (later) whenIdle(ready, 2000); else ready();
  return A.U;
}
// the air between the camera and the Sun: its transmittance (reddens and dims the Sun near the horizon), or null when the
// line of sight misses the air. cam: the camera relative to the planet's centre (km), sun: unit vector.
function atmosSunTransmittance(name, cam, sun) {
  const A = ATMOS[name]; if (!A.lutT) return null;
  const Rt = A.Rg + A.top, r = vnorm(cam), mu = vdot(cam, sun) / r, b = r * mu;
  if (r <= Rt) return atmosSunAt(A, r, mu);
  const D = b * b - (r * r - Rt * Rt); if (D <= 0 || b > 0) return null; // from outside: enter the air first
  const t0 = -b - Math.sqrt(D);
  return atmosSunAt(A, Rt, (r * mu + t0) / Rt);
}
// exposure for a camera at altitude h in the air: daylight white balance (the colour of the overhead Sun's light at that
// height, divided out; on Mars only its tint, so the dust does not brighten the scene), and the sky graded as a photograph
// shows it when seen from low in the air — brighter, more saturated, its highlights rolled off, a little brighter still
// when the Sun is low (sunT: the sunlight at the camera). From space the scattered light keeps its physical strength.
function atmosExposure(name, h, sunT) {
  const A = ATMOS[name], T = atmosT(A, A.Rg + clamp(h, 0, A.top), 1), k = 1 - smoothstep(h / 40);
  let wb = T.map(x => 1 / Math.max(x, 1e-3));
  if (!A.wbFull) { const l = 0.2126 * wb[0] + 0.7152 * wb[1] + 0.0722 * wb[2]; wb = wb.map(x => x / l); }
  const lum = sunT ? 0.2126 * sunT[0] * wb[0] + 0.7152 * sunT[1] * wb[1] + 0.0722 * sunT[2] * wb[2] : 1, auto = clamp(Math.sqrt(0.7 / Math.max(lum, 0.05)), 1, A.autoMax);
  const G = A.grade;
  // expo: the same automatic exposure for the ground and the craft (dim low-Sun light shown a little brighter)
  return { wb, grade: [1 + k * (G[0] * auto - 1), 1 + (G[1] - 1) * k, G[2] * k], expo: 1 + k * (auto - 1) };
}

// GLSL: the same model, for the sky and the surfaces. Needs the uniforms of atmosUniforms(); PI from <common>.
const GLSL_ATMOS = `
uniform sampler2D tTrans; uniform sampler2D tMS; uniform sampler2D tSkyI;
uniform float aRg, aRt, aHR, aHM, aSunE, aExpo;
uniform vec3 aBR, aBMs, aBMe, aG, aBO, aGlow, aWB, aGrade; uniform vec2 aOz, aGlowH;
uniform vec3 aCam; uniform float aCamR, aCamH, aRgE; uniform vec3 aSun;
vec3 aDensity(float h) { return vec3(exp(-h / aHR), exp(-h / aHM), max(0.0, 1.0 - abs(h - aOz.x) / aOz.y)); }
// transmittance from radius r along mu to the top of the air (Bruneton's mapping of the table)
vec3 aTransmittance(float r, float mu) {
  float H = sqrt(aRt * aRt - aRg * aRg), rho = sqrt(max(r * r - aRg * aRg, 0.0));
  float d = max(-r * mu + sqrt(max(r * r * (mu * mu - 1.0) + aRt * aRt, 0.0)), 0.0), dmin = aRt - r, dmax = rho + H;
  vec2 x = clamp(vec2((d - dmin) / max(dmax - dmin, 1e-6), rho / H), 0.0, 1.0);
  return texture2D(tTrans, vec2(0.5 / ${AT_W}.0, 0.5 / ${AT_H}.0) + x * vec2(1.0 - 1.0 / ${AT_W}.0, 1.0 - 1.0 / ${AT_H}.0)).rgb;
}
vec3 aMS(float r, float mus) {
  vec2 x = clamp(vec2(mus * 0.5 + 0.5, (r - aRg) / (aRt - aRg)), 0.0, 1.0);
  return texture2D(tMS, vec2(0.5 / ${AM_W}.0, 0.5 / ${AM_H}.0) + x * vec2(1.0 - 1.0 / ${AM_W}.0, 1.0 - 1.0 / ${AM_H}.0)).rgb;
}
// skylight on level ground (or cloud tops) at radius r: the light a white Lambertian surface sends back, scene units
vec3 aSkyLight(float r, float mus) {
  float x = clamp(sign(mus) * sqrt(abs(mus)) * 0.5 + 0.5, 0.0, 1.0), y = clamp((r - aRg) / 20.0, 0.0, 1.0);
  return texture2D(tSkyI, vec2(0.5 / ${AI_W}.0, 0.5 / ${AI_H}.0) + vec2(x, y) * vec2(1.0 - 1.0 / ${AI_W}.0, 1.0 - 1.0 / ${AI_H}.0)).rgb;
}
// sunlight reaching radius r with the Sun at mus: reddened by the air, cut off by the planet (the Sun's disc sets over 0.53°)
vec3 aSunlight(float r, float mus) {
  float muh = -sqrt(max(1.0 - aRg * aRg / (r * r), 0.0));
  return aTransmittance(r, max(mus, muh)) * smoothstep(muh - 0.0047, muh + 0.0047, mus);
}
// the light scattered towards the eye along p0 + t·d, t0…t1 (p0 relative to the planet's centre), and the transmittance
// over it. Steps finer towards t0 (mode 1), towards t1 (mode 2), or even (mode 0); each step is integrated exactly for a
// constant medium (Hillaire), so a few dozen are enough.
void aIntegrate(vec3 p0, vec3 d, float t0, float t1, vec3 L, int mode, int N, out vec3 inscat, out vec3 trans) {
  float nu = dot(d, L);
  float pR = 3.0 / (16.0 * PI) * (1.0 + nu * nu);
  vec3 g2 = aG * aG;
  vec3 pM = 3.0 / (8.0 * PI) * (1.0 - g2) * (1.0 + nu * nu) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * aG * nu, vec3(1.5)));
  vec3 S = vec3(0.0), T = vec3(1.0);
  float tp = t0, len = max(t1 - t0, 0.0);
  for (int i = 1; i <= 32; i++) {
    if (i > N) break;
    float u = float(i) / float(N);
    float tn = mode == 1 ? t0 + len * u * u : (mode == 2 ? t1 - len * (1.0 - u) * (1.0 - u) : t0 + len * u);
    float dt = tn - tp, tm = 0.5 * (tn + tp); tp = tn;
    vec3 p = p0 + d * tm; float r = length(p), h = max(r - aRg, 0.0);
    vec3 de = aDensity(h);
    vec3 sR = aBR * de.x, sM = aBMs * de.y, ex = sR + aBMe * de.y + aBO * de.z;
    float mus = dot(p, L) / r;
    vec3 src = (sR * pR + sM * pM) * aSunlight(r, mus) + (sR + sM) * aMS(r, mus);
    float muh = -sqrt(max(1.0 - aRg * aRg / (r * r), 0.0)), zg = (h - aGlowH.x) / aGlowH.y; // (squared by hand: pow() is undefined below 0)
    src += aGlow * exp(-zg * zg) * (1.0 - smoothstep(muh - 0.25, muh + 0.05, mus)) / aSunE; // airglow, night side
    vec3 ts = exp(-ex * dt), thin = step(ex * dt, vec3(1e-3)); // ∫ e^(−ex·s) ds over the step (its series where 1 − e^… rounds away)
    S += T * src * (thin * dt * (1.0 - 0.5 * ex * dt) + (1.0 - thin) * (1.0 - ts) / max(ex, vec3(1e-12)));
    T *= ts;
  }
  inscat = S * aSunE; trans = T;
}
// scattered light as displayed: white-balanced, then graded (gain, saturation, shoulder)
vec3 aDisplay(vec3 S) {
  vec3 x = S * aWB * aGrade.x; float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  x = max(mix(vec3(l), x, aGrade.y), 0.0);
  return x / (1.0 + x * aGrade.z);
}`;
