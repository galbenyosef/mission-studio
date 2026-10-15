// ============================================================================
// Scene: renderer, camera, Sun light, stars, planets (scientific orientation),
// Earth day/night shader, atmospheres, planet & Moon orbits.
// World units = km, axes = J2000 ecliptic. Floating origin: everything is
// placed relative to R.O (heliocentric km, double precision) each frame.
// ============================================================================
const R = { O: [0, 0, 0], helio: {}, texLoaded: 0 };
const ASSET = n => 'assets/' + n;
// Planet surfaces are drawn with very large triangles that the near plane clips right under the camera; interpolating
// three.js's log-depth varying across them is numerically poor (errors of decimetres next to a landed craft), so these
// shaders take the depth from gl_FragCoord.w = 1/w, which the rasteriser computes exactly for every pixel.
const LOGDEPTH_EXACT = `
#ifdef USE_LOGDEPTHBUF
  gl_FragDepth = log2( 1.0 + 1.0 / gl_FragCoord.w ) * logDepthBufFC * 0.5;
#endif`;
const GLSL_DETAIL = `
uniform sampler2D tDetail; uniform float uDetailAmp; uniform vec2 uDetailRep;
varying vec2 vLocal; varying float vCap; varying vec3 vObj;
uniform vec3 uCapDir[4]; uniform float uCapCos[4];
void capHoles() { if (vCap < 0.5) { for (int i = 0; i < 4; i++) { if (dot(vObj, uCapDir[i]) > uCapCos[i]) discard; } } }
float detailAt(vec2 uv, float dist) {
  float w1 = 1.0 - smoothstep(150.0, 900.0, dist), w2 = 1.0 - smoothstep(30.0, 220.0, dist), w3 = 1.0 - smoothstep(1.5, 12.0, dist), w4 = 1.0 - smoothstep(0.08, 0.7, dist);
  float d = 0.0;
  if (w1 > 0.0) d += (texture2D(tDetail, uv * uDetailRep).r - 0.5) * w1;
  if (w2 > 0.0) d += (texture2D(tDetail, uv * uDetailRep * 17.0).r - 0.5) * w2;
  if (w3 > 0.0) d += (texture2D(tDetail, vLocal / 0.075).r - 0.5) * w3;
  if (w4 > 0.0) d += (texture2D(tDetail, vLocal / 0.0045).r - 0.5) * w4 * 0.8;
  return 1.0 + d * uDetailAmp;
}`;
const GLSL_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
attribute vec2 aLocal; varying vec2 vLocal; attribute float aCap; varying float vCap; varying vec3 vObj;
void main() {
  vUv = uv; vLocal = aLocal; vCap = aCap; vObj = normalize(position); vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
// relief from a slope map (G, B: slopes east and north as 128 + slope·K): the normal tilted over the sphere's
const GLSL_RELIEF = `
uniform sampler2D tAux; uniform vec3 uPole; uniform float uSlopeK, uRelief; uniform vec2 uReliefNear;
vec3 reliefNormal(vec3 N, vec3 aux, float dist, out vec3 E, out vec3 Nn, out float cosLat) {
  E = cross(uPole, N); cosLat = length(E); E /= max(cosLat, 1e-5); Nn = cross(N, E);
  vec2 s = (aux.gb * 255.0 - 128.0) / uSlopeK * uRelief * smoothstep(uReliefNear.x, uReliefNear.y, dist); // (gone close up, where a texel would show as a facet)
  return normalize(N - E * s.x - Nn * s.y);
}`;
// Earth: the day map lit by sunlight and skylight from the atmosphere model (reddened near the terminator), relief from
// the slope map, clouds on a layer above the ground (seen with parallax, casting shadows along the sunlight, their tops
// lit a little past the ground's sunset), the sea's glint and sky reflection, towns' lights at night, and the air between
// the camera and the ground over all of it.
const GLSL_EARTH_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tClouds; uniform vec3 uSunDir; uniform float uLights; uniform vec3 uFill;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_DETAIL}
${GLSL_ATMOS}
${GLSL_RELIEF}
const float CLOUD_H = 6.0; // km
// a horizontal displacement on the ground (km, world axes) in texture coordinates
vec2 uvShift(vec3 dv, vec3 E, vec3 Nn, float cosLat) { return vec2(dot(dv, E) / (2.0 * PI * aRg * max(cosLat, 0.05)), dot(dv, Nn) / (PI * aRg)); }
float cloudAt(vec2 uv) { return smoothstep(0.1, 0.92, texture2D(tClouds, uv).r); }
void main() {
  ${LOGDEPTH_EXACT}
  capHoles();
  vec3 N = normalize(vN), L = normalize(uSunDir);
  vec3 seg = vP - cameraPosition; float dist = length(seg); vec3 d = seg / dist, V = -d;
  vec3 aux = texture2D(tAux, vUv).rgb; float ocean = aux.r;
  vec3 E, Nn; float cosLat;
  vec3 Nb = normalize(mix(reliefNormal(N, aux, dist, E, Nn, cosLat), N, ocean));
  float mus = dot(N, L), muv = max(dot(N, V), 0.0);
  // clouds: where the line of sight crosses their layer, and the shadow they cast along the sunlight
  float cloud = cloudAt(vUv + uvShift((V - N * muv) * CLOUD_H / max(muv, 0.06), E, Nn, cosLat));
  float shadow = cloudAt(vUv + uvShift((L - N * mus) * CLOUD_H / max(mus, 0.06), E, Nn, cosLat)) * smoothstep(-0.02, 0.08, mus);
  // light on the ground: the Sun through the air, and the sky
  vec3 sun = aSunlight(aRg, mus) * (aSunE / PI) * (1.0 - 0.8 * shadow);
  vec3 sky = aSkyLight(aRg, mus) * (1.0 - 0.3 * shadow);
  vec3 alb = texture2D(tDay, vUv).rgb * mix(detailAt(vUv, dist), 1.0, ocean);
  alb = mix(alb, max(alb, vec3(0.004, 0.012, 0.036)), ocean); // deep water's own colour (the Blue Marble paints the open sea flat and darker)
  vec3 col = alb * (sun * max(dot(Nb, L), 0.0) + sky);
  // the sea: glint off wind-ruffled water (Cox–Munk slopes, ~6 m/s wind), the sky's reflection, both rising towards
  // grazing angles (Fresnel)
  vec3 H = normalize(L + V); float nh = max(dot(N, H), 1e-3), vh = max(dot(V, H), 0.0);
  const float S2 = 0.035;
  float D = exp(-(1.0 - nh * nh) / (nh * nh * S2)) / (PI * S2 * nh * nh * nh * nh);
  float F = 0.02 + 0.98 * pow(1.0 - vh, 5.0), Fv = 0.02 + 0.98 * pow(1.0 - muv, 5.0);
  vec3 sea = col * (1.0 - Fv) + sun * PI * F * D / (4.0 * max(muv, 0.05)) + sky * Fv;
  col = mix(col, sea, ocean);
  // the cloud tops CLOUD_H up see the Sun a little longer than the ground below
  float rc = aRg + CLOUD_H, muhc = -sqrt(max(1.0 - aRg * aRg / (rc * rc), 0.0));
  float cshade = pow(clamp((mus - muhc) / (1.0 - muhc), 0.0, 1.0), 0.65);
  vec3 cloudCol = 0.8 * (aSunlight(rc, mus) * (aSunE / PI) * cshade + aSkyLight(rc, mus));
  col = mix(col, cloudCol, cloud);
  // towns at night (with a soft glow from a coarser mip), switching on through dusk, dimmed by clouds, which they light
  // from below; seen close, a texel's glow breaks up into separate lights
  float nl = texture2D(tNight, vUv).r, ng = texture2D(tNight, vUv, 3.0).r;
  nl = pow(nl, 2.2); ng = pow(ng, 2.2);
  float near = 1.0 - smoothstep(250.0, 1500.0, dist);
  nl *= mix(1.0, smoothstep(0.5, 0.72, texture2D(tDetail, vUv * uDetailRep * 0.25).r) * 4.0, near);
  float dark = (1.0 - smoothstep(-0.14, 0.02, mus)) * uLights;
  vec3 warm = mix(vec3(1.0, 0.62, 0.30), vec3(1.0, 0.86, 0.62), smoothstep(0.1, 0.8, nl)); // sodium-orange outskirts, whiter centres
  vec3 lights = (nl * 2.4 + ng * (1.1 - 0.8 * near)) * warm * dark * (1.0 - cloud * 0.8);
  lights *= smoothstep(5.0, 60.0, dist); // from close by, a town's glow is its separate lights, not a lit patch of ground
  col += lights + ng * cloud * vec3(1.0, 0.7, 0.42) * 0.6 * dark;
  col += (alb * (1.0 - ocean * 0.7) + cloud * 0.6) * vec3(0.0016, 0.0022, 0.0030) * (1.0 - smoothstep(-0.2, 0.0, mus)); // airglow and starlight on the night side
  col += alb * uFill * (1.0 - smoothstep(-0.10, 0.12, mus)); // cinematic night fill near the camera: the ground stays readable after dark
  // the air between the camera and this point
  float t0 = 0.0;
  if (aCamH > aRt - aRg) { float b = dot(aCam, d); vec3 pc = aCam - b * d; float Dt = aRt * aRt - dot(pc, pc); t0 = Dt > 0.0 ? clamp(-b - sqrt(Dt), 0.0, dist) : dist; }
  vec3 S, T; aIntegrate(aCam, d, t0, dist, L, 2, aCamH > aRt - aRg ? 12 : 16, S, T);
  col = col * T * aWB * aExpo + aDisplay(S);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
// The Moon and the other bodies: lunar-Lambert photometry (the Moon's flat-looking full disc), relief from a slope map
// where there is one, and on Mars the dusty air (sunlight and skylight through it, and the haze over the ground).
const GLSL_ROCK_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 uSunDir; uniform float uAmb; uniform float uLS; uniform vec3 uTint; uniform float uHasMap; uniform float uHasAux; uniform vec3 uFogColor; uniform float uFogK; uniform vec3 uFill;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_DETAIL}
${GLSL_RELIEF}
#ifdef HAS_ATMO
${GLSL_ATMOS}
#endif
void main() {
  ${LOGDEPTH_EXACT}
  capHoles();
  vec3 N = normalize(vN); vec3 L = normalize(uSunDir); vec3 V = normalize(cameraPosition - vP);
  vec3 E, Nn; float cosLat;
  float dist = length(cameraPosition - vP);
  vec3 Nb = uHasAux > 0.5 ? reliefNormal(N, texture2D(tAux, vUv).rgb, dist, E, Nn, cosLat) : N;
  float mus = dot(N, L);
  float mu0 = max(dot(Nb, L), 0.0) * smoothstep(-0.03, 0.01, mus); float mu = max(dot(Nb, V), 0.0);
  float ls = min(2.0 * mu0 / max(mu0 + mu, 1e-4), 1.35);
  float shade = mix(mu0, ls * smoothstep(0.0, 0.04, mu0), uLS);
  vec3 alb = (uHasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(1.0)) * uTint;
  if (uDetailAmp > 0.0) alb *= detailAt(vUv, dist);
#ifdef HAS_ATMO
  vec3 col = alb * (shade * aSunlight(aRg, mus) + aSkyLight(aRg, mus)) + alb * uFill * (1.0 - smoothstep(0.0, 0.25, mus));
  vec3 d = (vP - cameraPosition) / dist;
  float t0 = 0.0;
  if (aCamH > aRt - aRg) { float b = dot(aCam, d); vec3 pc = aCam - b * d; float Dt = aRt * aRt - dot(pc, pc); t0 = Dt > 0.0 ? clamp(-b - sqrt(Dt), 0.0, dist) : dist; }
  vec3 S, T; aIntegrate(aCam, d, t0, dist, L, 2, 12, S, T);
  col = col * T * aWB * aExpo + aDisplay(S);
#else
  vec3 col = alb * (shade + uAmb) + alb * uFill * (1.0 - smoothstep(0.0, 0.25, mu0)); // night fill (earthshine on the Moon, cinematic elsewhere)
  col = mix(col, uFogColor, 1.0 - exp(-dist * uFogK));
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const GLSL_ATMO_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir; uniform vec3 uColor; uniform vec3 uSunset; uniform float uStrength; uniform float uPow;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP); vec3 L = normalize(uSunDir);
  float rim = 1.0 - abs(dot(N, V));
  float glow = pow(rim, uPow);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.30, 0.35, ndl);
  float dusk = smoothstep(-0.30, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.30, ndl));
  vec3 c = (uColor * lit + uSunset * dusk * 0.45) * glow * uStrength;
  gl_FragColor = vec4(c, 1.0);
}`;
const GLSL_STAR_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute vec3 aColor; uniform float uScale; varying vec3 vC;
void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale;
  #include <logdepthbuf_vertex>
}`;
const GLSL_STAR_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uBright; varying vec3 vC;
void main() {
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0);
  gl_FragColor = vec4(vC * a * uBright, 1.0);
}`;

const GLSL_SKY_V = `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.999; }`;
const GLSL_SKY_F = `
uniform vec3 uUp; uniform vec3 uSun; uniform float uDensity; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunset; uniform vec3 uHalo;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float mu = dot(d, uUp); float sunEl = dot(uSun, uUp);
  float day = smoothstep(-0.20, 0.06, sunEl);
  float hz = pow(1.0 - max(mu, 0.0), 4.0);
  vec3 col = mix(uZenith, uHorizon, hz);
  float cs = max(dot(d, uSun), 0.0);
  col += uHalo * (pow(cs, 600.0) * 1.5 + pow(cs, 24.0) * 0.30 + pow(cs, 4.0) * 0.08);
  float dusk = (1.0 - smoothstep(-0.05, 0.30, sunEl)) * day;
  col = mix(col, uSunset, clamp(dusk * pow(1.0 - abs(mu), 5.0) * (0.35 + 0.65 * pow(cs * 0.5 + 0.5, 4.0)), 0.0, 1.0));
  col *= mix(0.25, 1.0, day);
  if (mu < 0.0) col = mix(col, uHorizon * 0.55 * day, smoothstep(0.0, -0.25, mu));
  float a = clamp(uDensity * (0.15 + 0.85 * day), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;
// The sky of a planet with air, from inside it or from space (the glowing limb): the atmosphere model along each line of
// sight, drawn in the background pass. Premultiplied: the stars behind are dimmed by the air's transmittance and hidden
// where the sky is bright (as the eye or a camera exposed for a sunlit scene would). Lines of sight that end on the
// ground beyond the planet's polygon edge (a sliver at its limb) are drawn opaque, as the haze that covers them.
const GLSL_ASKY_F = `
#include <common>
${GLSL_ATMOS}
uniform float aHide;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float b = dot(aCam, d);
  // distances along the line of sight to the top of the air and to the ground; near the planet from its altitude (precise
  // when the camera is low), from the point of closest approach otherwise (precise when it is far)
  bool near = aCamH < 1000.0;
  vec3 pc = aCam - b * d; float pc2 = dot(pc, pc);
  float DT = near ? b * b - (aCamH - (aRt - aRg)) * (aCamR + aRt) : aRt * aRt - pc2;
  if (DT <= 0.0) discard;
  float sq = sqrt(DT), t1 = -b + sq;
  if (t1 <= 0.0) discard;
  bool outside = aCamH > aRt - aRg;
  float t0 = outside ? -b - sq : 0.0;
  // the ground: the planet's sphere, or lower where the camera is in a basin below it (aRgE: the ground under the camera, as
  // the terrain there has it), so that lines of sight passing over the basin's rim show sky rather than nothing
  float cG = (aCamR - aRgE) * (aCamR + aRgE), DG = near ? b * b - cG : aRgE * aRgE - pc2;
  bool ground = b < 0.0 && DG > 0.0;
  // the planet's mesh covers lines of sight that dip more than its facets' depth (0.2 km) below the surface: only the sliver
  // at the limb is left to draw here
  if (ground && pc2 < (aRgE - 0.5) * (aRgE - 0.5)) discard;
  float tE = ground ? (near ? cG / (-b + sqrt(DG)) : -b - sqrt(DG)) : t1;
  vec3 S, T; aIntegrate(aCam, d, t0, tE, aSun, outside ? (ground ? 2 : 0) : 1, 24, S, T);
  vec3 c = aDisplay(S);
  float a = ground ? 1.0 : 1.0 - dot(T, vec3(1.0 / 3.0)) * exp(-aHide * dot(c, vec3(0.2126, 0.7152, 0.0722)));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeDetailTexture(craters = true) { // tileable value noise (+ craters for the airless worlds), used to add surface texture below the resolution of the global maps
  const N = 512, rnd = mulberry32(7); const v = new Float32Array(N * N);
  for (const [S, amp] of [[8, 0.30], [16, 0.22], [32, 0.16], [64, 0.11], [128, 0.07], [256, 0.05]]) {
    const L = new Float32Array(S * S); for (let i = 0; i < S * S; i++) L[i] = rnd() * 2 - 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx_ = x / N * S, fy = y / N * S; const x0 = Math.floor(fx_), y0 = Math.floor(fy); const tx = fx_ - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = L[(y0 % S) * S + (x0 % S)], b = L[(y0 % S) * S + ((x0 + 1) % S)], c = L[((y0 + 1) % S) * S + (x0 % S)], d = L[((y0 + 1) % S) * S + ((x0 + 1) % S)];
      v[y * N + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
    }
  }
  for (let k = 0; k < (craters ? 260 : 0); k++) { // craters with raised rims, power-law sizes
    const r = 3 + 60 * Math.pow(rnd(), 3.2), cx = rnd() * N, cy = rnd() * N, depth = 0.35 + rnd() * 0.25;
    const R2 = Math.ceil(r * 1.6);
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      const d = Math.hypot(dx, dy) / r; if (d > 1.6) continue;
      const prof = d < 1 ? -depth * (1 - d * d) * 0.8 + 0.25 * depth * Math.pow(d, 6) : 0.3 * depth * Math.exp(-(d - 1) * 6);
      const xx = ((Math.round(cx + dx) % N) + N) % N, yy = ((Math.round(cy + dy) % N) + N) % N; v[yy * N + xx] += prof;
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const q = clamp(128 + v[i] * 150, 0, 255); img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = q; img.data[4 * i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}

function initScene() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  R.renderer = renderer;
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(40, 1, 1e-6, 1e13);
  R.camera.up.set(0, 0, 1);
  R.scene.add(R.camera);
  R.sunLight = new THREE.PointLight(0xffffff, 3.0, 0, 0);
  R.scene.add(R.sunLight);
  R.ambient = new THREE.AmbientLight(0x8899bb, 0.05);
  R.scene.add(R.ambient);
  R.plasmaLight = new THREE.PointLight(0xff8a48, 0, 0.1, 0); R.scene.add(R.plasmaLight); // an entry's glowing shock layer (updatePlasmaLight); always in the scene, so lighting it does not recompile the materials
  R.maxAniso = renderer.capabilities.getMaxAnisotropy();
  R.renderer.autoClear = false;
  R.bgScene = new THREE.Scene(); R.bgCam = new THREE.PerspectiveCamera(40, 1, 1, 1e10);
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(5e8, 48, 24), new THREE.ShaderMaterial({ vertexShader: GLSL_SKY_V, fragmentShader: GLSL_SKY_F, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uUp: { value: new THREE.Vector3(0, 0, 1) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uDensity: { value: 0 }, uZenith: { value: new THREE.Color('#3a76d6') }, uHorizon: { value: new THREE.Color('#c6dcf2') }, uSunset: { value: new THREE.Color('#ff9a52') }, uHalo: { value: new THREE.Color('#fff2d8') } } }));
  R.sky.renderOrder = 10; R.sky.frustumCulled = false; R.bgScene.add(R.sky);
  R.airSky = {}; // the physically based skies of Earth and Mars (Venus keeps a simple rim)
  for (const name of ['earth', 'mars']) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(5e8, 64, 32), new THREE.ShaderMaterial({ vertexShader: GLSL_SKY_V, fragmentShader: GLSL_ASKY_F, side: THREE.BackSide,
      transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, uniforms: Object.assign({ aHide: { value: 150 } }, atmosUniforms(name, name !== 'earth')) }));
    m.renderOrder = 11; m.frustumCulled = false; m.visible = false; R.bgScene.add(m); R.airSky[name] = m;
  }
  R.hemi = new THREE.HemisphereLight(0x9cc3ff, 0x6b5a45, 0); R.scene.add(R.hemi);
  // Image-based lighting: a small surround of the craft's world (sky and ground inside an atmosphere, the nearest planet's
  // sunlit disc in space, a faint fill) captured into a cube map, so metal and foil reflect their surroundings and faces
  // turned away from the Sun pick up light from the ground. 64 px, refreshed every few frames (updateSky).
  R.envMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { uUp: { value: new THREE.Vector3(0, 0, 1) }, uZen: { value: new THREE.Color('#2f6bd0') }, uHor: { value: new THREE.Color('#c3daf3') }, uGnd: { value: new THREE.Color('#5a5040') },
      uDay: { value: 0 }, uDens: { value: 0 }, uPl: { value: new THREE.Vector3(0, 0, -1) }, uPlCos: { value: 2 }, uPlCol: { value: new THREE.Color('#000000') }, uFill: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uUp, uPl, uZen, uHor, uGnd, uPlCol; uniform float uDay, uDens, uPlCos, uFill; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = dot(d, uUp);
        vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.6, h)) * (0.05 + 0.55 * uDay);
        vec3 gnd = uGnd * (0.08 + 0.52 * uDay) * (0.7 + 0.3 * smoothstep(-1.0, 0.0, h));
        float disc = smoothstep(uPlCos - 0.01, uPlCos + 0.01, dot(d, uPl));
        gl_FragColor = vec4(mix(uPlCol * disc, h > 0.0 ? sky : gnd, uDens) + uFill, 1.0); }` });
  R.envScene = new THREE.Scene(); R.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), R.envMat));
  R.envRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType }); R.envCam = new THREE.CubeCamera(0.5, 50, R.envRT); R.envScene.add(R.envCam);
  R.pmrem = new THREE.PMREMGenerator(renderer); R.envN = 0; R.envPM = null;
  R.loader = new THREE.TextureLoader();
  R.detailTex = makeDetailTexture(); R.detailTexEarth = makeDetailTexture(false); // (Earth's ground without the craters, which from a few kilometres up read as cloud shadows)
  buildStars();
  buildBodies();
  buildPlanetOrbits();
  R.sunGlow = makeGlowSprite('#fff4dc', 1.0); R.scene.add(R.sunGlow);
  R.sunGlow2 = makeGlowSprite('#ffcf8a', 0.35, true); R.scene.add(R.sunGlow2);
}
// grey: a single-channel texture (a quarter of the memory of an RGBA one)
function loadTex(name, srgb = true, grey = false) {
  const tex = R.loader.load(ASSET(name), () => { R.texLoaded++; });
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (grey) tex.format = THREE.RedFormat;
  tex.anisotropy = Math.min(8, R.maxAniso || 1);
  return tex;
}
// Sharper maps for a body, loaded as the camera comes near it and released when it goes far away: each level of detail
// loads within `near` body radii and is dropped beyond `far`; `big` levels (8192 × 4096) only on devices that can hold
// them — a desktop GPU (16384 px textures) and a fine pointer; ?tex=8k or ?tex=4k forces the choice. The sharpest loaded
// level is used; maps decode off the main thread where the browser can. flag: a uniform set to 1 while a level is in use.
R.texLOD = [];
function texLOD(body, uniform, levels, srgb, grey, flag) {
  R.texLOD.push({ body, U: uniform, base: uniform.value, srgb, grey, flag, levels: levels.map(l => Object.assign({ tex: null, state: 'idle' }, l)) });
}
function bigTexOK() {
  const q = (location.search.match(/[?&]tex=(\w+)/) || [])[1];
  if (q) return q === '8k';
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  return R.renderer.capabilities.maxTextureSize >= 16384 && !coarse;
}
function loadTexAsync(file, srgb, grey, done, fail) {
  const fin = t => { t.anisotropy = Math.min(8, R.maxAniso || 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (grey) t.format = THREE.RedFormat; t.needsUpdate = true; done(t); };
  // an image decoded before its upload (decode() works off the main thread), so the swap does not stall a frame
  const viaImage = () => R.loader.load(ASSET(file), t => { const im = t.image; if (im && im.decode) im.decode().then(() => fin(t), () => fin(t)); else fin(t); }, undefined, fail);
  // Chromium decodes straight into an ImageBitmap, flipped as WebGL needs (other engines have not always honoured the options)
  const chromium = navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(b => /Chromium/.test(b.brand));
  if (typeof createImageBitmap !== 'function' || !chromium) return viaImage();
  new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    .load(ASSET(file), bmp => { const t = new THREE.Texture(bmp); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; fin(t); }, undefined, viaImage);
}
function updateTexLOD() {
  if (R.bigTex === undefined) R.bigTex = bigTexOK();
  for (const e of R.texLOD) {
    const b = R.bodies[e.body], k = R.camera.position.distanceTo(b.group.position) / b.R;
    let use = null;
    for (const l of e.levels) {
      if (l.state === 'idle' && k < l.near && (!l.big || R.bigTex)) { l.state = 'loading'; loadTexAsync(l.file, e.srgb, e.grey, t => { l.tex = t; l.state = 'ready'; }, () => { l.state = 'failed'; }); }
      else if (l.state === 'ready' && k > l.far) { l.tex.dispose(); if (l.tex.image && l.tex.image.close) l.tex.image.close(); l.tex = null; l.state = 'idle'; }
      if (l.state === 'ready') use = l.tex;
    }
    const v = use || e.base;
    if (e.U.value !== v) e.U.value = v;
    if (e.flag) e.flag.value = v ? 1 : 0;
  }
}
function glowTexture(color, soft) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const [r, gg, b] = hexToRgb(color).map(x => Math.round(x * 255));
  if (soft) { gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.25, `rgba(${r},${gg},${b},0.25)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); }
  else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, `rgba(${r},${gg},${b},0.95)`); gr.addColorStop(0.22, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(0.5, `rgba(${r},${gg},${b},0.08)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); }
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeGlowSprite(color, opacity, soft) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(color, soft), color: 0xffffff, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  const s = new THREE.Sprite(m); s.renderOrder = 5; return s;
}

// ---------------- stars (d3-celestial / Hipparcos bright stars) ----------------
function bvToRgb(bv) {
  bv = clamp(bv, -0.4, 2.0);
  const stops = [[-0.4, [0.62, 0.71, 1.0]], [0.0, [0.80, 0.86, 1.0]], [0.3, [0.98, 0.98, 1.0]], [0.6, [1.0, 0.95, 0.84]], [1.0, [1.0, 0.84, 0.62]], [1.5, [1.0, 0.72, 0.45]], [2.0, [1.0, 0.6, 0.35]]];
  for (let i = 1; i < stops.length; i++) if (bv <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const f = (bv - a) / (b - a); return ca.map((x, k) => x + (cb[k] - x) * f); }
  return stops[stops.length - 1][1];
}
function buildStars() {
  const mat = new THREE.ShaderMaterial({ vertexShader: GLSL_STAR_V, fragmentShader: GLSL_STAR_F, uniforms: { uScale: { value: 1 }, uBright: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  R.starMat = mat;
  const geo = new THREE.BufferGeometry();
  R.stars = new THREE.Points(geo, mat); R.stars.frustumCulled = false; R.stars.renderOrder = -10; R.bgScene.add(R.stars);
  fetch(ASSET('stars.json')).then(r => r.json()).then(arr => {
    const n = arr.length / 4, pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    const RS = 1e9;
    for (let i = 0; i < n; i++) {
      const ra = arr[4 * i] * DEG, dec = arr[4 * i + 1] * DEG, mag = arr[4 * i + 2], bv = arr[4 * i + 3];
      const eq = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)], e = eqToEcl(eq);
      pos[3 * i] = e[0] * RS; pos[3 * i + 1] = e[1] * RS; pos[3 * i + 2] = e[2] * RS;
      const fl = Math.pow(10, -0.4 * (mag - 6.5));
      size[i] = clamp(1.6 + 1.25 * Math.sqrt(fl), 1.6, 9);
      const b = clamp(0.25 + 0.6 * Math.sqrt(fl) / 3, 0.18, 1.6);
      const c = bvToRgb(bv); col[3 * i] = c[0] * b; col[3 * i + 1] = c[1] * b; col[3 * i + 2] = c[2] * b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  }).catch(() => { });
}

// ---------------- planets ----------------
function capUniforms() { return { uCapDir: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 1, 0)) }, uCapCos: { value: [2, 2, 2, 2] } }; }
function bodyMaterial(name) {
  const sunU = { value: new THREE.Vector3(1, 0, 0) };
  if (name === 'earth') {
    // earth_aux: R the sea, G and B the slopes east and north (128 + slope·1000), drawn 5× steeper
    const m = new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_EARTH_F, uniforms: { tDay: { value: loadTex('earth_day.jpg') }, tNight: { value: loadTex('earth_night.jpg', false, true) },
      tClouds: { value: loadTex('earth_clouds.jpg', false, true) }, tAux: { value: loadTex('earth_aux.jpg', false) }, uSlopeK: { value: 1000 }, uRelief: { value: 5 }, uReliefNear: { value: new THREE.Vector2(20, 120) }, uPole: { value: new THREE.Vector3(0, 0, 1) },
      uSunDir: sunU, uLights: { value: 1 }, uFill: { value: new THREE.Vector3(0, 0, 0) }, tDetail: { value: R.detailTexEarth }, uDetailAmp: { value: 0.5 }, uDetailRep: { value: new THREE.Vector2(512, 256) },
      ...capUniforms(), ...atmosUniforms('earth') } });
    const big = f => [{ file: f, near: 25, far: 60, big: true }];
    texLOD('earth', m.uniforms.tDay, big('earth_day_8k.jpg'), true, false); texLOD('earth', m.uniforms.tClouds, big('earth_clouds_8k.jpg'), false, true); texLOD('earth', m.uniforms.tNight, big('earth_night_8k.jpg'), false, true);
    return m;
  }
  if (name === 'sun') return new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.86) });
  const maps = { moon: 'moon.jpg', mars: 'mars.jpg', venus: 'venus.jpg', jupiter: 'jupiter.jpg', saturn: 'saturn.jpg' };
  const ls = { moon: 0.9, mercury: 0.9, mars: 0.45, venus: 0.0, jupiter: 0.0, saturn: 0.0, uranus: 0.0, neptune: 0.0 }[name] ?? 0;
  const amb = { moon: 0.012, mars: 0.006 }[name] ?? 0.004;
  const tint = name === 'mars' ? [1.0, 0.95, 0.9] : [1, 1, 1];
  const plain = { mercury: '#9c958c', uranus: '#a9dde3', neptune: '#5c7fe6' }[name];
  // relief: slope maps (128 + slope·400) from LRO LOLA and MGS MOLA, loaded with the 4096 px colour maps when the camera
  // heads for the body (until then a 1024 px map and no relief)
  const aux = { moon: ['moon_aux.jpg', 1.0], mars: ['mars_aux.jpg', 1.5] }[name];
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_ROCK_F, defines: name === 'mars' ? { HAS_ATMO: 1 } : {}, uniforms: {
    map: { value: maps[name] ? loadTex(maps[name]) : null }, uHasMap: { value: maps[name] ? 1 : 0 }, uSunDir: sunU, uAmb: { value: amb }, uLS: { value: ls },
    uTint: { value: plain ? new THREE.Color(plain).convertSRGBToLinear() : new THREE.Vector3(...tint) }, uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogK: { value: 0 }, uFill: { value: new THREE.Vector3(0, 0, 0) },
    tAux: { value: null }, uHasAux: { value: 0 }, uSlopeK: { value: 400 }, uRelief: { value: aux ? aux[1] : 0 }, uReliefNear: { value: new THREE.Vector2(8, 40) }, uPole: { value: new THREE.Vector3(0, 0, 1) },
    tDetail: { value: R.detailTex }, uDetailAmp: { value: ({ moon: 0.35, mars: 0.45, mercury: 0.8 })[name] || 0 }, uDetailRep: { value: new THREE.Vector2(512, 256) }, ...capUniforms(),
    ...(name === 'mars' ? atmosUniforms('mars', true) : {}) } });
  if (aux) {
    texLOD(name, m.uniforms.map, [{ file: name + '_4k.jpg', near: 100, far: 400 }, { file: name + '_8k.jpg', near: 25, far: 60, big: true }], true, false);
    texLOD(name, m.uniforms.tAux, [{ file: aux[0], near: 100, far: 400 }], false, false, m.uniforms.uHasAux);
  }
  return m;
}
function atmoShell(color, sunset, strength, pow, scale) {
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_ATMO_F, uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uSunset: { value: new THREE.Color(sunset) }, uStrength: { value: strength }, uPow: { value: pow } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), m); mesh.scale.setScalar(scale); mesh.renderOrder = 2; return mesh;
}
function buildBodies() {
  R.bodies = {};
  // Earth's sphere is finer: its facets would otherwise sink up to 1.9 km below the true surface, enough to show at the limb
  // against the air drawn on the true sphere
  const geo = new THREE.SphereGeometry(1, 128, 64), geoFine = new THREE.SphereGeometry(1, 384, 192);
  for (const name of BODY_LIST) {
    const B = BODIES[name];
    const g = new THREE.Group(); g.name = name;
    const mat = bodyMaterial(name);
    const mesh = new THREE.Mesh(name === 'earth' ? geoFine : geo, mat);
    const Rb = name === 'earth' ? B.R : (B.Rmean && name !== 'earth' ? B.Rmean : B.R);
    const flat = { jupiter: 0.06487, saturn: 0.09796 }[name] || 0; // Earth, Moon & Mars stay spherical, as in the flight planner
    mesh.scale.set(Rb, Rb * (1 - flat), Rb);
    g.add(mesh);
    const rec = { name, group: g, mesh, mat, R: Rb };
    if (name === 'venus') { rec.atmo = atmoShell('#ffe7b8', '#ffb070', 0.6, 3.0, 1.0); rec.atmo.scale.setScalar(Rb * 1.015); g.add(rec.atmo); }
    if (name === 'saturn') {
      const rg = new THREE.RingGeometry(74500, 136800, 256, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - 74500) / (136800 - 74500), 0.5); }
      const c = document.createElement('canvas'); c.width = 512; c.height = 4; const cx = c.getContext('2d');
      for (let x = 0; x < 512; x++) { const f = x / 512; let a = 0.25 + 0.5 * Math.abs(Math.sin(f * 40)) * (f > 0.45 && f < 0.52 ? 0.05 : 1) * (f < 0.12 ? 0.3 : 1); const l = 190 + 40 * Math.sin(f * 17); cx.fillStyle = `rgba(${l},${l - 15},${l - 45},${a})`; cx.fillRect(x, 0, 1, 4); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; // ring plane = local xz (equator), local y = pole
      g.add(ring); rec.ring = ring;
    }
    if (name === 'sun') mesh.renderOrder = 1;
    R.scene.add(g);
    R.bodies[name] = rec;
  }
}
const _m4 = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3();
// orientation of a body mesh: local x = lon 0, local y = north pole, local −z = lon 90°E
function bodyQuat(name, t, q) {
  if (name === 'sun') { const p = bodyPoleEcl('sun', t); _vy.set(p[0], p[1], p[2]); _vx.set(1, 0, 0); _vz.crossVectors(_vx, _vy).normalize(); _vx.crossVectors(_vy, _vz); _m4.makeBasis(_vx, _vy, _vz); return q.setFromRotationMatrix(_m4); }
  const m = bodyFixedToEcl(name, t);
  _vx.set(m[0], m[3], m[6]); _vy.set(m[2], m[5], m[8]); _vz.set(-m[1], -m[4], -m[7]);
  _m4.makeBasis(_vx, _vy, _vz); return q.setFromRotationMatrix(_m4);
}
function helio(name, t) { // per-frame cache of heliocentric positions
  const k = name + '@' + t; if (R.helio[k]) return R.helio[k];
  const v = planetHelio(name, t); R.helio[k] = v; return v;
}
function updateBodies(t, camDist) {
  const O = R.O;
  for (const name of BODY_LIST) {
    const b = R.bodies[name]; const P = helio(name, t).r;
    b.group.position.set(P[0] - O[0], P[1] - O[1], P[2] - O[2]);
    bodyQuat(name, t, b.mesh.quaternion);
    if (b.ring) { b.ring.quaternion.copy(b.mesh.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); }
    if (b.atmo) b.atmo.quaternion.copy(b.mesh.quaternion);
    const d = vnorm(P) || 1; const sd = [-P[0] / d, -P[1] / d, -P[2] / d];
    if (b.mat.uniforms && b.mat.uniforms.uSunDir) b.mat.uniforms.uSunDir.value.set(sd[0], sd[1], sd[2]);
    if (b.mat.uniforms && b.mat.uniforms.uPole) b.mat.uniforms.uPole.value.set(0, 1, 0).applyQuaternion(b.mesh.quaternion);
    if (b.mat.uniforms && b.mat.uniforms.aSun) b.mat.uniforms.aSun.value.set(sd[0], sd[1], sd[2]);
    if (b.atmo) b.atmo.material.uniforms.uSunDir.value.set(sd[0], sd[1], sd[2]);
  }
  updateTexLOD();
  R.sunLight.position.set(-O[0], -O[1], -O[2]);
  // Sun glow: real corona size, but never smaller than a bright point
  const sunCam = R.camera.position.distanceTo(R.bodies.sun.group.position);
  const s1 = Math.max(BODIES.sun.R * 7, sunCam * 0.045), s2 = Math.max(BODIES.sun.R * 30, sunCam * 0.16);
  R.sunGlow.position.copy(R.bodies.sun.group.position); R.sunGlow.scale.set(s1, s1, 1);
  R.sunGlow2.position.copy(R.bodies.sun.group.position); R.sunGlow2.scale.set(s2, s2, 1);
}

// ---------------- orbits of planets and the Moon ----------------
function orbitLineMaterial(color, opacity) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}
function buildPlanetOrbits() {
  R.orbitGroup = new THREE.Group(); R.scene.add(R.orbitGroup);
  R.planetOrbits = {};
  for (const name of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 721), 3));
    const line = new THREE.Line(geo, orbitLineMaterial(BODY_COLORS[name], 0.35)); line.frustumCulled = false;
    R.orbitGroup.add(line); R.planetOrbits[name] = { line, tBuilt: null };
  }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 400), 3));
  R.moonOrbit = { line: new THREE.Line(mg, orbitLineMaterial('#9fb2c8', 0.35)), tBuilt: null };
  R.moonOrbit.line.frustumCulled = false; R.scene.add(R.moonOrbit.line);
}
function updateOrbits(t, show, camDist, frameMode) {
  R.orbitGroup.visible = show && camDist > 4e6;
  const O = R.O;
  if (R.orbitGroup.visible) {
    for (const name in R.planetOrbits) {
      const po = R.planetOrbits[name];
      if (po.tBuilt == null || Math.abs(t - po.tBuilt) > 200 * DAY) {
        const el = planetElemsAt(name === 'earth' ? 'emb' : name, t), arr = po.line.geometry.attributes.position.array;
        for (let i = 0; i <= 720; i++) { const s = stateFromElemsM(el.a, el.e, el.i, el.Om, el.w, i / 720 * TAU, BODIES.sun.mu); arr[3 * i] = s.r[0]; arr[3 * i + 1] = s.r[1]; arr[3 * i + 2] = s.r[2]; }
        po.line.geometry.attributes.position.needsUpdate = true; po.tBuilt = t;
      }
    }
    R.orbitGroup.position.set(-O[0], -O[1], -O[2]);
  }
  const mo = R.moonOrbit;
  mo.line.visible = show && camDist > 3e4 && camDist < 5e7 && frameMode !== 'emrot';
  if (mo.line.visible) {
    if (mo.tBuilt == null || Math.abs(t - mo.tBuilt) > 0.5 * DAY) {
      const arr = mo.line.geometry.attributes.position.array;
      for (let i = 0; i < 400; i++) { const tt = t - 13.7 * DAY + i / 399 * 27.4 * DAY; const m = moonGeo(tt).r; arr[3 * i] = m[0]; arr[3 * i + 1] = m[1]; arr[3 * i + 2] = m[2]; }
      mo.line.geometry.attributes.position.needsUpdate = true; mo.tBuilt = t;
    }
    const E = helio('earth', t).r; mo.line.position.set(E[0] - O[0], E[1] - O[1], E[2] - O[2]);
  }
}

// atmosphere sky dome for cameras inside the air of Earth or Mars
const SKY_LOOK = { earth: { zen: '#2f6bd0', hor: '#c3daf3', set: '#ff8f4a', halo: '#fff2d8', H: 8.5, top: 85 }, mars: { zen: '#b08a66', hor: '#dcbf98', set: '#6f9ad8', halo: '#d6e6ff', H: 11.1, top: 70 } };
function updateSky() {
  const camH = vadd(R.O, [R.camera.position.x, R.camera.position.y, R.camera.position.z]);
  let best = null;
  for (const b of ['earth', 'mars']) { const P = helio(b, MV.tNow).r; const d = vsub(camH, P); const alt = vnorm(d) - surfaceRadius(b); if (alt < SKY_LOOK[b].top && (!best || alt < best.alt)) best = { b, alt, up: vunit(d) }; }
  const u = R.sky.material.uniforms;
  let dens = 0, day = 0;
  if (best) {
    const L = SKY_LOOK[best.b]; dens = clamp(Math.exp(-Math.max(best.alt, 0) / L.H) * (1 - smoothstep(best.alt / L.top)), 0, 1);
    const sun = vunit(vscale(camH, -1)); u.uUp.value.set(...best.up); u.uSun.value.set(...sun);
    u.uZenith.value.set(L.zen); u.uHorizon.value.set(L.hor); u.uSunset.value.set(L.set); u.uHalo.value.set(L.halo);
    const el = vdot(sun, best.up); day = smoothstep((el + 0.2) / 0.26);
    R.hemi.position.set(...best.up); R.hemi.color.set(best.b === 'mars' ? '#d8b48c' : '#9cc3ff'); R.hemi.groundColor.set(best.b === 'mars' ? '#7a4a30' : '#5a5040');
  }
  // bounce light from a sunlit lunar surface, ambient fill
  let moonFill = 0;
  if (!best) { const Pm = helio('moon', MV.tNow).r; const d = vsub(camH, Pm); const alt = vnorm(d) - BODIES.moon.R; if (alt < 400) { const up = vunit(d); const el = vdot(vunit(vscale(camH, -1)), up); moonFill = clamp(el * 3, 0, 1) * (1 - alt / 400); R.hemi.position.set(...up); R.hemi.color.set('#000000'); R.hemi.groundColor.set('#8f8a84'); } }
  R.ambient.intensity = MV.layers.fill === false ? 0.04 : 0.35;
  u.uDensity.value = dens; R.sky.visible = dens > 0.002 && !(best && R.airSky[best.b]);
  for (const b of ['mars']) { const U = R.bodies[b].mat.uniforms; if (best && best.b === b) { U.uFogK.value = dens / 90; U.uFogColor.value.copy(u.uHorizon.value).multiplyScalar(0.25 + 0.75 * day); } else U.uFogK.value = 0; }
  // the physically based air: the camera relative to each planet (double precision here, so the shaders get its altitude
  // exactly), and the Sun seen through the air (reddened and dimmed near the horizon, also from orbit at sunrise)
  let sunT = null;
  let wb = [1, 1, 1];
  for (const name in R.airSky) {
    const A = ATMOS[name], U = A.U; if (!A.lutT) { R.airSky[name].visible = false; continue; } // (tables still to come)
    const rel = vsub(camH, helio(name, MV.tNow).r), r = vnorm(rel), h = r - A.Rg, sunD = vunit(vscale(camH, -1));
    U.aCam.value.set(rel[0], rel[1], rel[2]); U.aCamR.value = r; U.aCamH.value = h; U.aRgE.value = Math.min(A.Rg, groundRadius(name, vscale(rel, 1 / r), MV.tNow));
    R.airSky[name].visible = r < A.Rg * 120;
    const sT = r < A.Rg + A.top + 2000 ? atmosSunTransmittance(name, rel, sunD) : null, ex = atmosExposure(name, h, sT);
    U.aWB.value.set(...ex.wb); U.aGrade.value.set(...ex.grade); U.aExpo.value = ex.expo;
    // the airglow shows as a thin line on the limb seen from above it, not as a glow around a camera inside the layer
    const gk = smoothstep((h - 110) / 40); U.aGlow.value.set(A.glow[0] * gk, A.glow[1] * gk, A.glow[2] * gk);
    if (sT) { sunT = sT; wb = ex.wb.map(x => x * ex.expo); }
  }
  const st = sunT ? sunT.map((x, i) => Math.min(x * wb[i], 1.2)) : [1, 1, 1];
  R.sunLight.color.setRGB(st[0], st[1], st[2]);
  R.bodies.sun.mat.color.setRGB(1.0 * st[0], 0.96 * st[1], 0.86 * st[2]);
  R.sunGlow.material.color.setRGB(st[0], st[1], st[2]); R.sunGlow2.material.color.setRGB(st[0], st[1], st[2]);
  R.hemi.intensity = best ? 1.6 * dens * day : 1.4 * moonFill;
  // night fill: with "Cinematic fill light" on, the ground near the camera stays readable after dark (on the Moon it stands in for earthshine)
  const fillOn = MV.layers.fill !== false;
  for (const n of ['earth', 'moon', 'mars']) { const U = R.bodies[n].mat.uniforms; if (U.uFill) U.uFill.value.set(0, 0, 0); }
  if (fillOn) {
    let fb = null, near = 0, night = 0;
    if (best) { fb = best.b; near = 1 - smoothstep((best.alt - 40) / 400); night = 1 - day; }
    else { const Pm = helio('moon', MV.tNow).r; const d = vsub(camH, Pm); const alt = vnorm(d) - BODIES.moon.R; if (alt < 600) { fb = 'moon'; near = 1 - smoothstep((alt - 40) / 500); const el = vdot(vunit(vscale(camH, -1)), vunit(d)); night = 1 - smoothstep((el + 0.05) / 0.2); } }
    if (fb && near * night > 0.001) {
      const k = near * night, c = fb === 'mars' ? [0.20, 0.20, 0.26] : fb === 'moon' ? [0.13, 0.15, 0.20] : [0.07, 0.08, 0.12];
      R.bodies[fb].mat.uniforms.uFill.value.set(c[0] * k, c[1] * k, c[2] * k);
      if (best) { R.hemi.intensity += 0.55 * k * dens; R.hemi.color.lerp(new THREE.Color('#8ea2cc'), k); R.hemi.groundColor.lerp(new THREE.Color('#3d3833'), k); }
    }
  }
  R.skyDens = dens * (0.15 + 0.85 * day);
  { // the surround for image-based lighting
    const U = R.envMat.uniforms, sunD = vunit(vscale(camH, -1));
    U.uDens.value = clamp(dens * 4, 0, 1); U.uDay.value = day; U.uFill.value = fillOn ? 0.035 : 0.01;
    if (best) { const L = SKY_LOOK[best.b]; U.uUp.value.set(...best.up); U.uZen.value.set(L.zen); U.uHor.value.set(L.hor); U.uGnd.value.set(best.b === 'mars' ? '#8a5a3a' : '#6a6050'); }
    let pl = null; for (const b of ['earth', 'moon', 'mars']) { const d = vsub(helio(b, MV.tNow).r, camH), r = vnorm(d), R0 = surfaceRadius(b); if (r < R0 * 60 && (!pl || r / R0 < pl.k)) pl = { b, d, r, R0, k: r / R0 }; }
    if (pl) { const dir = vunit(pl.d), lit = clamp(0.5 - 0.5 * vdot(dir, sunD), 0, 1); U.uPl.value.set(...dir); U.uPlCos.value = Math.sqrt(Math.max(0, 1 - (pl.R0 / pl.r) ** 2)); U.uPlCol.value.set(pl.b === 'earth' ? '#6f8fb8' : pl.b === 'mars' ? '#a0704c' : '#8a8680').multiplyScalar(0.2 + 0.7 * lit); }
    else U.uPlCos.value = 2;
    if (R.envN++ % 6 === 0) { R.envCam.update(R.renderer, R.envScene); R.envPM = R.pmrem.fromCubemap(R.envRT.texture, R.envPM); R.scene.environment = R.envPM.texture; }
  }
}
