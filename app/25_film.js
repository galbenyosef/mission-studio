// ============================================================================
// Film look (the "Film look" layer): the frame as a camera on film would show it. Light brighter than white blooms
// into its surroundings (the Sun, a rocket's flame, the glow of an entry), highlights roll off instead of clipping, the
// corners fall off a little and fine grain moves over the picture. The scene is drawn into a floating-point target
// instead of the screen, so light keeps its strength above white, and a last pass draws it to the screen. With the layer
// off the scene goes straight to the screen as before.
// ============================================================================
// Materials write the same sRGB-encoded values into any target as onto the screen (three.js would write linear values
// into a target), so the scene looks the same either way; the app's own shaders already write display values.
THREE.ShaderChunk.colorspace_fragment = 'gl_FragColor = sRGBTransferOETF( gl_FragColor );';
const FILM = { ok: null, rt: null, down: [], up: [], w: 0, h: 0, samples: -1, scene: null, cam: null, quad: null, mat: null };
const FILM_LEVELS = 6; // bloom levels, each half the size of the one before (from half the screen down to 1/64)
const GLSL_FILM_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const GLSL_FILM_LIB = `
varying vec2 vUv;
// A texel holding NaN or infinity (all its exponent bits set), taken as no light. A shader can slip one into the float
// target (pow() of a negative number, a sum past the half float's 65504); on the screen it would be clamped away, but here
// it stays, and every filter that reads it turns its whole footprint black.
bvec3 nonFinite(vec3 c){ return equal(floatBitsToUint(c) & uvec3(0x7f800000u), uvec3(0x7f800000u)); }
vec3 finite(vec3 c){ return mix(c, vec3(0.0), nonFinite(c)); }
vec3 toLinear(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// a 2×2-texel box at the centre and four diagonal taps half a texel out (the "dual filter" downsample)
vec3 down(sampler2D t, vec2 uv, vec2 h){ return (finite(texture2D(t, uv).rgb) * 4.0 + finite(texture2D(t, uv - h).rgb) + finite(texture2D(t, uv + h).rgb) + finite(texture2D(t, uv + vec2(h.x, -h.y)).rgb) + finite(texture2D(t, uv - vec2(h.x, -h.y)).rgb)) / 8.0; }
// a tent of eight taps (the "dual filter" upsample)
vec3 up(sampler2D t, vec2 uv, vec2 h){
  vec3 s = texture2D(t, uv + vec2(-2.0 * h.x, 0.0)).rgb + texture2D(t, uv + vec2(2.0 * h.x, 0.0)).rgb + texture2D(t, uv + vec2(0.0, 2.0 * h.y)).rgb + texture2D(t, uv + vec2(0.0, -2.0 * h.y)).rgb;
  s += 2.0 * (texture2D(t, uv + vec2(-h.x, h.y)).rgb + texture2D(t, uv + vec2(h.x, h.y)).rgb + texture2D(t, uv + vec2(h.x, -h.y)).rgb + texture2D(t, uv + vec2(-h.x, -h.y)).rgb);
  return s / 12.0;
}`;
const GLSL_FILM_F = {
  // what blooms: the light above a soft threshold, taken in linear light from the screen-sized picture
  // (the light over the threshold eased off, so a glint ten times white does not throw a halo ten times as wide)
  bright: `uniform sampler2D tSrc; uniform vec2 uH; uniform float uThr, uKnee, uCap;
void main(){
  vec3 c = toLinear(down(tSrc, vUv, uH));
  float br = max(c.r, max(c.g, c.b)), q = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee);
  q = q * q / (4.0 * uKnee + 1e-4);
  float e = max(q, br - uThr); e /= 1.0 + e / uCap;
  gl_FragColor = vec4(c * e / max(br, 1e-4), 1.0);
}`,
  down: `uniform sampler2D tSrc; uniform vec2 uH; void main(){ gl_FragColor = vec4(down(tSrc, vUv, uH), 1.0); }`,
  // back up through the levels, each adding its own blur: a sum of ever wider glows that falls off smoothly
  up: `uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uH; uniform float uScatter;
void main(){ gl_FragColor = vec4(texture2D(tAdd, vUv).rgb + uScatter * up(tSrc, vUv, uH), 1.0); }`,
  comp: `uniform sampler2D tSrc; uniform sampler2D tBloom; uniform vec2 uH; uniform float uBloom, uVig, uGrain, uGrainPx, uTime; uniform vec4 uFrame;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb;
  if (any(nonFinite(s))) { // a pixel the scene left without a number: its neighbours' light instead
    vec2 px = 1.0 / vec2(textureSize(tSrc, 0));
    s = 0.25 * (finite(texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb) + finite(texture2D(tSrc, vUv - vec2(px.x, 0.0)).rgb) + finite(texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb) + finite(texture2D(tSrc, vUv - vec2(0.0, px.y)).rgb));
  }
  vec3 lin = toLinear(s) + uBloom * up(tBloom, vUv, uH);
  const float a = 0.85; // above this the light rolls off toward white instead of clipping
  lin = mix(lin, a + (1.0 - a) * (1.0 - exp(-(lin - a) / (1.0 - a))), step(a, lin));
  vec3 c = toSRGB(lin);
  vec2 d = gl_FragCoord.xy - (uFrame.xy + 0.5 * uFrame.zw); // fall-off toward the corners of the film frame
  c *= 1.0 - uVig * smoothstep(0.3, 1.0, length(d) / (0.5 * length(uFrame.zw)));
  vec2 g = floor(gl_FragCoord.xy / uGrainPx), o = vec2(fract(uTime * 7.31), fract(uTime * 11.17)) * 1031.0; // a new grain every frame
  float n = hash(g + o) + hash(g + o + 17.13) - 1.0, l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += n * uGrain * (0.3 + 2.8 * l * (1.0 - l)); // strongest in the mid-tones
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};
function filmSupported() {
  if (FILM.ok !== null) return FILM.ok;
  const r = R.renderer; FILM.ok = !!(r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float')));
  return FILM.ok;
}
function filmTarget(w, h, samples) {
  return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: samples >= 0, samples: Math.max(samples, 0) });
}
function filmFree() {
  if (FILM.rt) FILM.rt.dispose(); for (const t of [...FILM.down, ...FILM.up]) t.dispose();
  FILM.rt = null; FILM.down = []; FILM.up = []; FILM.w = FILM.h = 0;
}
// Before the scene is drawn: true when it goes into the film target (sized to the screen), false to draw straight to it
const _filmSize = new THREE.Vector2();
function filmBegin() {
  if (!MV.layers.film || !filmSupported()) { if (FILM.rt) filmFree(); return false; }
  const r = R.renderer; r.getDrawingBufferSize(_filmSize); const w = _filmSize.x, h = _filmSize.y;
  const aa = r.getContext().getContextAttributes().antialias, samples = aa ? 4 : 0;
  if (w !== FILM.w || h !== FILM.h || samples !== FILM.samples) {
    filmFree(); FILM.w = w; FILM.h = h; FILM.samples = samples;
    FILM.rt = filmTarget(w, h, samples);
    for (let i = 0; i < FILM_LEVELS; i++) { const lw = Math.max(1, w >> (i + 1)), lh = Math.max(1, h >> (i + 1)); FILM.down.push(filmTarget(lw, lh, -1)); if (i < FILM_LEVELS - 1) FILM.up.push(filmTarget(lw, lh, -1)); }
  }
  if (!FILM.scene) {
    FILM.scene = new THREE.Scene(); FILM.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (f, u) => new THREE.ShaderMaterial({ vertexShader: GLSL_FILM_V, fragmentShader: GLSL_FILM_LIB + f, uniforms: u, depthTest: false, depthWrite: false });
    const T = () => ({ value: null }), V = () => ({ value: new THREE.Vector2() });
    FILM.mat = {
      bright: mk(GLSL_FILM_F.bright, { tSrc: T(), uH: V(), uThr: { value: 1.3 }, uKnee: { value: 0.3 }, uCap: { value: 1.5 } }),
      down: mk(GLSL_FILM_F.down, { tSrc: T(), uH: V() }),
      up: mk(GLSL_FILM_F.up, { tSrc: T(), tAdd: T(), uH: V(), uScatter: { value: 0.75 } }),
      comp: mk(GLSL_FILM_F.comp, { tSrc: T(), tBloom: T(), uH: V(), uBloom: { value: 0.3 }, uVig: { value: 0.18 }, uGrain: { value: 0.028 }, uGrainPx: { value: 1 }, uTime: { value: 0 }, uFrame: { value: new THREE.Vector4() } }),
    };
    FILM.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), FILM.mat.comp); FILM.quad.frustumCulled = false; FILM.scene.add(FILM.quad);
  }
  r.setRenderTarget(FILM.rt);
  return true;
}
function filmPass(mat, target) { FILM.quad.material = mat; R.renderer.setRenderTarget(target); R.renderer.render(FILM.scene, FILM.cam); }
// After the scene: bloom, roll-off, vignette and grain, onto the screen
function filmEnd() {
  const M = FILM.mat, D = FILM.down, U = FILM.up, half = (t, v) => v.set(0.5 / t.width, 0.5 / t.height);
  M.bright.uniforms.tSrc.value = FILM.rt.texture; half(FILM.rt, M.bright.uniforms.uH.value); filmPass(M.bright, D[0]);
  for (let i = 1; i < D.length; i++) { M.down.uniforms.tSrc.value = D[i - 1].texture; half(D[i - 1], M.down.uniforms.uH.value); filmPass(M.down, D[i]); }
  for (let i = U.length - 1; i >= 0; i--) {
    const low = i === U.length - 1 ? D[i + 1] : U[i + 1];
    M.up.uniforms.tSrc.value = low.texture; M.up.uniforms.tAdd.value = D[i].texture; half(low, M.up.uniforms.uH.value); filmPass(M.up, U[i]);
  }
  const c = M.comp.uniforms, pr = R.renderer.getPixelRatio(), fr = frameRect();
  c.tSrc.value = FILM.rt.texture; c.tBloom.value = U[0].texture; half(U[0], c.uH.value);
  c.uTime.value = R.clock || 0; c.uFrame.value.set(fr.x * pr, (R.height - fr.y - fr.h) * pr, fr.w * pr, fr.h * pr);
  c.uGrainPx.value = Math.max(1, Math.round(pr)); c.uGrain.value = MV.filmGrain === false ? 0 : 0.028; // (a video can do without: grain costs bitrate)
  filmPass(M.comp, null);
}
