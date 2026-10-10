// ============================================================================
// planner.js — shared mission-planning machinery
//   launch phase → ascent samples, staging debris, events
//   rocket-equation bookkeeping (Propulsion), Newton targeting solver
// ============================================================================
const EXPLAIN = {
  liftoff: 'Engines reach full thrust; hold-down clamps release. Thrust must exceed weight (T/W > 1) — the rocket climbs slowly at first.',
  vertical: 'The vehicle rises vertically to clear the tower, then begins a small pitch-over manoeuvre toward the launch azimuth.',
  gravityTurn: 'Gravity turn: the rocket keeps its nose along the airflow and lets gravity bend the path toward horizontal, minimising aerodynamic load.',
  maxq: 'Max-Q: dynamic pressure ½ρv² peaks — air density falls with altitude while speed climbs. Engines may throttle down here.',
  staging: 'Staging: discarding empty tanks and engines keeps the mass ratio favourable (Tsiolkovsky rocket equation: Δv = Isp·g₀·ln(m₀/m₁)).',
  insertion: 'Orbit insertion: horizontal speed ≈ 7.8 km/s. The vehicle is now in free fall around the Earth — astronauts feel weightless.',
  parking: 'Parking orbit: a temporary low orbit used to check systems and wait for the correct point to start the departure burn.',
  tli: 'Trans-Lunar Injection: a ~3.1 km/s burn near perigee raises the apogee to the Moon’s distance. Burning deep in Earth’s gravity well exploits the Oberth effect.',
  tmi: 'Trans-Mars Injection: escape burn from the parking orbit onto a hyperbola whose excess velocity (v∞) puts the craft on a heliocentric transfer orbit to Mars.',
  coast: 'Coasting: no engine thrust — the trajectory is shaped purely by gravity (Earth, Moon and Sun are all pulling).',
  soiMoon: 'Entering the Moon’s sphere of influence (~66,000 km): lunar gravity now dominates over the Earth’s perturbation.',
  loi: 'Lunar Orbit Insertion: a retrograde burn behind the Moon slows the craft so lunar gravity can capture it. Out of radio contact with Earth.',
  mcc: 'Mid-course correction: a small burn trims the trajectory so the craft arrives at exactly the planned point.',
  pdi: 'Powered descent: the lander fires its engine retrograde, braking from ~1.7 km/s orbital speed to a hover over the landing site.',
  surface: 'On the surface. The local gravity is 1.62 m/s² (Moon) or 3.71 m/s² (Mars).',
  ascent: 'Ascent: the ascent stage launches from the descent stage, which serves as a launch pad.',
  rendezvous: 'Rendezvous: the lower, faster ascent vehicle catches up and docks with the orbiter (orbital mechanics: lower orbit = shorter period).',
  tei: 'Trans-Earth Injection: a prograde burn leaves lunar orbit and starts the fall back toward Earth.',
  entry: 'Atmospheric entry at ~11 km/s: kinetic energy is shed as heat in a shock layer of plasma (> 2,500 °C) around the heat shield.',
  splash: 'Splashdown under parachutes at ~8 m/s.',
  freeReturn: 'Free return: the trajectory is arranged so that lunar gravity bends the path back toward Earth with no engine burn required.',
  flyby: 'Gravity assist / flyby: in the planet’s frame the craft enters and leaves at the same speed, but its direction is turned — in the Sun’s frame this adds or removes speed.',
  moi: 'Mars Orbit Insertion: braking burn at periapsis of the arrival hyperbola so Mars can capture the craft.',
  edl: 'Entry, descent & landing: from ~5–7 km/s to zero in about seven minutes — heat shield, supersonic parachute, then rocket-powered descent.',
  cruise: 'Interplanetary cruise: the craft follows a heliocentric ellipse. The Sun’s gravity dominates; Earth and Mars are distant perturbations.',
};
function planeNormalFromAz(body, lat, lon, t, az) {
  const r = sitePosEcl(body, lat, lon, 0, t); const lf = localFrame(body, r, t);
  const d = vadd(vscale(lf.north, Math.cos(az * DEG)), vscale(lf.east, Math.sin(az * DEG)));
  return vunit(vcross(lf.up, d));
}
// historical "flight azimuth" is measured in the Earth-fixed frame; convert to the inertial orbit plane
function planeNormalFromAzRel(body, lat, lon, t, azRel, vOrb = 7.8) {
  const r = sitePosEcl(body, lat, lon, 0, t), lf = localFrame(body, r, t);
  const vEq = vdot(vcross(bodyOmegaEcl(body, t), r), lf.east);
  const f = azI => Math.atan2(vOrb * Math.sin(azI) - vEq, vOrb * Math.cos(azI)) - azRel * DEG;
  let azI = azRel * DEG; for (let k = 0; k < 30; k++) { const d = f(azI); azI -= d; if (Math.abs(d) < 1e-12) break; }
  return { n: planeNormalFromAz(body, lat, lon, t, azI * RAD), azI: azI * RAD };
}
// plane containing launch site at time t and a target direction; eastward-moving sense
function planeThroughSite(body, lat, lon, t, dir) {
  const s = vunit(sitePosEcl(body, lat, lon, 0, t));
  let n = vunit(vcross(s, dir));
  const lf = localFrame(body, s, t);
  const motion = vcross(n, s);
  if (vdot(motion, lf.east) < 0) n = vscale(n, -1);
  const az = Math.atan2(vdot(vcross(n, s), lf.east), vdot(vcross(n, s), lf.north)) * RAD;
  return { n, az };
}
// ------------- small linear algebra -------------
function solveLin(A, b) { // A: m x m array of arrays
  const m = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[m] / row[i]);
}
// minimum-norm Newton (Gauss–Newton with backtracking). F: x -> residual array (length m <= n)
function newtonSolve(F, x0, opt = {}) {
  const n = x0.length, h = opt.h || 1e-5, tol = opt.tol || 1e-3, maxIt = opt.maxIt || 18;
  let x = x0.slice(), Fx = F(x), nf = Math.hypot(...Fx), it = 0;
  const hist = [nf];
  for (; it < maxIt && nf > tol; it++) {
    const m = Fx.length, J = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) { const xp = x.slice(); xp[j] += h; const Fp = F(xp); for (let i = 0; i < m; i++) J[i][j] = (Fp[i] - Fx[i]) / h; }
    // dx = -J^T (J J^T + λI)^-1 F
    const JJt = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, k) => J[i].reduce((s, a, j) => s + a * J[k][j], 0) + (i === k ? (opt.lambda || 0) : 0)));
    const y = solveLin(JJt, Fx.map(v => -v)); if (!y) break;
    let dx = new Array(n).fill(0); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) dx[j] += J[i][j] * y[i];
    const maxStep = opt.maxStep || Infinity, dn = Math.hypot(...dx);
    if (dn > maxStep) dx = dx.map(v => v * maxStep / dn);
    let lam = 1, accepted = false;
    for (let ls = 0; ls < 8; ls++) {
      const xn = x.map((v, j) => v + lam * dx[j]); const Fn = F(xn); const nn = Math.hypot(...Fn);
      if (isFinite(nn) && nn < nf) { x = xn; Fx = Fn; nf = nn; accepted = true; break; }
      lam *= 0.5;
    }
    hist.push(nf);
    if (!accepted) break;
  }
  return { x, F: Fx, norm: nf, it, ok: nf <= (opt.okTol || tol * 10), hist };
}
// Nelder–Mead simplex minimiser (n-D); scales: initial step per dimension
function nelderMead(f, x0, scales, opt = {}) {
  const n = x0.length, maxIt = opt.maxIt || 120, tol = opt.tol || 1e-6;
  let P = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += scales[i]; P.push(x); }
  let Fv = P.map(f);
  for (let it = 0; it < maxIt; it++) {
    const idx = Fv.map((v, i) => i).sort((a, b) => Fv[a] - Fv[b]); P = idx.map(i => P[i]); Fv = idx.map(i => Fv[i]);
    if (Math.abs(Fv[n] - Fv[0]) < tol * (Math.abs(Fv[0]) + 1e-12)) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const xr = c.map((v, j) => v + (v - P[n][j])), fr = f(xr);
    if (fr < Fv[0]) { const xe = c.map((v, j) => v + 2 * (v - P[n][j])), fe = f(xe); if (fe < fr) { P[n] = xe; Fv[n] = fe; } else { P[n] = xr; Fv[n] = fr; } }
    else if (fr < Fv[n - 1]) { P[n] = xr; Fv[n] = fr; }
    else { const xc = c.map((v, j) => v + 0.5 * (P[n][j] - v)), fc = f(xc); if (fc < Fv[n]) { P[n] = xc; Fv[n] = fc; } else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); Fv[i] = f(P[i]); } } }
  }
  let bi = 0; for (let i = 1; i <= n; i++) if (Fv[i] < Fv[bi]) bi = i;
  return { x: P[bi], f: Fv[bi] };
}
// golden-section minimiser on [a,b]
function goldenMin(f, a, b, it = 40) {
  const g = (Math.sqrt(5) - 1) / 2; let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < it; i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } }
  return fc < fd ? { x: c, f: fc } : { x: d, f: fd };
}
function bisectRoot(f, a, b, it = 80) {
  let fa = f(a), fb = f(b); if (fa * fb > 0) return null;
  for (let i = 0; i < it; i++) { const m = 0.5 * (a + b), fm = f(m); if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
  return 0.5 * (a + b);
}

// ---------------------------------------------------------------------------
// Propulsion bookkeeping: tracks propellant of upper stage and spacecraft modules
// ---------------------------------------------------------------------------
class Propulsion {
  constructor(sc) { this.sc = sc; this.mods = {}; for (const k in sc.modules) this.mods[k] = { ...sc.modules[k], propLeft: sc.modules[k].prop, attached: true }; this.upper = null; }
  attachUpper(stage, propLeft) { this.upper = { ...stage, propLeft, attached: true }; }
  massOf(ids) { let m = 0; for (const id of ids) { const md = this.mods[id]; if (md && md.attached) m += md.dry + md.propLeft; } return m; }
  // execute burn by `engine` ('upper' or module id) carrying mass mStack; returns {ok, prop, dur, dvAch}
  burn(engineId, mStack, dvKms) {
    const e = engineId === 'upper' ? { thrust: this.upper.thrustVac, isp: this.upper.ispVac, prop: this.upper.prop, name: this.upper.engine } : this.mods[engineId].engine;
    const tank = engineId === 'upper' ? this.upper : this.mods[engineId];
    let need = propForDv(mStack, dvKms, e.isp), ok = true;
    if (need > tank.propLeft + 1e-6) { need = tank.propLeft; ok = false; }
    tank.propLeft -= need;
    const mdot = e.thrust / (e.isp * G0);
    return { ok, prop: need, dur: need / mdot, dvAch: dvForProp(mStack, need, e.isp), thrust: e.thrust, isp: e.isp, engine: e.name, propType: e.prop || (engineId === 'upper' ? this.upper.prop : '') };
  }
  engineOf(engineId) { if (engineId === 'upper') return { thrust: this.upper.thrustVac, isp: this.upper.ispVac, name: this.upper.engine, prop: this.upper.prop }; return this.mods[engineId].engine; }
  tankOf(engineId) { return engineId === 'upper' ? this.upper : this.mods[engineId]; }
  dvLeft(engineId, mStack) { const t = this.tankOf(engineId); const e = this.engineOf(engineId); return dvForProp(mStack, t.propLeft, e.isp); }
}

// ---------------------------------------------------------------------------
// LAUNCH PHASE (shared).  Returns {ok, asc, ship}.  ship object gets ascent samples.
// ---------------------------------------------------------------------------
function launchPhase(M, cfg, L, scMass, normal, opts = {}) {
  const S = LAUNCH_SITES[cfg.site];
  const t0 = M.t0;
  const stack = buildAscentStack(L, scMass);
  const hp = cfg.parking?.hp ?? L.ascent.hp, ha = cfg.parking?.ha ?? L.ascent.ha;
  const asc = optimizeAscent({ body: 'earth', t0, lat: S.lat, lon: S.lon, stack, target: { normal, hp, ha }, vert: L.ascent.vert, kickGuess: L.ascent.kickGuess, fairingR: L.payloadFairing ? L.payloadFairing.r : 0, qMax: 33000, sampleDt: 0.5 });
  const ship = opts.ship;
  ship.add(new SampleSeg('earth', asc.samples, { phase: 'ascent' }));
  // configs per staging
  const nSt = L.stages.length;
  const cfgAt = (stFrom, boosters, fairing, les, sac) => ({ key: 'launch', stFrom, boosters, fairing, les, sac: sac ?? true, launcher: cfg.launcher });
  ship.setConfig(t0 - 7200, 'launch', cfgAt(0, true, true, true));
  let stFrom = 0, boosters = L.stages[0].parallel, fairing = !!L.payloadFairing, les = L.jettison.some(j => j.part === 'LES'), saj = L.jettison.some(j => j.part === 'SAJ');
  const lit = liftoffStages(L), liq = lit.filter(s => s.prop !== 'solid'), sol = lit.filter(s => s.prop === 'solid'); const IG = L.ign || { t: 3, ramp: 1.5 };
  const nm = engineCounts;
  if (IG.t > 0 && liq.length) M.ev(t0 - IG.t, 'ship', 'Ignition sequence start', `${nm(liq)} ignite on the pad${IG.seq ? ' — ' + IG.seq : ''}. Hold-down clamps keep the ${L.name} in place while the engines build up to full thrust and the computers check every engine; water floods the pad to soak up heat and sound.${sol.length ? ` The ${nm(sol)} solid boosters wait for T−0: once lit they cannot be shut down.` : ''}`, 'launch', { ign: true });
  M.ev(t0, 'ship', 'Liftoff', `${sol.length ? `${nm(sol)} ignite; ` : ''}${EXPLAIN.liftoff} Liftoff mass ${(stackMass(buildAscentStack(L, scMass)) / 1000).toFixed(0)} t, thrust ${(lit.reduce((a, s) => a + s.thrustSL, 0) / 1e6).toFixed(1)} MN.`, 'launch');
  M.ev(t0 + (L.ascent.vert || 10) + 2, 'ship', 'Pitch-over', EXPLAIN.vertical + ` Launch azimuth ${asc.azI.toFixed(1)}°.`, 'ascent');
  for (const e of asc.events) {
    let desc = e.desc;
    if (e.kind === 'staging') {
      const idx = L.stages.findIndex(s => s.id === e.stage);
      if (L.stages[idx].parallel) boosters = false; else stFrom = idx + 1;
      ship.setConfig(e.t, 'launch', { ...cfgAt(stFrom, boosters, fairing, les), saj });
      desc += ' ' + EXPLAIN.staging;
      // debris object
      const st = ship.stateAt(e.t);
      if (st) {
        const deb = M.addObj(new MObject('debris-' + e.stage, L.stages[idx].name, { kind: 'debris', model: 'stage', color: '#888', trail: false }));
        deb.setConfig(e.t, 'stage', { key: 'stage', launcher: cfg.launcher, stage: idx });
        const vSep = vadd(st.v, vscale(vunit(st.v), -0.004));
        deb.add(new ConicSeg('earth', e.t, e.t + 900, st.r, vSep, L.stages[idx].dry, { extra: { phase: 'spent stage' } }));
      }
    }
    if (e.kind === 'jettison') { if (e.part === 'fairing') fairing = false; if (e.part === 'LES') les = false; if (e.part === 'SAJ') saj = false; ship.setConfig(e.t, 'launch', { ...cfgAt(stFrom, boosters, fairing, les), saj }); }
    if (e.kind === 'maxq') desc = e.desc + ' ' + EXPLAIN.maxq;
    if (e.kind === 'insertion') desc = e.desc + ' ' + EXPLAIN.insertion;
    M.ev(e.t, 'ship', e.name, desc, e.kind);
  }
  // a non-restartable sustainer that reached orbit (e.g. SLS core) is discarded; the next stage becomes the upper stage
  if (asc.ok && asc.upper && !asc.upper.restart) {
    const idx = L.stages.findIndex(s => s.id === asc.upper.id);
    const nxt = asc.stack.stages.slice(idx + 1).find(s => s.attached);
    if (nxt) {
      const dropped = asc.upper.dry + asc.upper.propLeft;
      asc.m -= dropped; asc.upper.attached = false;
      asc.upper = nxt; asc.upperProp = nxt.propLeft;
      stFrom = idx + 1;
      ship.setConfig(asc.t, 'launch', { ...cfgAt(stFrom, false, fairing, les), saj });
      M.ev(asc.t + 1, 'ship', `${L.stages[idx].id} separation`, `The ${L.stages[idx].name} has done its job and separates; the ${nxt.name} will perform the upcoming burns.`, 'staging');
      const st = ship.stateAt(asc.t);
      if (st) { const deb = M.addObj(new MObject('debris-' + L.stages[idx].id, L.stages[idx].name, { kind: 'debris', model: 'stage', color: '#888', trail: false })); deb.setConfig(asc.t, 'stage', { key: 'stage', launcher: cfg.launcher, stage: idx }); deb.add(new ConicSeg('earth', asc.t, asc.t + 1500, st.r, vadd(st.v, vscale(vunit(st.v), -0.003)), L.stages[idx].dry, { extra: { phase: 'spent stage' } })); }
    }
  }
  M.phase(t0, asc.t, 'Launch & ascent', '#ff9f43');
  M.summary.ascent = { maxG: asc.maxG, maxQ: asc.maxQ, tIns: asc.t - t0, hp: asc.hpAch, ha: asc.haAch, kick: asc.kick, az: asc.azI, upperProp: asc.upperProp, upper: asc.upper ? asc.upper.id : null };
  return { ok: asc.ok, asc, stFrom, fairing, les, boosters };
}
function budgetRow(M, b) { M.burn(b); }
