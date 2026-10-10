// ============================================================================
// Surface: craft standing exactly on the ground that is drawn (the flat facets of the
// high-resolution surface patch), contact shadows, and a rover that drives after landing
// (first drive as flown, then illustrative daily commutes) leaving wheel tracks.
// ============================================================================
const _qG = new THREE.Quaternion(), _vG = new THREE.Vector3(), _rayG = new THREE.Ray(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _td = new THREE.Vector3(), _hitG = new THREE.Vector3();
// d: unit direction [x, y, z] in the planet mesh's own frame → point on the drawn ground (planet-radius units), or null outside the patches
function capHitLocal(body, d) {
  for (const ci of MV.capInfo) {
    if (ci.body !== body || !ci.mesh) continue;
    const C = ci.mesh.geometry.userData.center, G = ci.mesh.geometry.userData.grid; if (!G) continue;
    if (d[0] * C[0] + d[1] * C[1] + d[2] * C[2] < Math.cos(ci.ang * DEG)) continue;
    let phi = Math.atan2(d[2], -d[0]); while (phi < G.phiStart) phi += TAU; while (phi >= G.phiStart + TAU) phi -= TAU;
    const fx = (phi - G.phiStart) / G.phiLength * G.seg, fy = (Math.acos(clamp(d[1], -1, 1)) - G.thetaStart) / G.thetaLength * G.seg;
    if (fx < 0 || fy < 0 || fx >= G.seg || fy >= G.seg) continue;
    const ix = Math.floor(fx), iy = Math.floor(fy), W = G.seg + 1, P = ci.mesh.geometry.attributes.position;
    _ta.fromBufferAttribute(P, iy * W + ix + 1); _tb.fromBufferAttribute(P, iy * W + ix); _tc.fromBufferAttribute(P, (iy + 1) * W + ix); _td.fromBufferAttribute(P, (iy + 1) * W + ix + 1);
    _rayG.origin.set(-C[0], -C[1], -C[2]); _rayG.direction.set(d[0], d[1], d[2]);
    if (_rayG.intersectTriangle(_ta, _tb, _td, false, _hitG) || _rayG.intersectTriangle(_tb, _tc, _td, false, _hitG)) return [_hitG.x + C[0], _hitG.y + C[1], _hitG.z + C[2]];
  }
  return null;
}
const meshDir = (lat, lon) => { const cl = Math.cos(lat * DEG); return [cl * Math.cos(lon * DEG), Math.sin(lat * DEG), -cl * Math.sin(lon * DEG)]; };
const meshEN = (lat, lon) => { const cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG), co = Math.cos(lon * DEG), so = Math.sin(lon * DEG); return { E: [-so, 0, -co], N: [-sl * co, cl, sl * so] }; };
// mesh-frame vector → ecliptic (body-relative) at time t
function meshToEcl(body, v, t) { bodyQuat(body, t, _qG); _vG.set(v[0], v[1], v[2]).applyQuaternion(_qG); return [_vG.x, _vG.y, _vG.z]; }
function eclToMesh(body, v, t) { bodyQuat(body, t, _qG); _vG.set(v[0], v[1], v[2]).applyQuaternion(_qG.invert()); return [_vG.x, _vG.y, _vG.z]; }

// ---------------- rover drive plan ----------------
function buildTraverse(md) {
  md.trav = null;
  const rc = md.cfg.rover; const o = md.ship; if (!rc || !o) return;
  const seg = o.segs[o.segs.length - 1]; if (!seg || seg.type !== 'surface' || seg.ref !== (rc.body || 'mars')) return;
  const body = seg.ref, SOL = body === 'mars' ? 88775.244 : 86400, tL = seg.t0;
  const sunEl = t => { const r = sitePosEcl(body, seg.lat, seg.lon, 0, t); const B = planetHelio(body, t).r; return vdot(vunit(r), vunit(vscale(vadd(B, r), -1))); };
  const noon = n => { let best = -2, bt = tL + n * SOL; for (let k = -24; k <= 24; k++) { const tt = tL + n * SOL + k * SOL / 48; const e = sunEl(tt); if (e > best) { best = e; bt = tt; } } return bt; };
  const top = rc.top || 0.042, avg = rc.avg || 0.03, turnRate = 2.5 * DEG; // m/s, m/s, rad/s
  let e = 0, n = 0, h = (rc.heading || 0) * DEG, odo = 0, wodo = 0;
  const moves = [], events = [];
  for (const dv of rc.drives || []) {
    const t0 = noon(dv.sol) - 0.6 * 3600; if (t0 > seg.t1 - 600) break;
    let t = t0; const list = dv.moves || [['turn', dv.turn || 0], ['fwd', dv.dist || 0]]; const odo0 = odo; let dist = 0;
    for (const [kind, val] of list) {
      if (kind === 'turn') { if (!val) continue; const dh = val * DEG, dur = Math.abs(dh) / turnRate; moves.push({ kind, t0: t, t1: t + dur, e, n, h0: h, h1: h + dh, odo, wodo }); h += dh; t += dur; }
      else { const sgn = kind === 'back' ? -1 : 1, v = dv.moves ? top : avg, dur = val / v; moves.push({ kind, t0: t, t1: t + dur, e, n, h0: h, h1: h, sgn, d: val, v, odo, wodo }); e += sgn * val * Math.sin(h); n += sgn * val * Math.cos(h); odo += val; wodo += sgn * val; dist += val; t += dur; }
      t += dv.pause || 0;
    }
    events.push({ t: t0, obj: o.id, name: dv.name || `Drive — ${fx(dist, 0)} m`, desc: dv.desc || `Illustrative commute (the real route is not modelled): ${fx(dist, 0)} m at up to ${fx(top * 100, 1)} cm/s, stopping to check for hazards. Odometer ${fx(odo, 0)} m.`, kind: 'drive', met: t0 - md.M.t0, odo0, drive: true });
  }
  if (!moves.length) return;
  md.trav = { body, seg, moves, sol: SOL, tL, end: { e, n, h, odo }, h0: (rc.heading || 0) * DEG, top };
  for (const ev of events) md.events.push(ev);
  md.events.sort((a, b) => a.t - b.t);
}
function roverPose(md, t) { // e, n (m east/north of the landing spot), heading h (rad, clockwise from north), speed v (m/s), odometer
  const T = md.trav; const M = T.moves;
  let p = { e: 0, n: 0, h: T.h0, v: 0, odo: 0, wodo: 0, driving: false, kind: null };
  for (const m of M) {
    if (t < m.t0) return p;
    const f = clamp((t - m.t0) / Math.max(m.t1 - m.t0, 1e-6), 0, 1);
    if (m.kind === 'turn') p = { e: m.e, n: m.n, h: m.h0 + (m.h1 - m.h0) * f, v: 0, odo: m.odo, wodo: m.wodo, driving: f < 1, kind: 'turn' };
    else { const s = m.d * f; p = { e: m.e + m.sgn * s * Math.sin(m.h0), n: m.n + m.sgn * s * Math.cos(m.h0), h: m.h0, v: f < 1 ? m.sgn * m.v : 0, odo: m.odo + s, wodo: m.wodo + m.sgn * s, driving: f < 1, kind: m.kind }; }
    if (t < m.t1) return p;
  }
  return p;
}
// ---------------- placing landed craft on the drawn ground ----------------
// called from computeCraft for any state on a surface (not the launch pad)
function groundCraft(c, s, t) {
  const md = MV.md, body = s.ref, b = R.bodies[body]; if (!b) return;
  let dLoc, fwd = null;
  const T = md.trav;
  if (T && c.o.id === 'ship' && s.seg === T.seg && body === T.body) {
    const p = roverPose(md, t); const C = meshDir(T.seg.lat, T.seg.lon), { E, N } = meshEN(T.seg.lat, T.seg.lon); const k = 0.001 / b.R;
    dLoc = vunit([C[0] + (p.e * E[0] + p.n * N[0]) * k, C[1] + (p.e * E[1] + p.n * N[1]) * k, C[2] + (p.e * E[2] + p.n * N[2]) * k]);
    fwd = meshToEcl(body, [Math.sin(p.h) * E[0] + Math.cos(p.h) * N[0], Math.sin(p.h) * E[1] + Math.cos(p.h) * N[1], Math.sin(p.h) * E[2] + Math.cos(p.h) * N[2]], t);
    s.rover = p; s.extra = { ...(s.extra || {}), phase: p.driving ? (p.kind === 'turn' ? 'driving — turning in place' : 'driving') : 'on surface' };
  } else dLoc = vunit(eclToMesh(body, s.r, t));
  const hit = capHitLocal(body, dLoc);
  const rad = hit ? Math.hypot(hit[0], hit[1], hit[2]) * b.R : vnorm(s.r);
  const up = meshToEcl(body, dLoc, t);
  s.r = vscale(up, rad + 0.00002); // 2 cm: wheels and footpads touch the drawn ground
  const w = bodyOmegaEcl(body, t); s.v = vcross(w, s.r);
  if (fwd) { s.hdg = fwd; if (s.rover.v) s.v = vadd(s.v, vscale(fwd, s.rover.v * 0.001)); }
  else { const lf = localFrame(body, s.r, t); s.hdg = lf.north; } // body-fixed heading: a lander does not slowly spin as the planet turns
}
// ---------------- wheel tracks ----------------
function buildTracks(md) {
  if (MV.tracks) { MV.tracks.parent && MV.tracks.parent.remove(MV.tracks); MV.tracks.geometry.dispose(); MV.tracks = null; }
  const T = md.trav; if (!T) return; const b = R.bodies[T.body]; if (!b) return;
  const C = meshDir(T.seg.lat, T.seg.lon), { E, N } = meshEN(T.seg.lat, T.seg.lon), k = 0.001 / b.R;
  const ground = (e, n, lift) => { const d = vunit([C[0] + (e * E[0] + n * N[0]) * k, C[1] + (e * E[1] + n * N[1]) * k, C[2] + (e * E[2] + n * N[2]) * k]); const hit = capHitLocal(T.body, d); const r = hit ? Math.hypot(...hit) : 1; return vscale(d, r + lift * k); };
  const P0 = ground(0, 0, 0); const pos = [], od = [], ax = [], idx = []; const half = 1.25, wTr = 0.2; // wheel lines ±1.25 m, tracks 0.4 m wide
  for (const m of T.moves) {
    if (m.kind === 'turn') continue;
    const steps = Math.max(2, Math.ceil(m.d / 0.5)); const sh = Math.sin(m.h0), ch = Math.cos(m.h0);
    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= steps; i++) {
        const s = m.d * i / steps, ce = m.e + m.sgn * s * sh, cn = m.n + m.sgn * s * ch;
        for (const off of [-wTr, wTr]) { const lat = side * half + off; const pe = ce + lat * ch, pn = cn - lat * sh; const g = ground(pe, pn, 0.03); pos.push(g[0] - P0[0], g[1] - P0[1], g[2] - P0[2]); od.push(m.odo + s); ax.push(off > 0 ? 1 : -1); }
      }
      for (let i = 0; i < steps; i++) { const a = base + 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('aOdo', new THREE.BufferAttribute(new Float32Array(od), 1)); g.setAttribute('aX', new THREE.BufferAttribute(new Float32Array(ax), 1)); g.setIndex(idx);
  const mt = new THREE.ShaderMaterial({ vertexShader: `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aOdo; attribute float aX; varying float vOdo; varying float vX;
void main(){ vOdo = aOdo; vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}`, fragmentShader: `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOdo; uniform vec3 uCol; varying float vOdo; varying float vX;
void main(){
  #include <logdepthbuf_fragment>
  if (vOdo > uOdo) discard;
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vX));                 // soft rims of the rut
  float f = fract((vOdo + abs(vX) * 0.05) / 0.068);                 // chevron grouser prints
  float tread = mix(0.55, 1.0, smoothstep(0.2, 0.45, abs(f - 0.5)));
  float fw = clamp(fwidth(vOdo) / 0.068 * 1.5, 0.0, 1.0);            // fade the pattern where it would alias
  gl_FragColor = vec4(uCol, 0.36 * edge * mix(tread, 0.78, fw));
}`, uniforms: { uOdo: { value: 0 }, uCol: { value: new THREE.Color('#3b2416') } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(g, mt); mesh.position.set(P0[0], P0[1], P0[2]); mesh.frustumCulled = false; mesh.renderOrder = 2;
  b.mesh.add(mesh); MV.tracks = mesh;
}
// ---------------- contact shadow under landed craft ----------------
const GLSL_SHADOW_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uHalf; varying vec2 vXZ;
void main(){ vXZ = position.xz * uHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}`;
const GLSL_SHADOW_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uR; uniform float uLen; uniform float uK; uniform float uAO; uniform vec2 uW[8]; uniform int uNW; uniform float uWR; varying vec2 vXZ;
void main(){
  #include <logdepthbuf_fragment>
  float zc = clamp(vXZ.y, -uLen, 0.0); float d = length(vec2(vXZ.x, vXZ.y - zc));
  float sun = (1.0 - smoothstep(uR * 0.5, uR * 1.2, d)) * uK * (1.0 - 0.45 * clamp(-zc / max(uLen, 1e-3), 0.0, 1.0));
  float ao = (1.0 - smoothstep(uR * 0.3, uR * 1.25, length(vXZ))) * uAO;
  float wc = 0.0; // dark contact patch where each wheel presses into the soil
  for (int i = 0; i < 8; i++) { if (i >= uNW) break; wc = max(wc, 1.0 - smoothstep(uWR * 0.35, uWR * 1.7, length(vXZ - uW[i]))); }
  float a = max(max(sun, ao), wc * 0.55); if (a < 0.01) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;
const _sx = new THREE.Vector3(), _sz = new THREE.Vector3(), _sw = new THREE.Vector3();
function updateShadows(t) {
  for (const c of MV.crafts) {
    const s = c.s; const on = s && s.surface && !s.pad && s.ref !== 'earth' && c.node.visible && c.cur;
    if (!on) { if (c.shadow) c.shadow.visible = false; continue; }
    if (!c.shadow) {
      const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({ vertexShader: GLSL_SHADOW_V, fragmentShader: GLSL_SHADOW_F, uniforms: { uHalf: { value: 1 }, uR: { value: 1 }, uLen: { value: 0 }, uK: { value: 0 }, uAO: { value: 0.3 }, uW: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) }, uNW: { value: 0 }, uWR: { value: 0.3 } }, transparent: true, depthWrite: false });
      c.shadow = new THREE.Mesh(g, m); c.shadow.frustumCulled = false; c.shadow.renderOrder = 2; R.scene.add(c.shadow);
    }
    const sh = c.shadow, U = sh.material.uniforms, bb = c.cur.userData.bbox || { w: 3, h: 2, d: 3 };
    const up = vunit(s.r); const sunD = vunit(vscale(c.P, -1)); const el = vdot(sunD, up);
    let hz = vsub(sunD, vscale(up, el)); if (vnorm(hz) < 1e-6) hz = vperp(up); hz = vunit(hz);
    const rFoot = 0.42 * Math.max(bb.w, bb.d), hgt = bb.h; const len = el > 0.02 ? Math.min(hgt * 0.75 / Math.tan(Math.asin(clamp(el, -1, 1))), hgt * 7) : 0;
    const half = len + rFoot * 1.3;
    U.uHalf.value = half; U.uR.value = rFoot; U.uLen.value = len; U.uK.value = clamp(el * 4, 0, 1) * 0.74; U.uAO.value = 0.5; // sunlit Mars soil is mostly direct light: shadows are dark
    const O = R.O; const p = vadd(c.P, vscale(up, (0.03 + half * 0.0006) * 0.001));
    sh.position.set(p[0] - O[0], p[1] - O[1], p[2] - O[2]); basisQuat(up, hz, sh.quaternion); sh.scale.setScalar(half * 0.001);
    const wl = c.cur.userData.wheels; U.uNW.value = 0;
    if (wl && wl.length) { // wheel contact points in the shadow plane's own x/z (metres)
      c.node.updateMatrixWorld(true); _sx.set(1, 0, 0).applyQuaternion(sh.quaternion); _sz.set(0, 0, 1).applyQuaternion(sh.quaternion);
      const n = Math.min(8, wl.length); for (let i = 0; i < n; i++) { wl[i].getWorldPosition(_sw).sub(sh.position); U.uW.value[i].set(_sw.dot(_sx) * 1000, _sw.dot(_sz) * 1000); }
      U.uNW.value = n; U.uWR.value = wl[0].userData.wheel * wl[0].getWorldScale(_sw).x * 1000 * 1.25;
    }
    sh.visible = camDistTo(sh.position) < 3;
  }
}
function updateTracks(t) {
  const T = MV.md && MV.md.trav, m = MV.tracks; if (!T || !m) return;
  const p = roverPose(MV.md, t); m.material.uniforms.uOdo.value = t < T.seg.t0 ? -1 : p.odo;
  m.visible = camDistTo(m.getWorldPosition(_vG)) < 6;
}
