// ============================================================================
// Planner: runs the flight-dynamics engine in a Web Worker (falls back to the
// main thread), then re-attaches class prototypes to the cloned mission.
// ============================================================================
const WORKER_MAIN = `
self.onmessage = (e) => {
  const { id, cfg } = e.data;
  try {
    const M = planScenario(cfg, msg => self.postMessage({ id, type: 'progress', msg }));
    self.postMessage({ id, type: 'done', M });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: (err && err.message) || String(err), stack: err && err.stack });
  }
};`;
const SEG_PROTO = { samples: SampleSeg.prototype, conic: ConicSeg.prototype, burn: BurnSeg.prototype, surface: SurfaceSeg.prototype };
function rehydrate(M) {
  Object.setPrototypeOf(M, Mission.prototype);
  for (const o of M.objects) { Object.setPrototypeOf(o, MObject.prototype); for (const s of o.segs) Object.setPrototypeOf(s, SEG_PROTO[s.type] || Object.prototype); }
  return M;
}
const Planner = {
  worker: null, url: null, seq: 0, cur: null, cache: new Map(), useWorker: true,
  ensure() {
    if (this.worker || !this.useWorker) return;
    try {
      if (!this.url) this.url = URL.createObjectURL(new Blob([document.getElementById('engine-src').textContent + '\n' + WORKER_MAIN], { type: 'text/javascript' }));
      this.worker = new Worker(this.url);
      this.worker.onmessage = e => this.onMsg(e.data);
      this.worker.onerror = e => { const c = this.cur; this.kill(); this.useWorker = false; if (c) this.runMain(c); };
    } catch (e) { this.useWorker = false; this.worker = null; }
  },
  kill() { if (this.worker) { this.worker.terminate(); this.worker = null; } },
  onMsg(d) {
    const c = this.cur; if (!c || d.id !== c.id) return;
    if (d.type === 'progress') c.onProgress && c.onProgress(d.msg);
    else if (d.type === 'done') { this.cur = null; const M = rehydrate(d.M); this.store(c.key, M); c.resolve(M); }
    else if (d.type === 'error') { this.cur = null; c.reject(new Error(d.message)); }
  },
  store(key, M) { this.cache.set(key, M); while (this.cache.size > 5) this.cache.delete(this.cache.keys().next().value); },
  runMain(c) {
    setTimeout(() => {
      try { const M = planScenario(JSON.parse(c.key), m => c.onProgress && c.onProgress(m)); this.store(c.key, M); if (this.cur === c) this.cur = null; c.resolve(M); }
      catch (err) { if (this.cur === c) this.cur = null; c.reject(err); }
    }, 30);
  },
  plan(cfg, onProgress) {
    const key = JSON.stringify(cfg);
    if (this.cache.has(key)) { const M = this.cache.get(key); this.cache.delete(key); this.cache.set(key, M); return Promise.resolve(M); }
    if (this.cur && this.cur.key === key) { // same request already running: chain
      const c = this.cur; const prev = c.onProgress; c.onProgress = m => { prev && prev(m); onProgress && onProgress(m); };
      return c.promise;
    }
    if (this.cur) { this.cur.reject(Object.assign(new Error('superseded'), { superseded: true })); this.cur = null; this.kill(); }
    const id = ++this.seq;
    const c = { id, key, onProgress };
    c.promise = new Promise((res, rej) => { c.resolve = res; c.reject = rej; });
    this.cur = c;
    this.ensure();
    if (this.worker) this.worker.postMessage({ id, cfg: JSON.parse(key) });
    else this.runMain(c);
    return c.promise;
  },
};

// ============================================================================
// Derived mission data used by the viewer (phases, tanks, cumulative Δv …)
// ============================================================================
class MissionData {
  constructor(M, scn) {
    this.M = M; this.scn = scn; this.cfg = M.cfg;
    this.L = LAUNCHERS[M.cfg.launcher];
    this.SC = JSON.parse(JSON.stringify(SPACECRAFT[M.cfg.spacecraft]));
    if (M.cfg.scOverride) for (const k in M.cfg.scOverride) Object.assign(this.SC.modules[k], M.cfg.scOverride[k]);
    if (M.cfg.payloadMass && this.SC.modules.CARGO) this.SC.modules.CARGO.dry = M.cfg.payloadMass;
    this.ship = M.obj('ship');
    this.tStart = M.t0 - 90;
    this.tEnd = M.tEnd;
    this.burns = M.burns.slice().sort((a, b) => a.t - b.t);
    this.events = M.events.slice().sort((a, b) => a.t - b.t);
    for (const e of this.events) e.met = e.t - M.t0;
    this.phases = M.phases.slice().sort((a, b) => a.t0 - b.t0);
    this.buildTanks();
    this.buildDv();
    this.buildStats();
    this.buildPowered();
    buildTraverse(this);
  }
  phaseAt(t) { let best = null; for (const p of this.phases) if (t >= p.t0 && t <= p.t1 && (!best || p.t0 >= best.t0)) best = p; return best; }
  burnAt(t, objId) { for (const b of this.burns) if ((!objId || b.obj === objId) && t >= b.t && t <= b.t + Math.max(b.dur, 0.5)) return b; return null; }
  // Engine-on intervals for every craft, read from the trajectory itself (thrust > 0), so the launch ascent,
  // landings and every finite or impulsive burn are included; short staging pauses are merged into the burn.
  buildPowered() {
    const out = [];
    const nameFor = (ph, o, t0) => {
      const p = String(ph || '').toLowerCase();
      if (o.id === 'ship' && t0 < this.M.t0 + 30) return 'Launch — ascent to orbit';
      if (/powered descent|landing|terminal|sky crane/.test(p)) return 'Powered descent & landing';
      if (/ascent/.test(p)) return 'Ascent to orbit';
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Engine burn';
    };
    for (const o of this.M.objects) {
      if (o.kind === 'debris') continue;
      const iv = [];
      for (const sg of o.segs) {
        if (sg.type === 'burn') { if (sg.thrust > 0) iv.push({ t0: sg.t0, t1: sg.t1, ph: sg.meta && sg.meta.phase }); }
        else if (sg.type === 'samples') {
          let s0 = -1;
          for (let i = 0; i < sg.n; i++) {
            const on = sg.T[i] > 0;
            if (on && s0 < 0) s0 = i;
            else if (!on && s0 >= 0) { iv.push({ t0: sg.t[s0], t1: sg.t[i], ph: (sg.extra[s0] && sg.extra[s0].phase) || (sg.meta && sg.meta.phase) }); s0 = -1; }
          }
          if (s0 >= 0) iv.push({ t0: sg.t[s0], t1: sg.t1, ph: (sg.extra[s0] && sg.extra[s0].phase) || (sg.meta && sg.meta.phase) });
        }
      }
      iv.sort((a, b) => a.t0 - b.t0);
      const mg = [];
      for (const x of iv) { const L = mg[mg.length - 1]; if (L && x.t0 - L.t1 <= 6) L.t1 = Math.max(L.t1, x.t1); else mg.push({ ...x }); }
      const mine = this.burns.filter(b => b.obj === o.id);
      for (const x of mg) {
        let best = null, bo = 0;
        for (const b of mine) { const ov = Math.min(x.t1 + 2, b.t + Math.max(b.dur, 1)) - Math.max(x.t0 - 2, b.t); if (ov > bo) { bo = ov; best = b; } }
        out.push({ obj: o.id, t0: x.t0, t1: Math.max(x.t1, x.t0 + 1), burn: best, name: best ? best.name : nameFor(x.ph, o, x.t0) });
      }
      // a burn the flight plan applies as an instantaneous Δv (no thrusting segment): list it too, with the
      // direction of the velocity change where the trajectory segments meet, so the viewer can show it firing
      for (const b of mine) if (!mg.some(x => b.t < x.t1 + 2 && b.t + Math.max(b.dur, 1) > x.t0 - 2)) {
        const sA = o.segs.find(sg => Math.abs(sg.t1 - b.t) < 0.01), sB = o.segs.find(sg => sg !== sA && Math.abs(sg.t0 - b.t) < 0.01);
        let dir = null;
        if (sA && sB && sA.ref === sB.ref && sA.type !== 'surface' && sB.type !== 'surface') { const d = vsub(sB.stateAt(sB.t0).v, sA.stateAt(sA.t1).v); if (vnorm(d) > 1e-7) dir = vunit(d); }
        out.push({ obj: o.id, t0: b.t, t1: b.t + Math.max(b.dur, 1), burn: b, name: b.name, imp: true, dir });
      }
    }
    out.sort((a, b) => a.t0 - b.t0);
    // the launch burn starts on the pad: liquid engines light before liftoff while hold-down clamps hold the vehicle
    const IG = this.L.ign, lau = out.find(x => x.obj === 'ship' && Math.abs(x.t0 - this.M.t0) < 30);
    if (lau && IG && IG.t > 0 && liftoffStages(this.L).some(s => s.prop !== 'solid')) lau.t0 = this.M.t0 - IG.t;
    this.powered = out; this.impList = out.filter(x => x.imp);
  }
  impAt(t, objId) { for (const x of this.impList) if (x.obj === objId && t >= x.t0 && t < x.t1) return x; return null; }
  poweredAt(t, objId) { for (const x of this.powered) if (x.obj === objId && t >= x.t0 && t <= x.t1) return x; return null; }
  nextPowered(t, objId) { for (const x of this.powered) if (x.obj === objId && x.t0 > t) return x; return null; }
  buildTanks() {
    const SC = this.SC, L = this.L, M = this.M;
    const tanks = [];
    const upper = L.stages[L.stages.length - 1];
    const asc = M.summary.ascent;
    const upperStage = asc && asc.upper ? (L.stages.find(s => s.id === asc.upper) || upper) : upper;
    const tIns = this.ship && this.ship.segs.length ? this.ship.segs[0].t1 : M.t0 + 600;
    if (asc) tanks.push({ id: 'upper', name: upperStage.name, engine: upperStage.engine, prop: upperStage.prop, cap: upperStage.propMass, t0: tIns, init: asc.upperProp, pts: [] });
    for (const k in SC.modules) { const md = SC.modules[k]; if (md.prop > 0 && md.engine) tanks.push({ id: k, name: md.name, engine: md.engine.name, prop: md.engine.prop, cap: md.prop, t0: M.t0, init: md.prop, pts: [] }); }
    // consumption from burns
    for (const tk of tanks) { tk.pts.push([tk.t0, tk.init]); }
    const byEngine = name => tanks.find(t => t.engine === name);
    let cur = new Map(tanks.map(t => [t.id, t.init]));
    for (const b of this.burns) {
      let tk = byEngine(b.engine); if (!tk) continue;
      const v0 = cur.get(tk.id), v1 = Math.max(0, v0 - (b.prop || 0));
      tk.pts.push([b.t, v0], [b.t + Math.max(b.dur, 0.5), v1]); cur.set(tk.id, v1);
    }
    // refilling / ISRU jumps (upper tank)
    const up = tanks.find(t => t.id === 'upper');
    if (up) {
      const cfg = this.cfg;
      const evFull = this.events.find(e => e.kind === 'refill' && /full/i.test(e.name));
      if (cfg.refill && evFull) insertJump(up, evFull.t, cfg.refill.to);
      const isru = this.events.find(e => e.kind === 'isru');
      if (cfg.isru && isru) { // propellant rises linearly during the surface stay, until liftoff
        const lift = this.burns.find(b => b.t > isru.t && b.obj === 'ship');
        if (lift) { const v = valueAt(up, isru.t); insertRamp(up, isru.t, lift.t - 1, v, cfg.isru.to); }
      }
    }
    function valueAt(tk, t) { let v = tk.pts[0][1]; for (let i = 0; i < tk.pts.length; i++) { const p = tk.pts[i]; if (p[0] <= t) v = p[1]; else { const q = tk.pts[i - 1]; if (q) v = q[1] + (p[1] - q[1]) * (t - q[0]) / Math.max(p[0] - q[0], 1e-9); break; } } return v; }
    function insertJump(tk, t, val) { const v = valueAt(tk, t); const before = tk.pts.filter(p => p[0] < t), after = tk.pts.filter(p => p[0] >= t); const dv = val - v; tk.pts = [...before, [t, v], [t + 1, val], ...after.map(p => [p[0], p[1] + dv])]; tk.cap = Math.max(tk.cap, val); }
    function insertRamp(tk, ta, tb, va, vb) { const before = tk.pts.filter(p => p[0] < ta), after = tk.pts.filter(p => p[0] > tb); const dv = vb - valueAt(tk, tb); tk.pts = [...before, [ta, va], [tb, vb], ...after.map(p => [p[0], p[1] + dv])]; tk.cap = Math.max(tk.cap, vb); }
    for (const tk of tanks) tk.pts.sort((a, b) => a[0] - b[0]);
    this.tanks = tanks;
    this.tankValue = (tk, t) => t < tk.t0 ? null : valueAt(tk, t);
  }
  buildDv() {
    // ascent Δv by integrating thrust acceleration of the ascent samples (primary ship)
    const pts = [[this.M.t0, 0]];
    let acc = 0;
    const seg0 = this.ship && this.ship.segs.find(s => s.type === 'samples' && s.meta && s.meta.phase === 'ascent');
    if (seg0) {
      for (let i = 1; i < seg0.n; i++) { const dt = seg0.t[i] - seg0.t[i - 1]; const a = seg0.m[i - 1] > 0 ? seg0.T[i - 1] / seg0.m[i - 1] : 0; acc += a * dt; if (i % 10 === 0 || i === seg0.n - 1) pts.push([seg0.t[i], acc]); }
    }
    this.ascentDv = acc; // m/s
    this.dvPts = pts;
  }
  dvSpent(t, objId = 'ship') {
    let v = 0;
    if (objId === 'ship') { const p = this.dvPts; if (t >= p[p.length - 1][0]) v = this.ascentDv; else for (let i = 1; i < p.length; i++) if (p[i][0] >= t) { const q = p[i - 1]; v = q[1] + (p[i][1] - q[1]) * (t - q[0]) / Math.max(p[i][0] - q[0], 1e-9); break; } }
    for (const b of this.burns) { if (b.obj !== objId) continue; if (t <= b.t) continue; const f = clamp((t - b.t) / Math.max(b.dur, 0.5), 0, 1); v += (b.dv || 0) * f; }
    return v;
  }
  buildStats() {
    const M = this.M; const ship = this.ship; const st = {};
    if (ship) {
      // max distance from Earth & from home planet
      let maxD = 0, tMax = 0;
      const t1 = Math.min(ship.t1, M.tEnd), stp = Math.max(60, (t1 - M.t0) / 4000);
      for (let t = M.t0; t <= t1; t += stp) { const s = ship.stateAt(t); if (!s) continue; const p = vsub(vadd(planetHelio(s.ref, t).r, s.r), planetHelio('earth', t).r); const d = vnorm(p); if (d > maxD) { maxD = d; tMax = t; } }
      st.maxDistEarth = maxD; st.tMaxDist = tMax;
      // gravity-assist bookkeeping: heliocentric speed before/after flybys
      st.flybys = [];
      for (const e of this.events) if (e.kind === 'flyby') {
        const body = /mars/i.test(e.name) ? 'mars' : /earth/i.test(e.name) ? 'earth' : /moon|lunar/i.test(e.name + e.desc) ? 'moon' : null;
        if (!body || body === 'moon') continue;
        const dt = 12 * DAY; const a = ship.stateAt(e.t - dt), b = ship.stateAt(e.t + dt);
        if (!a || !b) continue;
        const ha = { r: vadd(planetHelio(a.ref, e.t - dt).r, a.r), v: vadd(planetHelio(a.ref, e.t - dt).v, a.v) }, hb = { r: vadd(planetHelio(b.ref, e.t + dt).r, b.r), v: vadd(planetHelio(b.ref, e.t + dt).v, b.v) };
        const ea = rv2coe(ha.r, ha.v, BODIES.sun.mu), eb = rv2coe(hb.r, hb.v, BODIES.sun.mu);
        const q = el => el.e < 1 ? `${(el.rp / AU).toFixed(2)} × ${(el.ra / AU).toFixed(2)} AU` : 'escape from the Sun';
        st.flybys.push({ t: e.t, body, name: e.name, before: q(ea), after: q(eb), dE: eb.energy - ea.energy });
        e.gaNote = `Solar orbit before: ${q(ea)}; after: ${q(eb)} (perihelion × aphelion). Orbital energy ${eb.energy >= ea.energy ? 'gained' : 'lost'} ${Math.abs(eb.energy - ea.energy).toFixed(1)} km²/s² from ${BODIES[body].name}'s motion — with no propellant.`;
      }
    }
    this.stats = st;
  }
}
