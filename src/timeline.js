// ============================================================================
// timeline.js — mission container: objects, trajectory segments, events, budget
// Every segment returns body-relative state (ref body, ECL axes, km, km/s).
// ============================================================================
function bsearch(arr, t) { // last index i with arr[i] <= t
  let lo = 0, hi = arr.length - 1;
  if (t <= arr[0]) return 0; if (t >= arr[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m; else hi = m; }
  return lo;
}
class SampleSeg {
  // samples: [{t, r, v, m, T, thrDir, D, ...extras}]
  constructor(ref, samples, meta = {}) {
    this.type = 'samples'; this.ref = ref; this.meta = meta;
    const n = samples.length; this.n = n;
    this.t = new Float64Array(n); this.r = new Float64Array(3 * n); this.v = new Float64Array(3 * n);
    this.m = new Float64Array(n); this.T = new Float64Array(n); this.dir = new Float64Array(3 * n); this.D = new Float64Array(3 * n);
    this.extra = [];
    for (let i = 0; i < n; i++) {
      const s = samples[i]; this.t[i] = s.t;
      for (let k = 0; k < 3; k++) { this.r[3 * i + k] = s.r[k]; this.v[3 * i + k] = s.v[k]; this.dir[3 * i + k] = s.thrDir ? s.thrDir[k] : 0; this.D[3 * i + k] = s.D ? s.D[k] : 0; }
      this.m[i] = s.m ?? meta.m ?? 0; this.T[i] = s.T || 0;
      const ex = {}; for (const key of ['alt', 'q', 'mach', 'heat', 'gload', 'phase', 'chute', 'blackout', 'stage', 'throttle', 'bank', 'alpha', 'hdg']) if (s[key] !== undefined) ex[key] = s[key];
      this.extra.push(ex);
    }
    this.t0 = this.t[0]; this.t1 = this.t[n - 1];
  }
  stateAt(t) {
    const i = bsearch(this.t, t), j = Math.min(i + 1, this.n - 1);
    const out = { ref: this.ref, extra: this.extra[i] };
    if (i === j || this.t[j] === this.t[i]) {
      out.r = [this.r[3 * i], this.r[3 * i + 1], this.r[3 * i + 2]]; out.v = [this.v[3 * i], this.v[3 * i + 1], this.v[3 * i + 2]];
      out.m = this.m[i]; out.T = this.T[i]; out.dir = [this.dir[3 * i], this.dir[3 * i + 1], this.dir[3 * i + 2]]; out.D = [this.D[3 * i], this.D[3 * i + 1], this.D[3 * i + 2]];
      return out;
    }
    const h = this.t[j] - this.t[i], s = clamp((t - this.t[i]) / h, 0, 1);
    const p0 = [this.r[3 * i], this.r[3 * i + 1], this.r[3 * i + 2]], p1 = [this.r[3 * j], this.r[3 * j + 1], this.r[3 * j + 2]];
    const v0 = [this.v[3 * i], this.v[3 * i + 1], this.v[3 * i + 2]], v1 = [this.v[3 * j], this.v[3 * j + 1], this.v[3 * j + 2]];
    const hs = hermite(p0, v0, p1, v1, h, s);
    out.r = hs.r; out.v = hs.v;
    out.m = this.m[i] + (this.m[j] - this.m[i]) * s;
    out.T = this.T[i];
    out.dir = [this.dir[3 * i], this.dir[3 * i + 1], this.dir[3 * i + 2]];
    out.D = vlerp([this.D[3 * i], this.D[3 * i + 1], this.D[3 * i + 2]], [this.D[3 * j], this.D[3 * j + 1], this.D[3 * j + 2]], s);
    out.extra = s < 0.5 ? this.extra[i] : this.extra[j];
    return out;
  }
}
class ConicSeg {
  constructor(ref, t0, t1, r0, v0, m, meta = {}) { this.type = 'conic'; this.ref = ref; this.t0 = t0; this.t1 = t1; this.r0 = vcopy(r0); this.v0 = vcopy(v0); this.mu = BODIES[ref].mu; this.mconst = m; this.meta = meta; }
  stateAt(t) { const s = kepProp(this.r0, this.v0, t - this.t0, this.mu); return { ref: this.ref, r: s.r, v: s.v, m: this.mconst, T: 0, dir: [0, 0, 0], D: [0, 0, 0], extra: this.meta.extra || {} }; }
}
// impulsive burn rendered as a finite burn: blends pre- and post-burn conics around tc
class BurnSeg {
  constructor(ref, tc, dur, r, vPre, vPost, m0, m1, thrust, meta = {}) {
    this.type = 'burn'; this.ref = ref; this.tc = tc; this.t0 = tc - dur / 2; this.t1 = tc + dur / 2;
    this.r = vcopy(r); this.vPre = vcopy(vPre); this.vPost = vcopy(vPost); this.mu = BODIES[ref].mu; this.m0 = m0; this.m1 = m1; this.thrust = thrust; this.meta = meta;
    this.dvDir = vunit(vsub(vPost, vPre));
  }
  stateAt(t) {
    const a = kepProp(this.r, this.vPre, t - this.tc, this.mu), b = kepProp(this.r, this.vPost, t - this.tc, this.mu);
    const w = smoothstep((t - this.t0) / Math.max(this.t1 - this.t0, 1e-6));
    const f = clamp((t - this.t0) / Math.max(this.t1 - this.t0, 1e-6), 0, 1);
    return { ref: this.ref, r: vlerp(a.r, b.r, w), v: vlerp(a.v, b.v, w), m: this.m0 + (this.m1 - this.m0) * f, T: this.thrust, dir: this.dvDir, D: [0, 0, 0], extra: this.meta.extra || {} };
  }
}
class SurfaceSeg {
  constructor(ref, t0, t1, lat, lon, elev, m, meta = {}) { this.type = 'surface'; this.ref = ref; this.t0 = t0; this.t1 = t1; this.lat = lat; this.lon = lon; this.elev = elev || 0; this.mconst = m; this.meta = meta; }
  stateAt(t) {
    const r = sitePosEcl(this.ref, this.lat, this.lon, this.elev + 0.002, t);
    const m = this.m1 != null ? this.m0 + (this.m1 - this.m0) * clamp((t - this.t0) / Math.max(this.t1 - this.t0, 1e-9), 0, 1) : this.mconst;
    return { ref: this.ref, r, v: vcross(bodyOmegaEcl(this.ref, t), r), m, T: 0, dir: vunit(r), D: [0, 0, 0], extra: { phase: 'on surface', alt: 0, ...(this.meta.extra || {}) }, surface: true };
  }
}
class MObject {
  constructor(id, name, opts = {}) {
    this.id = id; this.name = name; this.segs = []; this.configs = []; this.kind = opts.kind || 'craft';
    this.color = opts.color || '#7fd1ff'; this.model = opts.model || 'generic'; this.crew = opts.crew || 0; this.trail = opts.trail !== false; this.primary = !!opts.primary;
    this.labelPriority = opts.labelPriority || 1;
  }
  add(seg) { if (seg && seg.t1 > seg.t0 - 1e-9) this.segs.push(seg); return seg; }
  get t0() { return this.segs.length ? this.segs[0].t0 : Infinity; }
  get t1() { return this.segs.length ? this.segs[this.segs.length - 1].t1 : -Infinity; }
  setConfig(t, key, label) { this.configs.push({ t, key, label }); this.configs.sort((a, b) => a.t - b.t); }
  configAt(t) { let c = this.configs[0]; for (const x of this.configs) if (x.t <= t) c = x; else break; return c; }
  segAt(t) {
    const s = this.segs; if (!s.length) return null;
    if (t < s[0].t0 || t > s[s.length - 1].t1) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].t0 <= t) lo = m; else hi = m - 1; }
    return s[lo];
  }
  stateAt(t) { const sg = this.segAt(t); if (!sg) return null; const st = sg.stateAt(Math.min(Math.max(t, sg.t0), sg.t1)); st.seg = sg; return st; }
}
class Mission {
  constructor(cfg) {
    this.cfg = cfg; this.name = cfg.name; this.objects = []; this.events = []; this.burns = []; this.phases = []; this.warnings = []; this.notes = [];
    this.t0 = isoToT(cfg.launch); this.tEnd = this.t0 + 3600;
    this.summary = {};
  }
  obj(id) { return this.objects.find(o => o.id === id); }
  addObj(o) { this.objects.push(o); return o; }
  ev(t, objId, name, desc, kind = 'info', extra = {}) { this.events.push({ t, obj: objId, name, desc, kind, ...extra }); }
  phase(t0, t1, name, color) { this.phases.push({ t0, t1, name, color }); }
  burn(b) { this.burns.push(b); }
  finalize() {
    this.events.sort((a, b) => a.t - b.t);
    for (const o of this.objects) o.segs.sort((a, b) => a.t0 - b.t0);
    let tEnd = this.t0; for (const o of this.objects) if (o.primary || o.kind === 'craft') tEnd = Math.max(tEnd, o.t1);
    this.tEnd = Math.max(this.tEnd, tEnd);
    this.phases.sort((a, b) => a.t0 - b.t0);
  }
}
// rocket-equation helpers
const propForDv = (m0, dvKms, isp) => m0 * (1 - Math.exp(-dvKms * 1000 / (isp * G0)));
const dvForProp = (m0, mp, isp) => isp * G0 * Math.log(m0 / Math.max(m0 - mp, 1e-9)) / 1000;
// convert integrator output (geocentric etc.) into samples
function integToSamples(res, extraFn, every = 0) {
  const out = []; let last = -Infinity;
  for (let i = 0; i < res.t.length; i++) {
    const t = res.t[i]; if (every > 0 && t - last < every && i !== res.t.length - 1) continue;
    const y = res.y[i];
    const s = { t, r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]], m: y[6] };
    if (extraFn) Object.assign(s, extraFn(t, y, i));
    out.push(s); last = t;
  }
  return out;
}
// resample a SampleSeg-like set of samples from analytic propagation for display (conics are evaluated analytically anyway)
