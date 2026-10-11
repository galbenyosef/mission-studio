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
  float w1 = 1.0 - smoothstep(600.0, 4000.0, dist), w2 = 1.0 - smoothstep(30.0, 220.0, dist), w3 = 1.0 - smoothstep(1.5, 12.0, dist), w4 = 1.0 - smoothstep(0.08, 0.7, dist);
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
const GLSL_EARTH_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tCS; uniform vec3 uSunDir; uniform float uLights; uniform float uRim; uniform vec3 uFogColor; uniform float uFogK; uniform vec3 uFill;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_DETAIL}
void main() {
  ${LOGDEPTH_EXACT}
  capHoles();
  vec3 N = normalize(vN); vec3 L = normalize(uSunDir); vec3 V = normalize(cameraPosition - vP);
  float ndl = dot(N, L);
  vec3 day = texture2D(tDay, vUv).rgb;
  vec3 cs = texture2D(tCS, vUv).rgb;
  vec3 night = texture2D(tNight, vUv).rgb;
  float cloud = smoothstep(0.08, 0.9, cs.g);
  float ocean = cs.r;
  float diff = max(ndl, 0.0);
  float dayMix = smoothstep(-0.10, 0.12, ndl);
  day *= mix(detailAt(vUv, length(cameraPosition - vP)), 1.0, ocean);
  vec3 col = day * (0.012 + 1.05 * diff);
  vec3 Hh = normalize(L + V);
  float spec = pow(max(dot(N, Hh), 0.0), 70.0) * ocean * (1.0 - cloud) * smoothstep(0.0, 0.1, ndl);
  col += vec3(1.0, 0.93, 0.80) * spec * 0.55;
  col = mix(col, vec3(0.92, 0.94, 0.97) * (0.012 + 1.05 * diff), cloud * 0.92);
  vec3 lights = pow(night, vec3(1.6)) * vec3(1.0, 0.78, 0.45) * 2.6 * uLights * (1.0 - dayMix) * (1.0 - cloud * 0.75);
  lights *= smoothstep(5.0, 60.0, length(cameraPosition - vP)); // from close by, a town's glow is its separate lights, not a lit patch of ground
  col += lights;
  col += day * uFill * (1.0 - dayMix); // cinematic night fill near the camera: the ground stays readable after dark
  float mu = max(dot(N, V), 0.0);
  float fres = pow(1.0 - mu, 2.6);
  col += vec3(0.26, 0.52, 1.0) * fres * 0.75 * uRim * smoothstep(-0.25, 0.35, ndl);
  col += vec3(0.6, 0.22, 0.05) * pow(1.0 - abs(ndl), 10.0) * smoothstep(-0.15, 0.05, ndl) * 0.35;
  float fog = 1.0 - exp(-length(cameraPosition - vP) * uFogK);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const GLSL_ROCK_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 uSunDir; uniform float uAmb; uniform float uLS; uniform vec3 uTint; uniform float uHasMap; uniform vec3 uFogColor; uniform float uFogK; uniform vec3 uFill;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${GLSL_DETAIL}
void main() {
  ${LOGDEPTH_EXACT}
  capHoles();
  vec3 N = normalize(vN); vec3 L = normalize(uSunDir); vec3 V = normalize(cameraPosition - vP);
  float mu0 = max(dot(N, L), 0.0); float mu = max(dot(N, V), 0.0);
  float ls = min(2.0 * mu0 / max(mu0 + mu, 1e-4), 1.35);
  float shade = mix(mu0, ls * smoothstep(0.0, 0.04, mu0), uLS);
  vec3 alb = (uHasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(1.0)) * uTint;
  if (uDetailAmp > 0.0) alb *= detailAt(vUv, length(cameraPosition - vP));
  vec3 col = alb * (shade + uAmb) + alb * uFill * (1.0 - smoothstep(0.0, 0.25, mu0)); // night fill (earthshine on the Moon, cinematic elsewhere)
  col = mix(col, uFogColor, 1.0 - exp(-length(cameraPosition - vP) * uFogK));
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
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeDetailTexture() { // tileable value noise + craters, used to add surface texture below the resolution of the global maps
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
  for (let k = 0; k < 260; k++) { // craters with raised rims, power-law sizes
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
  R.maxAniso = renderer.capabilities.getMaxAnisotropy();
  R.renderer.autoClear = false;
  R.bgScene = new THREE.Scene(); R.bgCam = new THREE.PerspectiveCamera(40, 1, 1, 1e10);
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(5e8, 48, 24), new THREE.ShaderMaterial({ vertexShader: GLSL_SKY_V, fragmentShader: GLSL_SKY_F, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uUp: { value: new THREE.Vector3(0, 0, 1) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uDensity: { value: 0 }, uZenith: { value: new THREE.Color('#3a76d6') }, uHorizon: { value: new THREE.Color('#c6dcf2') }, uSunset: { value: new THREE.Color('#ff9a52') }, uHalo: { value: new THREE.Color('#fff2d8') } } }));
  R.sky.renderOrder = 10; R.sky.frustumCulled = false; R.bgScene.add(R.sky);
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
  R.detailTex = makeDetailTexture();
  buildStars();
  buildBodies();
  buildPlanetOrbits();
  R.sunGlow = makeGlowSprite('#fff4dc', 1.0); R.scene.add(R.sunGlow);
  R.sunGlow2 = makeGlowSprite('#ffcf8a', 0.35, true); R.scene.add(R.sunGlow2);
}
function loadTex(name, srgb = true) {
  const tex = R.loader.load(ASSET(name), () => { R.texLoaded++; });
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, R.maxAniso || 1);
  return tex;
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
    return new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_EARTH_F, uniforms: { tDay: { value: loadTex('earth_day.jpg') }, tNight: { value: loadTex('earth_night.jpg') }, tCS: { value: loadTex('earth_cs.jpg', false) }, uSunDir: sunU, uLights: { value: 1 }, uRim: { value: 1 }, uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogK: { value: 0 }, uFill: { value: new THREE.Vector3(0, 0, 0) }, tDetail: { value: R.detailTex }, uDetailAmp: { value: 0.55 }, uDetailRep: { value: new THREE.Vector2(512, 256) }, ...capUniforms() } });
  }
  if (name === 'sun') return new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.96, 0.86) });
  const maps = { moon: 'moon.jpg', mars: 'mars.jpg', venus: 'venus.jpg', jupiter: 'jupiter.jpg', saturn: 'saturn.jpg' };
  const ls = { moon: 0.9, mercury: 0.9, mars: 0.45, venus: 0.0, jupiter: 0.0, saturn: 0.0, uranus: 0.0, neptune: 0.0 }[name] ?? 0;
  const amb = { moon: 0.012, mars: 0.006 }[name] ?? 0.004;
  const tint = name === 'mars' ? [1.05, 0.98, 0.95] : [1, 1, 1];
  const plain = { mercury: '#9c958c', uranus: '#a9dde3', neptune: '#5c7fe6' }[name];
  return new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_ROCK_F, uniforms: {
    map: { value: maps[name] ? loadTex(maps[name]) : null }, uHasMap: { value: maps[name] ? 1 : 0 }, uSunDir: sunU, uAmb: { value: amb }, uLS: { value: ls },
    uTint: { value: plain ? new THREE.Color(plain).convertSRGBToLinear() : new THREE.Vector3(...tint) }, uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogK: { value: 0 }, uFill: { value: new THREE.Vector3(0, 0, 0) },
    tDetail: { value: R.detailTex }, uDetailAmp: { value: ({ moon: 0.85, mars: 0.7, mercury: 0.8 })[name] || 0 }, uDetailRep: { value: new THREE.Vector2(512, 256) }, ...capUniforms() } });
}
function atmoShell(color, sunset, strength, pow, scale) {
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_V, fragmentShader: GLSL_ATMO_F, uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uSunset: { value: new THREE.Color(sunset) }, uStrength: { value: strength }, uPow: { value: pow } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), m); mesh.scale.setScalar(scale); mesh.renderOrder = 2; return mesh;
}
function buildBodies() {
  R.bodies = {};
  const geo = new THREE.SphereGeometry(1, 128, 64);
  for (const name of BODY_LIST) {
    const B = BODIES[name];
    const g = new THREE.Group(); g.name = name;
    const mat = bodyMaterial(name);
    const mesh = new THREE.Mesh(geo, mat);
    const Rb = name === 'earth' ? B.R : (B.Rmean && name !== 'earth' ? B.Rmean : B.R);
    const flat = { jupiter: 0.06487, saturn: 0.09796 }[name] || 0; // Earth, Moon & Mars stay spherical, as in the flight planner
    mesh.scale.set(Rb, Rb * (1 - flat), Rb);
    g.add(mesh);
    const rec = { name, group: g, mesh, mat, R: Rb };
    if (name === 'earth') { rec.atmo = atmoShell('#4f8dff', '#ff8a3d', 1.0, 3.2, 1.0); rec.atmo.scale.set(Rb * 1.022, Rb * 1.022 * (1 - flat), Rb * 1.022); g.add(rec.atmo); }
    if (name === 'mars') { rec.atmo = atmoShell('#ffb48a', '#6fa3ff', 0.45, 3.5, 1.0); rec.atmo.scale.setScalar(Rb * 1.012); g.add(rec.atmo); }
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
    if (b.atmo) b.atmo.material.uniforms.uSunDir.value.set(sd[0], sd[1], sd[2]);
  }
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
  u.uDensity.value = dens; R.sky.visible = dens > 0.002;
  for (const b of ['earth', 'mars']) { const U = R.bodies[b].mat.uniforms; if (best && best.b === b) { U.uFogK.value = dens / (b === 'earth' ? 55 : 90); U.uFogColor.value.copy(u.uHorizon.value).multiplyScalar(0.25 + 0.75 * day); } else U.uFogK.value = 0; }
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
  // Earth rim highlight fades when the camera is low in the atmosphere
  const eAlt = vnorm(vsub(camH, helio('earth', MV.tNow).r)) - BODIES.earth.R;
  R.bodies.earth.mat.uniforms.uRim.value = smoothstep((eAlt - 30) / 600);
}
