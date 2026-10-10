// ============================================================================
// integrator.js — Dormand–Prince 5(4) adaptive integrator with event location,
// cislunar n-body force model (geocentric: Earth + Moon + Sun), finite burns
// ============================================================================
const DP = {
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
  a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]],
  e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
};
function dopriStep(f, t, y, h, k1, ws) {
  const n = y.length; const K = ws.K; K[0].set(k1);
  const yt = ws.yt;
  for (let s = 1; s < 7; s++) {
    const as = DP.a[s];
    for (let i = 0; i < n; i++) { let acc = y[i]; for (let j = 0; j < s; j++) acc += h * as[j] * K[j][i]; yt[i] = acc; }
    f(t + DP.c[s] * h, yt, K[s]);
  }
  // 5th order solution = yt after stage 7 input (FSAL): y_new = y + h*sum(a7j*Kj) which is yt computed at s=6
  const ynew = ws.ynew; ynew.set(yt);
  const err = ws.err;
  for (let i = 0; i < n; i++) { let acc = 0; for (let j = 0; j < 7; j++) acc += DP.e[j] * K[j][i]; err[i] = h * acc; }
  return { ynew, k7: K[6], err };
}
function makeWS(n) { return { K: Array.from({ length: 7 }, () => new Float64Array(n)), yt: new Float64Array(n), ynew: new Float64Array(n), err: new Float64Array(n) }; }

// Hermite interpolation of state between two steps (positions use velocities; velocities use accelerations)
function hermiteState(t0, y0, f0, t1, y1, f1, t, n) {
  const h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = h00 * y0[i] + h10 * h * f0[i] + h01 * y1[i] + h11 * h * f1[i];
  return out;
}

// integrate y' = f(t,y) from t0 to t1. opts: {rtol, atol, hmax, hmin, events:[{g, dir, terminal, name}], store:true, h0}
function integrate(f, t0, y0, t1, opts = {}) {
  const n = y0.length, dirT = Math.sign(t1 - t0) || 1;
  const rtol = opts.rtol ?? 1e-10, atol = opts.atol ?? 1e-8, hmax = opts.hmax ?? Infinity, hmin = opts.hmin ?? 1e-6;
  const ws = makeWS(n);
  let t = t0, y = Float64Array.from(y0), k1 = new Float64Array(n); f(t, y, k1);
  let h = dirT * Math.min(Math.abs(opts.h0 ?? 10), hmax, Math.abs(t1 - t0) || 1);
  const out = { t: [t], y: [Float64Array.from(y)], f: [Float64Array.from(k1)], events: [], tEnd: t1, stopped: false };
  const evs = opts.events || [];
  let gPrev = evs.map(e => e.g(t, y));
  let steps = 0; const maxSteps = opts.maxSteps ?? 2e6;
  while (dirT * (t1 - t) > 1e-9 && steps++ < maxSteps) {
    if (Math.abs(h) > Math.abs(t1 - t)) h = t1 - t;
    const { ynew, k7, err } = dopriStep(f, t, y, h, k1, ws);
    let en = 0;
    for (let i = 0; i < n; i++) { const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(ynew[i])); const q = err[i] / sc; en += q * q; }
    en = Math.sqrt(en / n);
    if (en <= 1 || Math.abs(h) <= hmin) {
      const tn = t + h, yn = Float64Array.from(ynew), fn = Float64Array.from(k7);
      // events
      let stopAt = null;
      for (let e = 0; e < evs.length; e++) {
        const g1 = evs[e].g(tn, yn), g0 = gPrev[e];
        const crossed = (g0 < 0 && g1 >= 0 && evs[e].dir >= 0) || (g0 > 0 && g1 <= 0 && evs[e].dir <= 0);
        if (crossed) {
          let a = t, b = tn, ga = g0;
          for (let it = 0; it < 80; it++) {
            const m = 0.5 * (a + b); const ym = hermiteState(t, y, k1, tn, yn, fn, m, n); const gm = evs[e].g(m, ym);
            if ((ga < 0 && gm < 0) || (ga > 0 && gm > 0)) { a = m; ga = gm; } else b = m;
            if (Math.abs(b - a) < 1e-6) break;
          }
          const te = 0.5 * (a + b);
          // accurate state at event via one DP step from t
          const st = dopriStep(f, t, y, te - t, k1, makeWS(n));
          const ye = Float64Array.from(st.ynew); const fe = new Float64Array(n); f(te, ye, fe);
          const rec = { name: evs[e].name, t: te, y: ye, f: fe, idx: e };
          out.events.push(rec);
          if (evs[e].terminal && (!stopAt || dirT * (te - stopAt.t) < 0)) stopAt = rec;
        }
        gPrev[e] = g1;
      }
      if (stopAt) {
        out.t.push(stopAt.t); out.y.push(stopAt.y); out.f.push(stopAt.f);
        out.stopped = true; out.tEnd = stopAt.t; out.stopEvent = stopAt;
        return out;
      }
      t = tn; y = yn; k1 = fn;
      out.t.push(t); out.y.push(y); out.f.push(k1);
      const fac = en > 0 ? Math.min(5, Math.max(0.2, 0.9 * Math.pow(en, -0.2))) : 5;
      h = dirT * Math.min(Math.abs(h) * fac, hmax);
    } else {
      h = h * Math.max(0.1, 0.9 * Math.pow(en, -0.25));
    }
  }
  out.tEnd = t;
  return out;
}

// ---------------- cislunar dynamics (geocentric ECL) ----------------
// thrust spec: {T (N), mdot (kg/s), dir: function(t, r, v) -> unit vector}
const MU_E = BODIES.earth.mu, MU_M = BODIES.moon.mu, MU_S = BODIES.sun.mu;
function sunGeo(t) { const e = planetHelio('earth', t); return vscale(e.r, -1); }
function cislunarAccel(t, r) {
  const rn2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2], rn = Math.sqrt(rn2), k = -MU_E / (rn2 * rn);
  const ax = [k * r[0], k * r[1], k * r[2]];
  const rm = moonGeo(t).r;
  const d = [rm[0] - r[0], rm[1] - r[1], rm[2] - r[2]];
  const dn = vnorm(d), rmn = vnorm(rm);
  const km = MU_M / (dn * dn * dn), km2 = MU_M / (rmn * rmn * rmn);
  const rs = sunGeo(t);
  const ds = [rs[0] - r[0], rs[1] - r[1], rs[2] - r[2]];
  const dsn = vnorm(ds), rsn = vnorm(rs);
  const ks = MU_S / (dsn * dsn * dsn), ks2 = MU_S / (rsn * rsn * rsn);
  return [ax[0] + km * d[0] - km2 * rm[0] + ks * ds[0] - ks2 * rs[0],
    ax[1] + km * d[1] - km2 * rm[1] + ks * ds[1] - ks2 * rs[1],
    ax[2] + km * d[2] - km2 * rm[2] + ks * ds[2] - ks2 * rs[2]];
}
function makeCislunarODE(thrust) {
  return (t, y, out) => {
    const r = [y[0], y[1], y[2]];
    const a = cislunarAccel(t, r);
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
    if (thrust && y[6] > 1) {
      const u = thrust.dir(t, r, [y[3], y[4], y[5]]);
      const at = thrust.T / y[6] / 1000; // km/s^2
      out[3] = a[0] + at * u[0]; out[4] = a[1] + at * u[1]; out[5] = a[2] + at * u[2];
      out[6] = -thrust.mdot;
    } else { out[3] = a[0]; out[4] = a[1]; out[5] = a[2]; out[6] = 0; }
  };
}
// two-body ODE about a body (for local phases)
function makeTwoBodyODE(mu, thrust) {
  return (t, y, out) => {
    const rn2 = y[0] * y[0] + y[1] * y[1] + y[2] * y[2], rn = Math.sqrt(rn2), k = -mu / (rn2 * rn);
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
    let ax = k * y[0], ay = k * y[1], az = k * y[2];
    if (thrust && y[6] > 1) { const u = thrust.dir(t, [y[0], y[1], y[2]], [y[3], y[4], y[5]]); const at = thrust.T / y[6] / 1000; ax += at * u[0]; ay += at * u[1]; az += at * u[2]; out[6] = -thrust.mdot; } else out[6] = 0;
    out[3] = ax; out[4] = ay; out[5] = az;
  };
}
// selenocentric relative state from geocentric state
function geoToSeleno(t, r, v) { const m = moonGeo(t); return { r: vsub(r, m.r), v: vsub(v, m.v) }; }
