// Page-side helpers for rendering Mission Studio to video (injected into the video build). Engine functions (vadd, vsub,
// vunit, sitePosEcl, localFrame, lvlh …) are globals of the engine script; app internals come from window.__ms.
(() => {
  const ms = window.__ms;
  const lerp = (a, b, f) => a + (b - a) * f;
  // monotone cubic interpolation through keys [[x, y], …] (Fritsch–Carlson): smooth, no overshoot
  function pchip(keys) {
    const n = keys.length, x = keys.map(k => k[0]), y = keys.map(k => k[1]);
    if (n === 1) return () => y[0];
    const h = [], d = []; for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
    const m = new Array(n);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
    return xx => {
      if (xx <= x[0]) return y[0] + m[0] * (xx - x[0]); if (xx >= x[n - 1]) return y[n - 1] + m[n - 1] * (xx - x[n - 1]);
      let i = 0; while (i < n - 2 && xx > x[i + 1]) i++;
      const t = (xx - x[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }
  // a parameter: a constant (number, string or vector), or keys [[τ, value], …] eased between (smootherstep per segment: at
  // rest at every key), or {pchip: keys} (smooth through the keys without stopping)
  const lerpV = (a, b, f) => Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * f) : a + (b - a) * f;
  function param(p) {
    if (p == null || typeof p === 'number' || typeof p === 'string' || typeof p === 'boolean') return () => p;
    if (p.pchip) return pchip(p.pchip);
    if (Array.isArray(p) && !Array.isArray(p[0])) return () => p; // a constant vector
    const keys = p; return tau => {
      if (tau <= keys[0][0]) return keys[0][1]; if (tau >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
      let i = 0; while (i < keys.length - 2 && tau > keys[i + 1][0]) i++;
      const f = (tau - keys[i][0]) / (keys[i + 1][0] - keys[i][0]), e = f * f * f * (f * (f * 6 - 15) + 10);
      return lerpV(keys[i][1], keys[i + 1][1], e);
    };
  }
  const evT = (md, name) => { const re = new RegExp(name, 'i'); const e = md.events.find(e => re.test(e.name)); if (!e) throw new Error('no event ' + name); return e.t; };
  const V = {};
  V.setup = (opts = {}) => {
    window.requestAnimationFrame = () => 0; // the app's own loop stops: frames are rendered on demand
    ms.STATE.playing = false; ms.STATE.auto = false;
    for (const k of ['paths', 'future', 'osc', 'orbits', 'labels', 'vectors', 'captions', 'burnin', 'guides', 'minimap']) ms.MV.layers[k] = false;
    document.getElementById('app').classList.add('hide-ui');
    for (const id of ['countdown', 'prop', 'caption']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    ms.setMode('chase'); ms.CAM.trans = null;
    ms.MV.layers.film = !!opts.film; ms.MV.filmGrain = opts.grain !== false; // the app's film look: bloom, highlight roll-off, vignette, grain
  };
  // prepare a scene: its time mapping and camera
  V.scene = spec => {
    const md = ms.MV.md, t0 = evT(md, spec.ev || 'Liftoff');
    V.spec = spec; V.tOf = pchip(spec.time.map(([tau, met]) => [tau, t0 + met])); V.t0ev = t0;
    const c = spec.cam || {}; V.cam = {}; for (const k in c) V.cam[k] = param(c[k]);
    ms.setTarget('obj:' + (typeof c.target === 'string' ? c.target : 'ship'), { force: true, keepMode: true }); ms.CAM.trans = null; ms.setMode('chase');
    ms.MV.layers.fill = spec.fill !== false;
    for (const cr of ms.MV.crafts) cr.qInit = false;
  };
  // the camera pose at τ (positions relative to P, the target, in km)
  function pose(P, t, tau) {
    const C = V.cam, type = C.type ? C.type(tau) : 'chase', tgt = ms.craftById(C.target ? C.target(tau) : 'ship');
    const up3 = (r) => vunit(r);
    if (type === 'chase') {
      const rr = tgt && tgt.s ? (tgt.rD || tgt.s.r) : P; const aimUp = C.aimUp ? C.aimUp(tau) : 0, aimFwd = C.aimFwd ? C.aimFwd(tau) : 0;
      let aim = aimUp ? vscale(vunit(rr), aimUp * 0.001) : null;
      if (aimFwd && tgt) { const y = new ms.THREE.Vector3(0, 1, 0).applyQuaternion(tgt.node.quaternion).toArray(); aim = vadd(aim || [0, 0, 0], vscale(y, aimFwd * 0.001)); } // along the vehicle's long axis
      let az = C.az(tau) * DEG;
      if (C.azSun && C.azSun(tau)) { const B = ms.poseFor('chase', { az: 0, el: 0, dist: 1 }, P, t).basis, sd = vunit(vscale(P, -1)); az += Math.atan2(vdot(sd, B[1]), vdot(sd, B[0])); } // az from the Sun's direction
      return ms.poseFor('chase', { az, el: C.el(tau) * DEG, dist: C.dist(tau) * 0.001, aim }, P, t);
    }
    if (type === 'ground') { // an observer on the ground, offset (km east, north, height) from the launch site or the runway
      const md = ms.MV.md, site = C.site ? C.site(tau) : 'launch';
      const S = site === 'runway' ? RUNWAYS[md.cfg.runway] : LAUNCH_SITES[md.cfg.site];
      const R0 = BODIES.earth.R, dE = C.e ? C.e(tau) : 0, dN = C.n ? C.n(tau) : 0, h = C.h ? C.h(tau) : 0.0018;
      const lat = S.lat + dN / R0 * RAD, lon = S.lon + dE / (R0 * Math.cos(S.lat * DEG)) * RAD;
      const sp = sitePosEcl('earth', lat, lon, (S.elev || 0) + h, t), E = ms.helio('earth', t).r, pos = vsub(vadd(E, sp), P), lf = localFrame('earth', sp, t);
      let look = [0, 0, 0];
      if (C.lookUp) look = vadd(look, vscale(up3(tgt && tgt.s ? (tgt.rD || tgt.s.r) : P), C.lookUp(tau) * 0.001));
      if (C.yaw) { // a fixed direction instead of the target: yaw from north through east, pitch above the horizon (degrees)
        const yw = C.yaw(tau) * DEG, pt = C.pitch(tau) * DEG, cp = Math.cos(pt);
        const d = vadd(vadd(vscale(lf.north, cp * Math.cos(yw)), vscale(lf.east, cp * Math.sin(yw))), vscale(lf.up, Math.sin(pt)));
        look = vadd(pos, d);
      }
      if (C.pan) { const f = C.pan(tau); look = vadd(vscale(look, 1 - f), vscale(vadd(pos, vscale(lf.up, 1)), f)); }
      return { pos, up: lf.up, look, center: false };
    }
    if (type === 'body' || type === 'lvlh') { // fixed to the target's body (its model axes: +Y nose, +Z top) or to its local orbital frame
      const off = C.off(tau), at = C.at ? C.at(tau) : [0, 0, 0], upv = C.up ? C.up(tau) : [0, 0, 1];
      let tx, ty, tz, base, src = tgt;
      // a target that does not exist yet (the telescope before its release): where it will be, offset (m, the ship's local
      // orbital frame) from the ship
      if (!(src && src.P && src.s) && C.before) src = null;
      const ship = ms.craftById('ship');
      if (type === 'body') { const q = (src || ship).node.quaternion; const T = ms.THREE; tx = new T.Vector3(1, 0, 0).applyQuaternion(q).toArray(); ty = new T.Vector3(0, 1, 0).applyQuaternion(q).toArray(); tz = new T.Vector3(0, 0, 1).applyQuaternion(q).toArray(); }
      else { const c = src || ship, F = lvlh(c.rD || c.s.r, c.vD || c.s.v); tx = F.x; ty = F.y; tz = F.z; }
      const B = v => vscale(vadd(vadd(vscale(tx, v[0]), vscale(ty, v[1])), vscale(tz, v[2])), 0.001);
      base = src ? vsub(src.P, P) : vadd(vsub(ship.P, P), B(C.before(tau)));
      if (src && C.aimDrawn && C.aimDrawn(tau)) base = vadd(base, drawnRef(src)); // the orbiter as drawn, not its state point
      return { pos: vadd(base, B(off)), up: vunit(B(upv)), look: vadd(base, B(at)), center: false };
    }
    throw new Error('camera type ' + type);
  }
  // where the orbiter's reference point is drawn, relative to its craft's position (km, scene axes): inside the launch stack
  // (which stands ahead of the stack's state) it is the orbiter turned half round on the tank's −Z side; on its own, its
  // model's origin. Last frame's transforms: the camera is placed before the crafts move (a frame's lag is invisible).
  function drawnRef(c) {
    const T = ms.THREE, m = c.cur; if (!m) return [0, 0, 0];
    const g = m.children[0]; let o = g;
    if (g && g.children.length > 3) o = g.children.find(x => Math.abs(x.rotation.y - Math.PI) < 1e-6 && Math.abs(x.position.z + 8.55) < 0.01) || g;
    c.node.updateMatrixWorld(true);
    const w = new T.Vector3().setFromMatrixPosition(o.matrixWorld).sub(c.node.position);
    return w.toArray();
  }
  // the lens that makes an object `size` m across fill `frac` of the frame's width from the camera's distance to it
  function fitLens(p, tau) {
    const C = V.cam; if (!C.fitSize) return;
    const d = vnorm(vsub(p.pos, p.fitAt || [0, 0, 0])) * 1000, frac = C.fitFrac ? C.fitFrac(tau) : 0.35;
    let L = 36 * d * frac / C.fitSize(tau); L = Math.min(Math.max(L, C.lensMin ? C.lensMin(tau) : 24), C.lensMax ? C.lensMax(tau) : 2400);
    if (Math.abs(ms.CAM.lens - L) > 1e-3) { ms.CAM.lens = L; ms.applyLens(); }
  }
  V.frame = (tau, fps, quality) => {
    const t = V.tOf(tau); ms.STATE.t = t; ms.MV.realDt = 1 / fps;
    const C = V.cam; if (C.lens) { const L = C.lens(tau); if (Math.abs(ms.CAM.lens - L) > 1e-3) { ms.CAM.lens = L; ms.applyLens(); } }
    ms.CAM.videoPose = (P, tt) => { const p = pose(P, tt, tau); fitLens(p, tau); return p; };
    ms.renderFrame(false);
    return quality ? ms.R.renderer.domElement.toDataURL('image/jpeg', quality) : null;
  };
  V.info = tau => { const t = V.tOf(tau), s = ms.craftById('ship').s; return { met: t - V.t0ev, alt: s ? vnorm(s.r) - BODIES.earth.R : null }; };
  V.ready = () => { const D = ms.DETAIL.ready; return D.orbiter !== undefined && D.shuttle_stack !== undefined; };
  window.__vid = V;
})();
