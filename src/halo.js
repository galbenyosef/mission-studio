// ============================================================================
// halo.js — the Sun–Earth L2 point and a halo orbit about it (James Webb)
//   seRot(t): the Sun–Earth rotating frame; l2Point(t): where L2 is
//   haloCR3BP(az): a periodic halo in the circular restricted three-body problem (Richardson's third-order
//     approximation, then differential correction); haloRef(t, …): that orbit laid into the real ephemeris
//   haloStableDir / manifoldBranch: the halo's stable manifold, the branch of it that comes down to the Earth
//   planHalo(cfg): the transfer designed as that branch (launch plane, perigee, timing), then the launch, the injection
//     onto it, the corrections, the insertion and the station-keeping, all tracking the branch as reference
// ============================================================================
// the mass parameter of the Sun–(Earth+Moon) problem; the Earth and Moon together stand at the Earth's place
const MU_SE = (BODIES.earth.mu + BODIES.moon.mu) / (BODIES.sun.mu + BODIES.earth.mu + BODIES.moon.mu);
// The Sun–Earth rotating frame: x̂ from the Sun through the Earth (on toward L2), ẑ the normal of the Earth's orbit, ŷ
// completing it. Row-major, columns x̂ ŷ ẑ — the layout of emRot (app/40_missionview.js), so the two frames share code.
function seRot(t) {
  const e = planetHelio('earth', t), x = vunit(e.r), z = vunit(vcross(e.r, e.v)), y = vcross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
// the Earth's mean motion about the Sun (rad/s): the sidereal year. (The instantaneous rate swings 7 % between perihelion
// and aphelion; the reference orbit keeps the mean, so its phase comes round exactly once a period.)
const SE_N = TAU / (365.25636 * 86400);
function seOmega() { return SE_N; }
// γ: the distance of L2 from the Earth in units of the Sun–Earth distance, the root of the quintic
function l2Gamma() {
  if (l2Gamma.v) return l2Gamma.v;
  const mu = MU_SE; let g = Math.cbrt(mu / 3);
  for (let k = 0; k < 50; k++) {
    const f = g ** 5 + (3 - mu) * g ** 4 + (3 - 2 * mu) * g ** 3 - mu * g * g - 2 * mu * g - mu;
    const df = 5 * g ** 4 + 4 * (3 - mu) * g ** 3 + 3 * (3 - 2 * mu) * g * g - 2 * mu * g - 2 * mu;
    const d = f / df; g -= d; if (Math.abs(d) < 1e-15) break;
  }
  return (l2Gamma.v = g);
}
// L2 now, geocentric ecliptic km: on the anti-Sun line, γ of the Earth's distance out
function l2Point(t) { const e = planetHelio('earth', t); return vscale(vunit(e.r), l2Gamma() * vnorm(e.r)); }
// ---------------- the circular restricted three-body problem ----------------
// Rotating frame, origin the barycentre, x toward the Earth (at 1 − μ), unit length the Sun–Earth distance, unit time
// 1/n (so a year is 2π). y: [x, y, z, ẋ, ẏ, ż] and, for the state transition matrix, 36 more.
function cr3bpODE(mu, withSTM) {
  return (t, y, out) => {
    const x = y[0], yy = y[1], z = y[2], vx = y[3], vy = y[4], vz = y[5];
    const x1 = x + mu, x2 = x - 1 + mu, r1s = x1 * x1 + yy * yy + z * z, r2s = x2 * x2 + yy * yy + z * z;
    const r13 = Math.pow(r1s, -1.5), r23 = Math.pow(r2s, -1.5), m1 = 1 - mu, m2 = mu;
    out[0] = vx; out[1] = vy; out[2] = vz;
    out[3] = 2 * vy + x - m1 * x1 * r13 - m2 * x2 * r23;
    out[4] = -2 * vx + yy - m1 * yy * r13 - m2 * yy * r23;
    out[5] = -m1 * z * r13 - m2 * z * r23;
    if (!withSTM) return;
    const r15 = r13 / r1s, r25 = r23 / r2s;
    const Uxx = 1 - m1 * r13 - m2 * r23 + 3 * m1 * x1 * x1 * r15 + 3 * m2 * x2 * x2 * r25;
    const Uyy = 1 - m1 * r13 - m2 * r23 + 3 * m1 * yy * yy * r15 + 3 * m2 * yy * yy * r25;
    const Uzz = -m1 * r13 - m2 * r23 + 3 * m1 * z * z * r15 + 3 * m2 * z * z * r25;
    const Uxy = 3 * m1 * x1 * yy * r15 + 3 * m2 * x2 * yy * r25, Uxz = 3 * m1 * x1 * z * r15 + 3 * m2 * x2 * z * r25, Uyz = 3 * m1 * yy * z * r15 + 3 * m2 * yy * z * r25;
    // A = [[0, I], [U, 2Ω]] with Ω the rotation; Φ̇ = A Φ, Φ stored row-major from index 6
    const A = [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [Uxx, Uxy, Uxz, 0, 2, 0], [Uxy, Uyy, Uyz, -2, 0, 0], [Uxz, Uyz, Uzz, 0, 0, 0]];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let s = 0; for (let k = 0; k < 6; k++) s += A[i][k] * y[6 + 6 * k + j]; out[6 + 6 * i + j] = s; }
  };
}
// Richardson's third-order approximation of a halo about L2 (1980), lengths in units of γ about L2, time in units of
// 1/n: the state at τ₁ = 0 (the x–z plane crossing nearest the Earth), the frequency ω and the period
function richardsonHalo(mu, gam, azU, n = 1) {
  const c = k => (Math.pow(-1, k) * mu + Math.pow(-1, k) * (1 - mu) * Math.pow(gam, k + 1) / Math.pow(1 + gam, k + 1)) / (gam * gam * gam);
  const c2 = c(2), c3 = c(3), c4 = c(4);
  const lam = Math.sqrt(((2 - c2) + Math.sqrt((c2 - 2) * (c2 - 2) + 4 * (c2 - 1) * (1 + 2 * c2))) / 2);
  const k = 2 * lam / (lam * lam + 1 - c2), Del = lam * lam - c2;
  const d1 = 3 * lam * lam / k * (k * (6 * lam * lam - 1) - 2 * lam), d2 = 8 * lam * lam / k * (k * (11 * lam * lam - 1) - 2 * lam);
  const a21 = 3 * c3 * (k * k - 2) / (4 * (1 + 2 * c2)), a22 = 3 * c3 / (4 * (1 + 2 * c2));
  const a23 = -3 * c3 * lam / (4 * k * d1) * (3 * k * k * k * lam - 6 * k * (k - lam) + 4), a24 = -3 * c3 * lam / (4 * k * d1) * (2 + 3 * k * lam);
  const b21 = -3 * c3 * lam / (2 * d1) * (3 * k * lam - 4), b22 = 3 * c3 * lam / d1, d21 = -c3 / (2 * lam * lam);
  const a31 = -9 * lam / (4 * d2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k)) + (9 * lam * lam + 1 - c2) / (2 * d2) * (3 * c3 * (2 * a23 - k * b21) + c4 * (2 + 3 * k * k));
  const a32 = -1 / d2 * (9 * lam / 4 * (4 * c3 * (k * a24 - b22) + k * c4) + 1.5 * (9 * lam * lam + 1 - c2) * (c3 * (k * b22 + d21 - 2 * a24) - c4));
  const b31 = 3 / (8 * d2) * (8 * lam * (3 * c3 * (k * b21 - 2 * a23) - c4 * (2 + 3 * k * k)) + (9 * lam * lam + 1 + 2 * c2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k)));
  const b32 = 1 / d2 * (9 * lam * (c3 * (k * b22 + d21 - 2 * a24) - c4) + 3 / 8 * (9 * lam * lam + 1 + 2 * c2) * (4 * c3 * (k * a24 - b22) + k * c4));
  const d31 = 3 / (64 * lam * lam) * (4 * c3 * a24 + c4), d32 = 3 / (64 * lam * lam) * (4 * c3 * (a23 - d21) + c4 * (4 + k * k));
  const s1 = 1 / (2 * lam * (lam * (1 + k * k) - 2 * k)) * (1.5 * c3 * (2 * a21 * (k * k - 2) - a23 * (k * k + 2) - 2 * k * b21) - 3 / 8 * c4 * (3 * k ** 4 - 8 * k * k + 8));
  const s2 = 1 / (2 * lam * (lam * (1 + k * k) - 2 * k)) * (1.5 * c3 * (2 * a22 * (k * k - 2) + a24 * (k * k + 2) + 2 * k * b22 + 5 * d21) + 3 / 8 * c4 * (12 - k * k));
  const a1 = -1.5 * c3 * (2 * a21 + a23 + 5 * d21) - 3 / 8 * c4 * (12 - k * k), a2 = 1.5 * c3 * (a24 - 2 * a22) + 9 / 8 * c4;
  const l1 = a1 + 2 * lam * lam * s1, l2 = a2 + 2 * lam * lam * s2;
  const Az = azU, Ax = Math.sqrt(-(l2 * Az * Az + Del) / l1), dn = 2 - n;
  const om = 1 + s1 * Ax * Ax + s2 * Az * Az;
  const x0 = a21 * Ax * Ax + a22 * Az * Az - Ax + (a23 * Ax * Ax - a24 * Az * Az) + (a31 * Ax ** 3 - a32 * Ax * Az * Az);
  const z0 = dn * Az + dn * d21 * Ax * Az * (1 - 3) + dn * (d32 * Az * Ax * Ax - d31 * Az ** 3);
  const vy0 = lam * om * (k * Ax + 2 * (b21 * Ax * Ax - b22 * Az * Az) + 3 * (b31 * Ax ** 3 - b32 * Ax * Az * Az)); // (τ₁ = λωt: the phase runs at λω)
  return { x0, z0, vy0, om, T: 2 * Math.PI / (lam * om), Ax };
}
// A periodic halo about L2 with out-of-plane amplitude azKm (northern, or southern for azKm < 0), in CR3BP units: the state at the x–z plane
// crossing nearest the Earth and the period. From Richardson's guess, corrected until the orbit recrosses the plane
// perpendicularly half a period later (x0 and ẏ0 adjusted, z0 held).
function haloCR3BP(azKm) { // (azKm < 0: the southern halo, the northern one's mirror image in the ecliptic)
  haloCR3BP.cache = haloCR3BP.cache || {}; if (haloCR3BP.cache[azKm]) return haloCR3BP.cache[azKm];
  const mu = MU_SE, gam = l2Gamma(), AU_KM = vnorm(planetHelio('earth', isoToT('2022-01-01T00:00:00Z')).r);
  const R = richardsonHalo(mu, gam, Math.abs(azKm) / (gam * AU_KM), azKm < 0 ? 3 : 1);
  // into barycentric units: L2 at 1 − μ + γ, lengths × γ
  const y0 = new Float64Array(42); y0[0] = 1 - mu + gam + R.x0 * gam; y0[2] = R.z0 * gam; y0[4] = R.vy0 * gam; for (let i = 0; i < 6; i++) y0[6 + 7 * i] = 1;
  const f = cr3bpODE(mu, true);
  let Thalf = R.T / 2;
  for (let it = 0; it < 30; it++) {
    const res = integrate(f, 0, y0, 1.5 * Thalf, { rtol: 1e-12, atol: 1e-14, h0: 0.01, events: [{ name: 'xz', g: (t, y) => y[1], dir: 0, terminal: true }], maxSteps: 2e5 });
    if (!res.stopped) break;
    const ye = res.stopEvent.y, fe = res.stopEvent.f, P = (i, j) => ye[6 + 6 * i + j];
    const vx = ye[3], vz = ye[5]; Thalf = res.stopEvent.t;
    if (Math.abs(vx) < 1e-11 && Math.abs(vz) < 1e-11) break;
    // δ[ẋ, ż] at the crossing from δ[x0, ẏ0], the crossing time's own shift folded in (δt = −δy / ẏ)
    const vy = ye[4], ax = fe[3], az = fe[5];
    const m00 = P(3, 0) - ax / vy * P(1, 0), m01 = P(3, 4) - ax / vy * P(1, 4), m10 = P(5, 0) - az / vy * P(1, 0), m11 = P(5, 4) - az / vy * P(1, 4);
    const det = m00 * m11 - m01 * m10; const dx0 = (-vx * m11 + vz * m01) / det, dvy0 = (-m00 * vz + m10 * vx) / det;
    y0[0] += dx0; y0[4] += dvy0;
  }
  const out = { y0: Float64Array.from(y0.subarray(0, 6)), T: 2 * Thalf, mu, gam };
  // the orbit over one period, sampled for haloRef (positions and velocities in CR3BP units)
  const res = integrate(cr3bpODE(mu, false), 0, out.y0, out.T, { rtol: 1e-12, atol: 1e-14, h0: 0.01, hmax: out.T / 720, maxSteps: 2e5 });
  out.ts = res.t; out.ys = res.y;
  return (haloCR3BP.cache[azKm] = out);
}
// the halo's period in seconds at time t (the CR3BP period in units of the Earth's mean motion then)
function haloPeriodS(t, azKm) { return haloCR3BP(azKm).T / seOmega(t); }
// the reference halo at time t, geocentric ecliptic km and km/s: phase 0 (the crossing nearest the Earth) at tPhase0; the
// CR3BP orbit is scaled by the Earth's distance from the Sun that day and turned into the inertial frame with seRot(t)
function haloRef(t, tPhase0, azKm) {
  const H = haloCR3BP(azKm), om = seOmega(t), T = H.T / om;
  let ph = ((t - tPhase0) / T) % 1; if (ph < 0) ph += 1;
  const tau = ph * H.T, i = bsearch(H.ts, tau), j = Math.min(i + 1, H.ts.length - 1), s = H.ts[j] > H.ts[i] ? (tau - H.ts[i]) / (H.ts[j] - H.ts[i]) : 0;
  const y = []; for (let k = 0; k < 6; k++) y.push(H.ys[i][k] + (H.ys[j][k] - H.ys[i][k]) * s);
  const e = planetHelio('earth', t), L = vnorm(e.r), Rm = seRot(t);
  const rr = [(y[0] - (1 - H.mu)) * L, y[1] * L, y[2] * L]; // from the Earth, rotating frame, km
  const vr = [y[3] * L * om, y[4] * L * om, y[5] * L * om]; // km/s in the rotating frame
  const wxr = [-om * rr[1], om * rr[0], 0]; // ω × r with ω = om ẑ
  const vi = vadd(vr, wxr);
  const rot = v => [Rm[0] * v[0] + Rm[1] * v[1] + Rm[2] * v[2], Rm[3] * v[0] + Rm[4] * v[1] + Rm[5] * v[2], Rm[6] * v[0] + Rm[7] * v[1] + Rm[8] * v[2]];
  return { r: rot(rr), v: rot(vi) };
}
// ---------------- the stable manifold: the way in ----------------
// A halo is unstable, and so has a stable manifold: the family of paths that fall onto it. One branch of it comes down
// to the Earth — and that is Webb's transfer: the launcher put the telescope on it at perigee, and it climbed for a month
// to settle onto the halo with next to no insertion burn. Here the branch is found in the CR3BP from the halo's
// monodromy matrix (the stable eigenvector), followed backward from a point near the halo down to its perigee, and laid
// into the real ephemeris as the reference the flight tracks.
function haloStableDir(azKm) { // the stable eigenvector of the monodromy matrix at the halo's phase 0, and the state-transition matrices round the orbit
  const H = haloCR3BP(azKm); if (H.vs) return H;
  const f = cr3bpODE(H.mu, true), y0 = new Float64Array(42); for (let i = 0; i < 6; i++) y0[i] = H.y0[i]; for (let i = 0; i < 6; i++) y0[6 + 7 * i] = 1;
  const res = integrate(f, 0, y0, H.T, { rtol: 1e-12, atol: 1e-14, h0: 0.01, hmax: H.T / 240, maxSteps: 2e5 });
  const yE = res.y[res.y.length - 1], Mon = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => yE[6 + 6 * i + j]));
  // the stable direction: the dominant eigenvector of the inverse (power iteration)
  const inv = A => { const n = 6, Mx = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r; [Mx[c], Mx[p]] = [Mx[p], Mx[c]]; const d = Mx[c][c]; for (let j = 0; j < 2 * n; j++) Mx[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c) { const fct = Mx[r][c]; for (let j = 0; j < 2 * n; j++) Mx[r][j] -= fct * Mx[c][j]; } } return Mx.map(r => r.slice(n)); };
  const Mi = inv(Mon); let v = [1, 0.3, 0.2, 0.1, 0.5, 0.1]; for (let i = 0; i < 400; i++) { const w = Mi.map(r => r.reduce((a, b, j) => a + b * v[j], 0)); const nn = Math.hypot(...w); v = w.map(x => x / nn); }
  H.vs = v; H.stm = res; return H;
}
// the state on the halo at phase ph (0…1), and the stable direction carried there
function haloSeed(azKm, ph) {
  const H = haloStableDir(azKm), tau = ph * H.T, S = H.stm, i = bsearch(S.t, tau), j = Math.min(i + 1, S.t.length - 1), f = S.t[j] > S.t[i] ? (tau - S.t[i]) / (S.t[j] - S.t[i]) : 0;
  const y = [], Phi = []; for (let k = 0; k < 6; k++) y.push(S.y[i][k] + (S.y[j][k] - S.y[i][k]) * f);
  for (let a = 0; a < 6; a++) { let acc = 0; for (let b = 0; b < 6; b++) acc += (S.y[i][6 + 6 * a + b] + (S.y[j][6 + 6 * a + b] - S.y[i][6 + 6 * a + b]) * f) * H.vs[b]; Phi.push(acc); }
  const nv = Math.hypot(...Phi); return { y, vs: Phi.map(x => x / nv), H };
}
// The branch of the stable manifold from the seed (the halo at phase ph, pushed eps along the stable direction, sign sg):
// backward in CR3BP time to its perigee about the Earth (or until it leaves), and forward through the approach onto the
// halo for fwdT. Returns the samples in CR3BP units with tau = 0 at the seed, and the perigee.
function manifoldBranch(azKm, ph, eps, sg, fwdT) {
  const { y, vs, H } = haloSeed(azKm, ph), mu = H.mu, AU = 1.496e8;
  const y0 = y.map((v, i) => v + sg * eps * vs[i]);
  const dE = yy => Math.hypot(yy[0] - (1 - mu), yy[1], yy[2]);
  // backward: stop at the perigee (the Earth distance's turning point, once inside 100 000 km), or after 300 days
  const DAY = SE_N * 86400;
  const back = integrate(cr3bpODE(mu, false), 0, Float64Array.from(y0), -300 * DAY, { rtol: 1e-11, atol: 1e-13, h0: -0.001, hmax: 0.01, maxSteps: 4e5,
    events: [{ name: 'perigee', dir: -1, terminal: true, g: (t, yy) => { const rx = yy[0] - (1 - mu), rv = rx * yy[3] + yy[1] * yy[4] + yy[2] * yy[5]; return dE(yy) * AU > 100000 ? 1 + Math.abs(rv) : rv; } }] }); // (backward in time the radial speed is positive on the way in and turns negative past the perigee)
  const per = back.stopEvent ? { tau: back.stopEvent.t, y: Array.from(back.stopEvent.y), r: dE(back.stopEvent.y) * AU } : null;
  const fwd = integrate(cr3bpODE(mu, false), 0, Float64Array.from(y0), fwdT, { rtol: 1e-11, atol: 1e-13, h0: 0.001, hmax: 0.01, maxSteps: 4e5 });
  return { per, back, fwd, mu };
}
// a CR3BP state (barycentric rotating, nondimensional) at epoch t, as geocentric ecliptic km and km/s
// Lengths scale with the Earth's distance that day; velocities with that length and the rate that keeps the Earth's
// gravity exact at that scale (√(μ/L³), 2–3 % off the mean motion when the Earth is near perihelion), which is what
// matters near the perigee, where a per-cent of speed is the difference between a transfer and a four-day orbit.
function cr3bpToInertial(t, y, mu) {
  const e = planetHelio('earth', t), L = vnorm(e.r), R = seRot(t), om = SE_N, omU = Math.sqrt((BODIES.sun.mu + BODIES.earth.mu) / (L * L * L));
  const rr = [(y[0] - (1 - mu)) * L, y[1] * L, y[2] * L], vr = [y[3] * L * omU, y[4] * L * omU, y[5] * L * omU], vi = vadd(vr, [-om * rr[1], om * rr[0], 0]);
  const rot = v => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  return { r: rot(rr), v: rot(vi) };
}
// ---------------- the mission ----------------
// The transfer is designed as the manifold branch that comes down to a 170-km perigee in the plane the launch site lies
// in at launch, timed so that the telescope reaches the halo's neighbourhood on the planned date: three unknowns (the
// halo's size, the phase the branch leaves it at, how far from the halo the "arrival" point is) for three conditions. The
// launcher then flies the ascent in that plane and the upper stage burns to put the telescope on the branch at its
// perigee; the corrections and, round the halo, the station-keeping burns keep it on the reference. The whole flight is
// integrated under the Earth, the Moon and the Sun, so the reference (a CR3BP path) is never followed exactly: the burns
// are what the difference costs.
function planHalo(cfg, progress = () => { }) {
  const M = new Mission(cfg), H = 3600, D = 86400, AU = 1.496e8;
  const L = LAUNCHERS[cfg.launcher], SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft])), P = new Propulsion(SC), S = LAUNCH_SITES[cfg.site], t0 = M.t0;
  const ship = M.addObj(new MObject('ship', cfg.shipName || SC.name, { primary: true, crew: 0, model: SC.model, color: '#ffd166' }));
  const tArr = isoToT(cfg.arrive), skD = cfg.halo.skDays * D, rPark = BODIES.earth.R + (cfg.parking?.hp ?? 170);
  const sDir = vunit(sitePosEcl('earth', S.lat, S.lon, 0, t0)), sg = cfg.halo.branch ?? -1;
  // ---------------- the design ----------------
  progress('Transfer design: the halo and its stable manifold…');
  // The unknowns are the halo's out-of-plane size and the phase the branch leaves the halo at, which together set where
  // the branch comes down and how its plane lies; the seed's distance off the halo is the scenario's (it only sets how
  // long the branch takes, about four months as Webb's did). The conditions: the branch's perigee is at the parking
  // orbit's radius, and the launch site lies in the branch's plane at liftoff. The perigee is pinned to the injection,
  // about three quarters of an hour after launch (ascent and a short coast).
  const tInjExp = t0 + 45 * 60, le = Math.log10((cfg.halo.seedKm ?? 47000) / AU);
  let tPerRef = tInjExp; // the epoch of the branch's perigee (refined to the parking orbit's actual pass below)
  const branchOf = (x, fwdT = 0.01) => manifoldBranch(x[0] * 1e5, ((x[1] % 1) + 1) % 1, Math.pow(10, le), sg, fwdT);
  const pole = vunit(sitePosEcl('earth', 90, 0, 0, t0)), sEast = vunit(vcross(pole, sDir)), sNorth = vcross(sDir, sEast);
  const evalDesign = x => {
    const br = branchOf(x); if (!br.per) return { F: [50, 50] };
    const st = cr3bpToInertial(tPerRef, br.per.y, br.mu), n = vunit(vcross(st.r, st.v)), d = vcross(n, sDir); // (d: the direction of flight in that plane over the site)
    return { F: [(vnorm(st.r) - rPark) / 1000, Math.asin(clamp(vdot(n, sDir), -1, 1)) * RAD], br, st, n, launchAz: Math.atan2(vdot(d, sEast), vdot(d, sNorth)) * RAD };
  };
  // the starting point: over both classes of halo (northern and southern, mirror images whose branches come down in
  // mirrored planes, so one of them is launched to the north-east and the other to the south-east), within the site's
  // range of azimuths, nearest the scenario's size
  const azOK = a => { const [lo, hi] = S.azRange || [-180, 180]; return a >= lo - 1 && a <= hi + 1; };
  let x0 = null, best = Infinity;
  for (const sgn of [1, -1]) for (let az = 2; az <= 6.001; az += 0.25) for (let ph = 0; ph < 1; ph += 0.01) {
    const E = evalDesign([sgn * az, ph]); if (!E.br || E.n[2] < 0 || !azOK(E.launchAz)) continue; const c = Math.abs(E.F[0]) / 20 + Math.abs(E.F[1]) / 30 + Math.abs(az - cfg.halo.az / 1e5) / 5; if (c < best) { best = c; x0 = [sgn * az, ph]; }
  }
  if (!x0) { M.warnings.push('No branch of the stable manifold comes down to the Earth for this halo.'); M.failed = 'design'; M.finalize(); return M; }
  const sD = newtonSolve(x => evalDesign(x).F, x0, { h: 1e-3, tol: 0.05, maxIt: 40, maxStep: 0.1 });
  if (globalThis.DEBUG) console.log('design', x0, sD.it, sD.hist.map(v => +v.toFixed(2)), sD.x, sD.F, 'launch az', evalDesign(sD.x).launchAz);
  if (!sD.ok) M.warnings.push(`Transfer design converged only approximately (residual ${sD.norm.toFixed(2)}).`);
  const azKm = sD.x[0] * 1e5;
  const DS = evalDesign(sD.x), T = haloPeriodS(tArr, azKm);
  // the reference: the branch from its perigee, through the approach, onto the halo and round it, as inertial samples
  const fullBr = branchOf(sD.x, haloCR3BP(azKm).T * ((cfg.halo.circuits ?? 1.05) + 0.5));
  const REF = []; { const b = fullBr.back; for (let i = b.t.length - 1; i >= 0; i--) REF.push({ tau: b.t[i] - fullBr.per.tau, y: b.y[i] }); const f = fullBr.fwd; for (let i = 1; i < f.t.length; i++) REF.push({ tau: f.t[i] - fullBr.per.tau, y: f.y[i] }); }
  const refTau = REF.map(q => q.tau); // tau = 0 at the perigee
  const refAt = tt => { const tau = (tt - tPerRef) * SE_N, i = clamp(bsearch(refTau, tau), 0, REF.length - 2), j = i + 1, f = clamp((tau - refTau[i]) / (refTau[j] - refTau[i] || 1), 0, 1); const y = REF[i].y.map((v, k) => v + (REF[j].y[k] - v) * f); return cr3bpToInertial(tt, y, fullBr.mu); };
  const plN = DS.n, tSeed = tPerRef - fullBr.per.tau / SE_N;
  M.summary.design = { az: azKm, periodDays: T / D, seedKm: Math.pow(10, le) * AU, perigeeKm: vnorm(DS.st.r) - BODIES.earth.R, branchDays: (tSeed - tPerRef) / D };
  // ---------------- launch ----------------
  progress('Launch & ascent…');
  const LP = launchPhase(M, cfg, L, scTotalMass(SC), plN, { ship });
  if (!LP.ok) { M.warnings.push('The launch vehicle cannot reach orbit with this payload.'); M.failed = 'ascent'; M.finalize(); return M; }
  const asc = LP.asc; P.attachUpper(asc.upper, asc.upperProp);
  M.notes.push(`Launch azimuth ${asc.azI.toFixed(1)}°: the plane of the stable manifold's branch to L2, which held the launch site at liftoff.`);
  ship.setConfig(asc.t, 'stack', { key: 'stack', parts: ['upper', 'sc-stowed'], launcher: cfg.launcher, stage: L.stages.length - 1, sc: SC.model });
  let t = asc.t, y = [...asc.r, ...asc.v, asc.m];
  const coast = (tEnd, phase, objRef = ship, extra) => { const res = cisInt(t, y, tEnd, {}); objRef.add(resToSeg(res, phase, extra)); t = res.t[res.t.length - 1]; y = Array.from(res.y[res.y.length - 1]); return res; };
  // ---------------- the injection ----------------
  // The burn at the perigee of the branch (the parking orbit comes round to it): its length and its centre solved so that
  // the climb is at the reference's position 2.5 days on — the upper stage's push is along the velocity, and the plane is
  // the orbit's, so two unknowns are all it has.
  progress('Injection toward L2: targeting…');
  const eng = P.engineOf('upper'), tank = P.tankOf('upper'), mdot = eng.thrust / (eng.isp * G0);
  const parkRes = cisInt(t, y, t + 3 * H, {});
  let tInj0 = tPerRef; { let bst = Infinity; for (let i = 0; i < parkRes.t.length; i++) { const tt = parkRes.t[i]; if (tt < t + 900) continue; const d = vnorm(vsub(parkRes.y[i].slice(0, 3), DS.st.r)); if (d < bst) { bst = d; tInj0 = tt; } } tPerRef = tInj0; } // where the parking orbit first passes the branch's perigee with room for the burn before it: the reference is pinned there (the hour or so of difference from the design's guess turns the Sun–Earth frame by a negligible 0.04°)
  const dvMag0 = vnorm(DS.st.v) - vnorm(resState(parkRes, tInj0).slice(3, 6)), D0 = propForDv(resState(parkRes, tInj0)[6], dvMag0, eng.isp) / mdot;
  const burnOf = x => { const Dn = Math.max(10, D0 + x[0] * 3), tIgn = clamp(tInj0 + x[1] * 100 - Dn / 2, t + 60, parkRes.tEnd - Dn - 60), yS = Array.from(resState(parkRes, tIgn)), law = localDirLaw(yS.slice(0, 3), yS.slice(3, 6), vunit(yS.slice(3, 6)));
    const r = cisInt(tIgn, yS, tIgn + Dn, { thrust: { T: eng.thrust, mdot, dir: law }, hmax: 20, h0: 1 }); return { tIgn, D: Dn, res: r, law, yEnd: Array.from(r.y[r.y.length - 1]) }; };
  const tW1 = t0 + 2.5 * D, hN = vunit(vcross(asc.r, asc.v));
  const missAt = (tS, yS, tW) => { const r = cisInt(tS, yS, tW, { rtol: 1e-9, atol: 1e-6, hmax: 3600 }), ye = r.y[r.y.length - 1], ref = refAt(tW).r; return [(ye[0] - ref[0]) / 1000, (ye[1] - ref[1]) / 1000, (ye[2] - ref[2]) / 1000]; };
  const injF = x => { const B = burnOf(x), m = missAt(B.res.tEnd, B.yEnd, tW1); const e1 = vunit(vsub(refAt(tW1).r, vscale(hN, vdot(refAt(tW1).r, hN)))), e2 = vcross(hN, e1); return [vdot(m, e1), vdot(m, e2)]; }; // (in the plane)
  const solI = newtonSolve(injF, [0, 0], { h: 1e-2, tol: 0.02, maxIt: 30, maxStep: 3 });
  if (globalThis.DEBUG) console.log('injection', (tInj0 - t0) / 60 | 0, 'min', (fb0 => fb0.tIgn - t0)(burnOf([0, 0])) / 60 | 0, solI.it, solI.hist.map(v => +v.toFixed(2)), solI.x);
  if (!solI.ok) M.warnings.push(`Injection targeting converged only approximately (residual ${(solI.norm * 1000).toFixed(0)} km).`);
  const fb = burnOf([solI.x[0] - 0.0005 * burnOf(solI.x).D / 3, solI.x[1]]); // (cut 0.05 % short on purpose, a couple of m/s at perigee that cost ten times that to make up later: the launcher must not overshoot — see MCC-1a)
  coast(fb.tIgn, 'parking orbit');
  ship.add(resToSeg(fb.res, 'injection toward L2', { stage: P.upper.id }, { T: eng.thrust, law: fb.law }));
  const used = fb.res.y[0][6] - fb.yEnd[6]; tank.propLeft -= used;
  const dvI = dvForProp(fb.res.y[0][6], used, eng.isp) * 1000;
  M.burn({ name: 'Injection (ESC-A)', t: fb.tIgn, dur: fb.D, dv: dvI, engine: eng.name, isp: eng.isp, prop: used, m0: fb.res.y[0][6], obj: 'ship', propType: eng.prop });
  M.ev(fb.tIgn, 'ship', 'Injection toward L2', `The upper stage burns ${fmtDur(fb.D)} (Δv ≈ ${dvI.toFixed(0)} m/s): just short of escape, the telescope sets off up the stable manifold of its halo orbit — the one path that climbs for a month, slowing all the way, and settles onto the orbit about L2 of its own accord. The burn is cut a touch short on purpose; the telescope's own thrusters make up the difference.`, 'burn');
  M.phase(asc.t, fb.tIgn, 'Parking orbit', '#4ea8de');
  t = fb.res.tEnd; y = Array.from(fb.yEnd);
  M.summary.design.C3 = vdot(y.slice(3, 6), y.slice(3, 6)) - 2 * MU_E / vnorm(y.slice(0, 3)); M.summary.design.azLaunch = asc.azI;
  // ---------------- separation ----------------
  const tSep = t + 600; coast(tSep, 'transfer to L2');
  const up = M.addObj(new MObject('upper', P.upper.name, { kind: 'stage', model: 'stage', color: '#aaa' }));
  up.setConfig(t, 'stage', { key: 'stage', launcher: cfg.launcher, stage: L.stages.length - 1, withAdapter: true });
  const mUp = P.upper.dry + P.upper.propLeft;
  up.add(resToSeg(cisInt(t, [...y.slice(0, 3), ...vadd(y.slice(3, 6), vscale(vunit(y.slice(3, 6)), -0.002)), mUp], t + 7 * D, {}), 'spent stage'));
  y[6] -= mUp; P.upper.attached = false;
  ship.setConfig(t, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'], deployT: t0, deploy: cfg.deploy });
  M.ev(t, 'ship', 'Separation from the upper stage', 'The telescope, folded for launch, separates from the ESC-A and begins its deployments on the way to L2.', 'sep');
  // ---------------- the deployments, on the mission clock ----------------
  for (const d of cfg.deploy || []) M.ev(t0 + d.at, 'ship', d.name, d.desc || '', 'deploy', { dur: d.dur });
  // ---------------- corrections, insertion and station-keeping: tracking the reference ----------------
  // Each burn brings the telescope to the reference's position at a waypoint ahead: the corrections on the way aim at
  // the arrival; the insertion and the station-keeping burns aim two nodes (six weeks) on — aiming at the very next node
  // over-corrects the position and the burn after pays it back, so each would cost twice what it needs. The reference is a CR3BP
  // path in a real sky, so a few metres per second are asked at every node — about what Webb spends.
  const dvSK = [];
  const applyBurn = (name, tB, dv, descFn) => {
    const mag = vnorm(dv) * 1000, pm = P.burn('OBS', y[6], mag / 1000);
    M.burn({ name, t: tB, dur: pm.dur, dv: mag, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: y[6], obj: 'ship', propType: pm.propType });
    M.ev(tB, 'ship', name, descFn(mag, pm.dur), 'burn', { dv: mag });
    y[3] += dv[0]; y[4] += dv[1]; y[5] += dv[2]; y[6] -= pm.prop; return mag;
  };
  const track = (name, tB, tW, phase, maxStep, descFn, alongOnly = false) => {
    coast(tB, phase);
    const vh = vunit(y.slice(3, 6)), dvOf = x => alongOnly ? vscale(vh, x[0] * 1e-3) : vscale(x, 1e-3);
    const F = x => { const dv = dvOf(x), m = missAt(tB, [y[0], y[1], y[2], y[3] + dv[0], y[4] + dv[1], y[5] + dv[2], y[6]], tW); return alongOnly ? [vdot(m, vunit(refAt(tW).r))] : m; }; // (along the velocity only: the distance from the Earth, i.e. the energy)
    const sol = newtonSolve(F, alongOnly ? [0] : [0, 0, 0], { h: 1e-2, tol: 0.02, maxIt: 25, maxStep: maxStep * 1000, lambda: 1e-6 });
    if (globalThis.DEBUG) console.log(name, sol.it, sol.hist.map(v => +v.toFixed(2)), sol.x.map(v => +v.toFixed(2)));
    if (!sol.ok) M.warnings.push(`${name} converged only approximately (residual ${(sol.norm * 1000).toFixed(0)} km).`);
    return applyBurn(name, tB, dvOf(sol.x), descFn);
  };
  progress('Mid-course corrections…');
  track('MCC-1a', t0 + 12.5 * H, tArr, 'transfer to L2', 0.05, (mag, dur) => `The first correction, 12.5 hours after launch, makes up the energy the injection left short — always short, by design: the launcher must not overshoot, since the telescope cannot turn round to thrust back toward the Sun without exposing its cold side. Δv ${mag.toFixed(1)} m/s along the velocity (${fmtDur(dur)} on the SCAT thrusters).`, true);
  track('MCC-1b', tW1, tArr, 'transfer to L2', 0.02, (mag, dur) => `A fine trim 2.5 days out, after the first correction has been measured, aims the telescope at its arrival point: Δv ${mag.toFixed(1)} m/s.`);
  progress('L2 insertion…');
  track('MCC-2 — L2 insertion', tArr, tArr + 2 * skD, 'transfer to L2', 0.02, (mag, dur) => `Arrival: the telescope is ${(vnorm(vsub(refAt(tArr).r, l2Point(tArr))) / 1000).toFixed(0)} thousand km from L2 and already on the approach to its halo orbit; this burn of ${mag.toFixed(1)} m/s is all the insertion it needs. From here it circles L2 once every ${(T / D).toFixed(0)} days without ever being at L2, the Sun, the Earth and the Moon always behind its sunshield.`);
  M.phase(fb.tIgn, tArr, 'Transfer to L2', '#9ab8ff');
  progress('Station-keeping…');
  const tEnd = tArr + (cfg.halo.circuits ?? 1.05) * T; let k = 1;
  for (let tN = tArr + skD; tN < tEnd; tN += skD, k++) dvSK.push(track(`Station-keeping burn ${k}`, tN, Math.min(tN + 2 * skD, tEnd + 10 * D), 'halo orbit about L2', 0.01, (mag, dur) => `${EXPLAIN.mcc} An orbit about L2 is unstable — left alone the telescope would drift off it within months — so every three weeks a small burn puts it back on course: ${mag.toFixed(2)} m/s.`));
  coast(tEnd + (cfg.coastAfter ?? 10) * D, 'halo orbit about L2');
  M.phase(tArr, t, 'Halo orbit about L2', '#c3a2ff');
  M.ev(tEnd, 'ship', 'One circuit of the halo', `${(T / D).toFixed(0)} days after insertion the telescope has gone once round L2. It will keep this orbit the same way for its twenty years of observing, its sunshield always between the Sun, the Earth, the Moon and the mirror.`, 'info');
  M.summary.halo = { az: azKm, periodDays: T / D, dvTotal: dvSK.reduce((a, b) => a + b, 0), dvSK };
  M.finalize(); return M;
}
