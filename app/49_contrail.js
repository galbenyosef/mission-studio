// ============================================================================
// Wingtip vortex trails: a winged vehicle gliding home through moist air at high lift leaves two white threads of
// condensation spinning off its wingtips (the low pressure in the core of each vortex cools the air below its dew point).
// They form where the air is dense and humid, in the lowest kilometres, and strongest in the pull-up of the flare and the
// turns of the heading alignment cone; they fade in half a minute. How humid the air is depends on the site: Florida's
// morning air is wet, the high desert at Edwards dry.
// Each trail is a ribbon of samples fixed to the turning Earth (Earth-fixed coordinates, km), turned to face the camera and
// drawn as a soft thread that widens and thins with age. Models that can leave them carry userData.wingtips, the tips in
// the model's own frame (metres).
// ============================================================================
const CTR_N = 360, CTR_LIFE = 24; // samples per trail; seconds a sample lasts
const CTR_HUMID = { KSC15: 1, KSC33: 1, EDW22: 0.55, EDW23: 0.55, NOR17: 0.4 }; // by runway; others 0.7
const GLSL_CTR_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 aUV; attribute float aA;
varying vec2 vUV; varying float vA; varying vec3 vWP;
void main(){ vUV = aUV; vA = aA; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
#include <logdepthbuf_vertex>
}`;
const GLSL_CTR_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uSunDir;
varying vec2 vUV; varying float vA; varying vec3 vWP;
void main(){
  #include <logdepthbuf_fragment>
  float x = abs(vUV.y); if (x >= 1.0) discard;
  // a round thread: dense in the middle, soft at the edge; it glows looking toward the Sun (forward scattering)
  float chord = sqrt(1.0 - x * x), a = vA * chord * (1.0 - smoothstep(0.55, 1.0, x));
  vec3 V = normalize(cameraPosition - vWP); float hg = 0.5 / pow(1.36 - 1.2 * dot(-V, uSunDir), 1.5);
  vec3 col = (uSun * (0.6 + 0.15 * hg) + uAmb) * a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.a = a;
}`;
const _ctrQ = new THREE.Quaternion(), _ctrV = new THREE.Vector3(), _ctrT = new THREE.Vector3(), _ctrS = new THREE.Vector3(), _ctrC = new THREE.Quaternion();
function contrailInit(c) {
  const tr = { head: 0, n: 0, P: new Float64Array(3 * CTR_N * 2), T: new Float64Array(CTR_N), K: new Float32Array(CTR_N), mesh: null, tipNode: null, tipKey: null, lastT: null };
  const cap = CTR_N * 2, g = new THREE.BufferGeometry(), A = k => new THREE.BufferAttribute(new Float32Array(2 * cap * k), k).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', A(3)); g.setAttribute('aUV', A(2)); g.setAttribute('aA', A(1));
  const idx = new Uint32Array(6 * (cap - 1)); for (let i = 0; i < cap - 1; i++) { const a = 2 * i; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], 6 * i); }
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: GLSL_CTR_V, fragmentShader: GLSL_CTR_F, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uSun: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.2, 0.22, 0.26) }, uSunDir: { value: new THREE.Vector3(1, 0, 0) } } }));
  m.frustumCulled = false; m.renderOrder = 5; m.visible = false; R.scene.add(m); tr.mesh = m;
  c.ctr = tr; return tr;
}
function contrailDispose(c) { const tr = c.ctr; if (!tr) return; R.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose(); c.ctr = null; }
// how strongly the tips condense now: the air's density and humidity, and the lift the wings make (the angle of attack)
function contrailStrength(c, s, t, cfgL, model) {
  if (!model.userData.wingtips || !s || s.ref !== 'earth' || s.surface || !(cfgL && cfgL.key === 'sc')) return 0;
  const ex = s.extra || {}; if (!(ex.q > 1500) || ex.alpha == null) return 0;
  const h = (ex.alt != null ? ex.alt : vnorm(s.r) - BODIES.earth.R), humid = CTR_HUMID[MV.md.cfg.runway] ?? 0.6;
  const dens = 1 - smoothstep((h - 1.5) / 9), lift = smoothstep((ex.alpha - 4) / 6), q = smoothstep((ex.q - 1500) / 4000);
  return humid * dens * lift * q;
}
// called every frame for a craft in the air; adds a sample at each tip while the trail forms, and draws what is left
function updateContrails(c, s, t, cfgL, model) {
  const k = contrailStrength(c, s, t, cfgL, model);
  let tr = c.ctr; if (!tr) { if (k <= 0) return; tr = contrailInit(c); }
  const jump = tr.lastT != null && Math.abs(t - tr.lastT) > 5;
  if (jump) { tr.n = 0; tr.head = 0; } // a leap in time: the old threads are long gone
  bodyQuat('earth', t, _ctrQ); const E = helio('earth', t).r, O = R.O;
  if (k > 0 && t !== tr.lastT && !(MV.rate > 30)) { // a sample at each tip, Earth-fixed
    if (tr.tipKey !== model) { tr.tipNode = null; model.traverse(n => { if (!tr.tipNode && n.userData && n.userData.wingtips) tr.tipNode = n; }); tr.tipKey = model; }
    if (tr.tipNode) {
      const i = tr.head; _ctrC.copy(_ctrQ).invert();
      for (let side = 0; side < 2; side++) {
        const w = tr.tipNode.userData.wingtips[side]; _ctrV.set(w[0], w[1], w[2]); tr.tipNode.localToWorld(_ctrV);
        _ctrV.x += O[0] - E[0]; _ctrV.y += O[1] - E[1]; _ctrV.z += O[2] - E[2]; _ctrV.applyQuaternion(_ctrC);
        const j = 3 * (2 * i + side); tr.P[j] = _ctrV.x; tr.P[j + 1] = _ctrV.y; tr.P[j + 2] = _ctrV.z;
      }
      tr.T[i] = t; tr.K[i] = k; tr.head = (i + 1) % CTR_N; tr.n = Math.min(tr.n + 1, CTR_N);
    }
  }
  tr.lastT = t;
  // the ribbons: the samples from the oldest alive to the newest, one strip per tip
  const g = tr.mesh.geometry, pos = g.attributes.position.array, uv = g.attributes.aUV.array, aa = g.attributes.aA.array;
  const cam = R.camera.position; let v = 0;
  const sunD = vunit(vscale(E, -1)); tr.mesh.material.uniforms.uSunDir.value.set(sunD[0], sunD[1], sunD[2]);
  tr.mesh.material.uniforms.uSun.value.copy(R.sunLight.color).multiplyScalar(0.5); tr.mesh.material.uniforms.uAmb.value.copy(R.hemi.color).multiplyScalar(0.15 * R.hemi.intensity + 0.03); // (dim in the dark: the night fill is a cheat for the ground, not for threads of mist)
  const pair = (x, y, z, w, a, m) => { for (const sgn of [-1, 1]) { const o = 3 * v; pos[o] = x + _ctrS.x * w * sgn; pos[o + 1] = y + _ctrS.y * w * sgn; pos[o + 2] = z + _ctrS.z * w * sgn; uv[2 * v] = m; uv[2 * v + 1] = sgn; aa[v] = a; v++; } };
  for (let side = 0; side < 2 && tr.n > 1; side++) {
    let prevX = 0, prevY = 0, prevZ = 0, first = true, lastW = 0;
    for (let m = 0; m < tr.n; m++) {
      const i = (tr.head - tr.n + m + CTR_N) % CTR_N, age = t - tr.T[i]; if (age < 0 || age > CTR_LIFE) continue;
      const j = 3 * (2 * i + side); _ctrV.set(tr.P[j], tr.P[j + 1], tr.P[j + 2]).applyQuaternion(_ctrQ);
      const x = _ctrV.x + E[0] - O[0], y = _ctrV.y + E[1] - O[1], z = _ctrV.z + E[2] - O[2];
      if (first) { prevX = x; prevY = y; prevZ = z; }
      _ctrT.set(x - prevX, y - prevY, z - prevZ); if (_ctrT.lengthSq() < 1e-12) _ctrT.set(0, 0, 1);
      _ctrS.set(cam.x - x, cam.y - y, cam.z - z).cross(_ctrT).normalize(); // across the thread, facing the camera
      const w = (0.45 + 0.5 * age) * 0.001 * (0.6 + 0.4 * tr.K[i]); // m → km: a thread half a metre wide at the tip, a few metres wide as it ages
      const a = tr.K[i] * 0.55 * (1 - smoothstep((age - 4) / (CTR_LIFE - 4))) * Math.min(age / 0.3 + 0.2, 1);
      if (first) { pair(x, y, z, w, 0, m); first = false; } // (a clear pair at each end: the strip joins the other with nothing drawn between)
      pair(x, y, z, w, a, m); lastW = w;
      prevX = x; prevY = y; prevZ = z;
    }
    if (!first) pair(prevX, prevY, prevZ, lastW, 0, 0);
  }
  g.attributes.position.needsUpdate = true; g.attributes.aUV.needsUpdate = true; g.attributes.aA.needsUpdate = true;
  g.setDrawRange(0, Math.max(0, 6 * (v / 2 - 1))); tr.mesh.visible = v >= 4;
}
