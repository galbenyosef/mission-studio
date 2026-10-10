// ============================================================================
// kepler.js — two-body mechanics: Stumpff, universal-variable propagation,
// orbital elements, Lambert solver, hyperbola / B-plane helpers
// ============================================================================
function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.cosh(s) - 1) / (-z); }
  return 0.5 - z / 24 + z * z / 720;
}
function stumpffS(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}
// universal-variable Kepler propagation; returns {r, v}
function kepProp(r0, v0, dt, mu) {
  if (dt === 0) return { r: vcopy(r0), v: vcopy(v0) };
  const r0n = vnorm(r0), v0n2 = vdot(v0, v0), smu = Math.sqrt(mu);
  const vr0 = vdot(r0, v0) / r0n;
  const alpha = 2 / r0n - v0n2 / mu;
  // reduce dt modulo period for ellipses
  if (alpha > 1e-12) {
    const P = TAU / Math.sqrt(mu * alpha * alpha * alpha);
    if (Math.abs(dt) > P) dt = dt % P;
  }
  const A = r0n * vr0 / smu, B = 1 - alpha * r0n;
  const F = x => { const z = alpha * x * x; return A * x * x * stumpffC(z) + B * x * x * x * stumpffS(z) + r0n * x - smu * dt; };
  const Fp = x => { const z = alpha * x * x; return A * x * (1 - z * stumpffS(z)) + B * x * x * stumpffC(z) + r0n; };
  // bracket (F is monotonic increasing in x since F' = r > 0)
  let x = alpha > 1e-12 ? smu * alpha * dt : Math.sign(dt) * Math.sqrt(Math.abs(dt)) * 10;
  if (alpha < -1e-12) {
    const a = 1 / alpha, sgn = Math.sign(dt);
    const arg = (-2 * mu * alpha * dt) / (vdot(r0, v0) + sgn * Math.sqrt(-mu * a) * (1 - r0n * alpha));
    if (arg > 0) x = sgn * Math.sqrt(-a) * Math.log(arg);
  }
  let lo = Math.min(0, x), hi = Math.max(0, x);
  let flo = F(lo), fhi = F(hi), guard = 0;
  while (flo > 0 && guard++ < 200) { lo = lo * 2 - 1; flo = F(lo); }
  guard = 0;
  while (fhi < 0 && guard++ < 200) { hi = hi * 2 + 1; fhi = F(hi); }
  if (!(x > lo && x < hi)) x = 0.5 * (lo + hi);
  for (let k = 0; k < 200; k++) {
    const f = F(x);
    if (Math.abs(f) < 1e-9 * Math.max(1, smu * Math.abs(dt)) * 1e-3) break;
    if (f > 0) hi = x; else lo = x;
    let xn = x - f / Fp(x);
    if (!(xn > lo && xn < hi) || !isFinite(xn)) xn = 0.5 * (lo + hi);
    if (Math.abs(xn - x) < 1e-13 * Math.max(1, Math.abs(x))) { x = xn; break; }
    x = xn;
  }
  const z = alpha * x * x, Cz = stumpffC(z), Sz = stumpffS(z);
  const f = 1 - x * x / r0n * Cz, g = dt - x * x * x / smu * Sz;
  const r = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]];
  const rn = vnorm(r);
  const fd = smu / (rn * r0n) * (alpha * x * x * x * Sz - x), gd = 1 - x * x / rn * Cz;
  return { r, v: [fd * r0[0] + gd * v0[0], fd * r0[1] + gd * v0[1], fd * r0[2] + gd * v0[2]] };
}
// classical elements from state
function rv2coe(r, v, mu) {
  const rn = vnorm(r), vn = vnorm(v);
  const h = vcross(r, v), hn = vnorm(h);
  const i = Math.acos(clamp(h[2] / hn, -1, 1));
  const N = [-h[1], h[0], 0], Nn = vnorm(N);
  const vr = vdot(r, v) / rn;
  const evec = vscale(vsub(vscale(r, vn * vn - mu / rn), vscale(v, rn * vr)), 1 / mu);
  const e = vnorm(evec);
  const energy = vn * vn / 2 - mu / rn;
  const a = Math.abs(energy) > 1e-12 ? -mu / (2 * energy) : Infinity;
  let Om = Nn > 1e-10 ? Math.acos(clamp(N[0] / Nn, -1, 1)) : 0; if (N[1] < 0) Om = TAU - Om;
  let w = 0;
  if (Nn > 1e-10 && e > 1e-10) { w = Math.acos(clamp(vdot(N, evec) / (Nn * e), -1, 1)); if (evec[2] < 0) w = TAU - w; }
  else if (e > 1e-10) { w = Math.atan2(evec[1], evec[0]); if (h[2] < 0) w = TAU - w; }
  let nu;
  if (e > 1e-10) { nu = Math.acos(clamp(vdot(evec, r) / (e * rn), -1, 1)); if (vr < 0) nu = TAU - nu; }
  else { const ref = Nn > 1e-10 ? N : [1, 0, 0]; nu = Math.acos(clamp(vdot(ref, r) / (vnorm(ref) * rn), -1, 1)); if (vdot(vcross(ref, r), h) < 0) nu = TAU - nu; }
  const p = hn * hn / mu;
  const rp = p / (1 + e), ra = e < 1 ? p / (1 - e) : Infinity;
  const period = e < 1 ? TAU * Math.sqrt(a * a * a / mu) : Infinity;
  const vinf = energy > 0 ? Math.sqrt(2 * energy) : 0;
  return { a, e, i, Om, w, nu, h, hn, evec, energy, rp, ra, p, period, vinf, C3: 2 * energy };
}
// state from elements (true anomaly)
function coe2rv(p, e, i, Om, w, nu, mu) {
  const r = p / (1 + e * Math.cos(nu));
  const xp = r * Math.cos(nu), yp = r * Math.sin(nu);
  const vxp = -Math.sqrt(mu / p) * Math.sin(nu), vyp = Math.sqrt(mu / p) * (e + Math.cos(nu));
  const cO = Math.cos(Om), sO = Math.sin(Om), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), si = Math.sin(i);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
  const Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
  return { r: vadd(vscale(P, xp), vscale(Q, yp)), v: vadd(vscale(P, vxp), vscale(Q, vyp)) };
}
// time from periapsis to true anomaly nu (ellipse or hyperbola)
function timeSincePeri(e, a, nu, mu) {
  if (e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    const M = E - e * Math.sin(E);
    return M * Math.sqrt(a * a * a / mu);
  }
  const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
  const M = e * Math.sinh(F) - F;
  return M * Math.sqrt(-a * a * a / mu);
}
// Lambert (universal variables, bisection).  href: reference normal for prograde sense.
function lambert(r1, r2, tof, mu, href = [0, 0, 1], longWay = false) {
  const r1n = vnorm(r1), r2n = vnorm(r2);
  const cdn = clamp(vdot(r1, r2) / (r1n * r2n), -1, 1);
  let dnu = Math.acos(cdn);
  const cz = vdot(vcross(r1, r2), href);
  if (cz < 0) dnu = TAU - dnu;
  if (longWay) dnu = TAU - dnu;
  const A = Math.sin(dnu) * Math.sqrt(r1n * r2n / (1 - Math.cos(dnu)));
  if (!isFinite(A) || Math.abs(A) < 1e-9) return null;
  const smu = Math.sqrt(mu);
  const yOf = z => r1n + r2n + A * (z * stumpffS(z) - 1) / Math.sqrt(stumpffC(z));
  const tOf = z => { const y = yOf(z); if (y < 0) return -1; const C = stumpffC(z), S = stumpffS(z); const x = Math.sqrt(y / C); return (x * x * x * S + A * Math.sqrt(y)) / smu; };
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI * 0.999999;
  let g = 0; while (tOf(lo) > tof && g++ < 60) lo *= 2;
  let z = 0;
  for (let k = 0; k < 200; k++) {
    z = 0.5 * (lo + hi);
    const tz = tOf(z);
    if (tz <= tof) lo = z; else hi = z;
    if (hi - lo < 1e-13) break;
  }
  const y = yOf(z);
  if (!(y > 0)) return null;
  const f = 1 - y / r1n, gg = A * Math.sqrt(y / mu), gd = 1 - y / r2n;
  const v1 = vscale(vsub(r2, vscale(r1, f)), 1 / gg);
  const v2 = vscale(vsub(vscale(r2, gd), r1), 1 / gg);
  return { v1, v2, dnu };
}
// hyperbola: periapsis radius from v_inf and impact parameter |B|, and inverse
const bFromRp = (rp, vinf, mu) => rp * Math.sqrt(1 + 2 * mu / (rp * vinf * vinf));
const rpFromB = (b, vinf, mu) => { const q = mu / (vinf * vinf); return -q + Math.sqrt(q * q + b * b); };
// B-plane frame: S = v_inf unit (incoming), T = S x k_ref, R = S x T
function bPlaneFrame(S, kref = [0, 0, 1]) {
  let T = vcross(S, kref); if (vnorm(T) < 1e-8) T = vperp(S);
  T = vunit(T); const R = vcross(S, T); return { S, T, R };
}
// B-vector for an incoming relative state (r,v) about body mu
function bVector(r, v, mu) {
  const el = rv2coe(r, v, mu);
  if (el.e <= 1) return null;
  const vinf = Math.sqrt(2 * el.energy);
  const ehat = vscale(el.evec, 1 / el.e), hhat = vscale(el.h, 1 / el.hn);
  const cosT = -1 / el.e, sinT = Math.sqrt(1 - cosT * cosT); // true anomaly of asymptote
  // incoming asymptote direction S: velocity direction at nu → -nu_inf
  const pvec = vcross(hhat, ehat);
  const S = vunit(vadd(vscale(ehat, cosT), vscale(pvec, -sinT))).map(x => -x); // pointing along incoming velocity
  // B vector: perpendicular to S, in orbit plane, B x S ∥ h? (h = B x v_inf)
  const b = -el.a * Math.sqrt(el.e * el.e - 1);
  const Bdir = vunit(vcross(S, hhat));
  return { B: vscale(Bdir, b), S, vinf, b, el };
}
// build hyperbolic/elliptic state at periapsis given plane normal hhat, periapsis direction, rp, and C3/energy
function periapsisState(phat, hhat, rp, vp) { return { r: vscale(phat, rp), v: vscale(vunit(vcross(hhat, phat)), vp) }; }
// departure hyperbola geometry: given outgoing v_inf vector and plane normal (must be ⊥ vinf),
// return periapsis direction and periapsis speed
function departureHyperbola(vinfVec, hhat, rp, mu) {
  const vinf = vnorm(vinfVec), e = 1 + rp * vinf * vinf / mu;
  const thInf = Math.acos(-1 / e);
  const S = vunit(vinfVec);
  // periapsis direction: rotate asymptote direction backwards by thInf about h
  const phat = vunit(vrot(S, hhat, -thInf));
  const vp = Math.sqrt(vinf * vinf + 2 * mu / rp);
  return { phat, vp, e, thInf };
}
// arrival hyperbola: incoming v_inf vector, plane normal, periapsis radius
function arrivalHyperbola(vinfVec, hhat, rp, mu) {
  const vinf = vnorm(vinfVec), e = 1 + rp * vinf * vinf / mu;
  const thInf = Math.acos(-1 / e);
  const S = vunit(vinfVec);
  // incoming asymptote direction (pointing from craft toward motion) = S; periapsis reached after turning
  // position direction at -thInf is -S (craft comes from far away opposite to S)
  const phat = vunit(vrot(vscale(S, -1), hhat, thInf));
  const vp = Math.sqrt(vinf * vinf + 2 * mu / rp);
  return { phat, vp, e, thInf };
}
