// ============================================================================
// HUD map: where the spacecraft is in the Solar System. Top-down view of the
// ecliptic (north up, vernal equinox to the right) at three scales — the inner
// Solar System, the Earth–Moon system and the Mars system — chosen
// automatically from the body whose gravity dominates, or picked by hand.
// ============================================================================
const MM = { view: 'auto', drawn: 0, lastT: null, lastKey: '', paths: {}, rmax: {}, orbits: {}, moonOrb: null, moonOrbT: null, hits: [], flybyPts: null, burnPts: {} };
const PLANET_LIST = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const MM_TITLES = { sun: 'Solar System', earth: 'Earth–Moon', mars: 'Mars system', track: 'Ground track' };
function initMinimap() {
  $$('#minimap [data-mm]').forEach(b => b.addEventListener('click', () => { MM.view = b.dataset.mm; $$('#minimap [data-mm]').forEach(x => x.classList.toggle('on', x === b)); MM.lastT = null; }));
  $('#mmCollapse').addEventListener('click', () => { const c = !$('#app').classList.contains('mm-collapsed'); $('#app').classList.toggle('mm-collapsed', c); lsSet('mstudio-mm-collapsed', c); MM.lastT = null; setMMH(); });
  if (lsGet('mstudio-mm-collapsed', false)) $('#app').classList.add('mm-collapsed');
  $('#mmc').addEventListener('click', e => {
    const r = $('#mmc').getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 16;
    for (const hh of MM.hits) { const d = Math.hypot(hh.x - x, hh.y - y); if (d < bd) { bd = d; best = hh; } }
    if (best) { setTarget(best.id); if (best.id.startsWith('body:') && CAM.mode !== 'orbit') setMode('orbit'); }
  });
  const ro = () => setMMH(); try { new ResizeObserver(ro).observe($('#minimap')); } catch (e) { window.addEventListener('resize', ro); }
  setMMH();
}
function setMMH() { const el = $('#minimap'); const vis = el && el.offsetParent !== null && getComputedStyle(el).position === 'absolute'; document.documentElement.style.setProperty('--mmH', vis ? Math.round(el.getBoundingClientRect().height + 8) + 'px' : '0px'); }
function resetMinimap() {
  MM.paths = {}; MM.rmax = {}; MM.orbits = {}; MM.moonOrb = null; MM.lastT = null; MM.flybyPts = null; MM.burnPts = {};
  const leo = !!(MV.md && (MV.md.cfg.profile || '').startsWith('leo')); // the ground track for Earth-orbit flights, Mars for the others
  const bt = $('#minimap [data-mm="track"]'), bm = $('#minimap [data-mm="mars"]'); if (bt) bt.hidden = !leo; if (bm) bm.hidden = leo;
  if ((leo && MM.view === 'mars') || (!leo && MM.view === 'track')) { MM.view = 'auto'; $$('#minimap [data-mm]').forEach(x => x.classList.toggle('on', x.dataset.mm === 'auto')); }
}
function shipTrail() { return MV.trails.find(tr => tr.o.id === 'ship'); }
function mmViewFor(t) {
  if (MM.view !== 'auto') return MM.view;
  if ((MV.md.cfg.profile || '').startsWith('leo')) return 'track'; // Earth-orbit flights: where on Earth the craft is
  const c = activeCraft(t) || craftById('ship'); if (!c || !c.P) return 'earth';
  const b = dominantBody(c.P, t); return b === 'sun' ? 'sun' : b === 'mars' ? 'mars' : 'earth';
}
function mmCoords(view, tr) { return view === 'sun' ? tr.P : tr.frameCoords(view); }
function mmRmax(view) {
  if (MM.rmax[view]) return MM.rmax[view];
  const tr = shipTrail(); let r;
  if (view === 'sun') { r = 1.72 * AU; if (tr) for (let i = 0; i < tr.ts.length; i++) { const d = Math.hypot(tr.P[3 * i], tr.P[3 * i + 1]); if (d > r / 1.06) r = d * 1.06; } r = Math.min(r, 10.5 * AU); }
  else {
    const cap = view === 'earth' ? 1.8e6 : 9e5; r = view === 'earth' ? 4.3e5 : 2.7e4;
    if (tr) {
      const F = mmCoords(view, tr);
      // around Mars, frame the orbits once captured (or the flyby close to periapsis), not the long approach leg
      let tFrom = -Infinity, dMin = Infinity;
      if (view === 'mars') { const cap1 = MV.md.burns.find(b => /MOI|capture|insertion/i.test(b.name) && b.t > MV.md.M.t0 + 86400); if (cap1) tFrom = cap1.t; for (let i = 0; i < tr.ts.length; i++) dMin = Math.min(dMin, Math.hypot(F[3 * i], F[3 * i + 1], F[3 * i + 2])); }
      for (let i = 0; i < tr.ts.length; i++) { if (tr.ts[i] < tFrom) continue; const d = Math.hypot(F[3 * i], F[3 * i + 1]); if (d < cap && d * 1.08 > r) r = d * 1.08; }
      if (view === 'mars' && tFrom === -Infinity && isFinite(dMin)) r = Math.max(2.7e4, dMin * 7);
    }
  }
  MM.rmax[view] = r; return r;
}
function mmPath(view) { // decimated ecliptic-plane polyline of the primary craft's whole flight, in km, with engine-on flags
  const byPhase = !!MV.layers.phasecol, key = view + (byPhase ? ':ph' : '');
  if (MM.paths[key]) return MM.paths[key];
  const tr = shipTrail(); const out = { x: [], y: [], t: [], b: [], p: [], c: [] }; if (!tr) return out;
  const F = mmCoords(view, tr), Rm = mmRmax(view), tol = Rm / 260; let lx = Infinity, ly = Infinity; const n = tr.ts.length;
  for (let i = 0; i < n; i++) {
    const x = F[3 * i], y = F[3 * i + 1]; const br = tr.brk[i], pw = tr.pw[i];
    const edge = (i > 0 && pw !== tr.pw[i - 1]) || (i + 1 < n && pw !== tr.pw[i + 1]); // keep every ignition and cutoff point
    if (br || edge || i === 0 || i === n - 1 || Math.abs(x - lx) + Math.abs(y - ly) > tol) {
      let col = PCOL.coast; if (byPhase) { const ph = MV.md.phaseAt(tr.ts[i]); if (ph && ph.color) col = ph.color; }
      out.x.push(x); out.y.push(y); out.t.push(tr.ts[i]); out.b.push(br); out.p.push(pw); out.c.push(col); lx = x; ly = y;
    }
  }
  MM.paths[key] = out; return out;
}
function mmBurnPts(view) { // the middle of each engine burn of the primary craft, in map coordinates
  if (MM.burnPts[view]) return MM.burnPts[view];
  const md = MV.md, out = [], ts = [], P = [];
  for (const x of md.powered) { if (x.obj !== 'ship') continue; const tm = (x.t0 + x.t1) / 2; const s = md.ship.stateAt(tm); if (!s || s.surface) continue; const H = planetHelio(s.ref, tm).r; ts.push(tm); P.push(H[0] + s.r[0], H[1] + s.r[1], H[2] + s.r[2]); out.push({ t: tm, x: 0, y: 0, name: x.name }); }
  const F = view === 'sun' ? P : toFrameArr(view, ts, P);
  out.forEach((o, i) => { o.x = F[3 * i]; o.y = F[3 * i + 1]; });
  MM.burnPts[view] = out; return out;
}
function planetOrbitPts(name, t) {
  const o = MM.orbits[name]; if (o && Math.abs(o.t - t) < 400 * DAY) return o.pts;
  const el = planetElemsAt(name === 'earth' ? 'emb' : name, t); const pts = [];
  for (let i = 0; i <= 180; i++) { const s = stateFromElemsM(el.a, el.e, el.i, el.Om, el.w, i / 180 * TAU, BODIES.sun.mu); pts.push(s.r[0], s.r[1]); }
  MM.orbits[name] = { t, pts }; return pts;
}
function regionText(rSun) {
  const a = PLANET_LIST.map(p => [p, planetElemsAt(p === 'earth' ? 'emb' : p, MV.tNow).a]);
  if (rSun < a[0][1]) return 'inside Mercury’s orbit';
  for (let i = 0; i + 1 < a.length; i++) if (rSun < a[i + 1][1]) return `between the orbits of ${BODIES[a[i][0]].name} and ${BODIES[a[i + 1][0]].name}`;
  return 'beyond Saturn’s orbit';
}
function drawMinimap(t, force) {
  const md = MV.md; const cv = $('#mmc'); if (!md || !cv || cv.offsetParent === null) return;
  const now = performance.now(); const view = mmViewFor(t);
  if (!force && now - MM.drawn < 100 && MM.lastT === t && MM.lastKey === view) return;
  MM.drawn = now; MM.lastT = t; MM.lastKey = view;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); const W = cv.clientWidth, Hh = cv.clientHeight; if (!W || !Hh) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
  if (view === 'track') { drawGroundTrack(g, W, Hh, t, now); return; }
  const cx = W / 2, cy = Hh / 2, Rm = mmRmax(view), k = (Math.min(W, Hh) / 2 - 10) / Rm;
  const center = view === 'sun' ? [0, 0, 0] : helio(view, t).r;
  const X = x => clamp(cx + x * k, -4000, 4000), Y = y => clamp(cy - y * k, -4000, 4000);
  MM.hits = [];
  $('#mmTitle').textContent = MM_TITLES[view] + (MM.view === 'auto' ? '' : ' · fixed');
  // background
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, Hh) * 0.7); bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#05080e'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  g.font = '10px "IBM Plex Sans Condensed", sans-serif'; g.textBaseline = 'middle';
  const dot = (x, y, r, col, label, id, labCol) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); if (label) { g.fillStyle = labCol || col; g.fillText(label, x + r + 3, y - 1); } if (id) MM.hits.push({ x, y, id }); };
  // reference rings / scale
  g.strokeStyle = 'rgba(120,140,170,.16)'; g.lineWidth = 1; g.setLineDash([2, 4]);
  if (view === 'sun') { for (let au = 1; au * AU < Rm; au += (Rm > 4 * AU ? 2 : 1)) { g.beginPath(); g.arc(cx, cy, au * AU * k, 0, TAU); g.stroke(); g.fillStyle = 'rgba(135,148,168,.55)'; g.fillText(`${au} AU`, cx + au * AU * k * 0.71 + 2, cy - au * AU * k * 0.71 - 6); } }
  else { const step = view === 'earth' ? (Rm > 9e5 ? 5e5 : 1e5) : (Rm > 2e5 ? 1e5 : Rm > 6e4 ? 2e4 : 1e4); for (let r = step; r < Rm; r += step) { g.beginPath(); g.arc(cx, cy, r * k, 0, TAU); g.stroke(); } g.fillStyle = 'rgba(135,148,168,.55)'; g.fillText(`rings every ${fx(step, 0)} km`, 8, Hh - 10); }
  g.setLineDash([]);
  // orbits and bodies
  if (view === 'sun') {
    for (const p of PLANET_LIST) {
      const a = planetElemsAt(p === 'earth' ? 'emb' : p, t).a; if (a > Rm * 1.05) continue;
      const pts = planetOrbitPts(p, t); g.strokeStyle = BODY_COLORS[p] + '55'; g.beginPath(); for (let i = 0; i < pts.length; i += 2) { const x = X(pts[i]), y = Y(pts[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
    const sg = g.createRadialGradient(cx, cy, 0, cx, cy, 14); sg.addColorStop(0, 'rgba(255,230,170,.9)'); sg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = sg; g.fillRect(cx - 14, cy - 14, 28, 28);
    dot(cx, cy, 3.5, '#ffd27a', null, 'body:sun');
    for (const p of PLANET_LIST) { const a = planetElemsAt(p === 'earth' ? 'emb' : p, t).a; if (a > Rm * 1.05) continue; const P = helio(p, t).r; dot(X(P[0]), Y(P[1]), p === 'earth' || p === 'mars' ? 3.6 : 2.8, BODY_COLORS[p], BODIES[p].name, 'body:' + p); }
  } else if (view === 'earth') {
    if (!MM.moonOrb || Math.abs(t - MM.moonOrbT) > 0.5 * DAY) { const pts = []; for (let i = 0; i <= 160; i++) { const m = moonGeo(t - 13.7 * DAY + i / 160 * 27.4 * DAY).r; pts.push(m[0], m[1]); } MM.moonOrb = pts; MM.moonOrbT = t; }
    g.strokeStyle = 'rgba(200,210,225,.35)'; g.beginPath(); MM.moonOrb.forEach((v, i) => { if (i % 2) return; const x = X(MM.moonOrb[i]), y = Y(MM.moonOrb[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    dot(cx, cy, Math.max(4.5, BODIES.earth.R * k), '#4f8dff', 'Earth', 'body:earth', '#9cc3ff');
    const Mo = moonGeo(t).r; dot(X(Mo[0]), Y(Mo[1]), Math.max(3, BODIES.moon.R * k), '#cfd3d8', 'Moon', 'body:moon');
  } else {
    const pole = bodyPoleEcl('mars', t); const e1 = vperp(pole), e2 = vcross(pole, e1);
    for (const [nm, a] of [['Phobos', 9376], ['Deimos', 23463]]) { if (a > Rm * 1.1) continue; g.strokeStyle = 'rgba(200,170,150,.3)'; g.beginPath(); for (let i = 0; i <= 96; i++) { const th = i / 96 * TAU; const p = vadd(vscale(e1, a * Math.cos(th)), vscale(e2, a * Math.sin(th))); const x = X(p[0]), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.fillStyle = 'rgba(200,170,150,.6)'; g.fillText(nm, cx + a * k * 0.72 + 3, cy + a * k * 0.72); }
    dot(cx, cy, Math.max(5, BODIES.mars.Rmean * k), '#ff8a5c', 'Mars', 'body:mars');
  }
  if (view !== 'sun') { // direction of the Sun
    const sd = vunit(vscale(center, -1)); const ang = Math.atan2(sd[1], sd[0]); const rr = Math.min(W, Hh) / 2 - 12;
    const ax = cx + Math.cos(ang) * rr, ay = cy - Math.sin(ang) * rr; g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(ax, ay, 3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,210,122,.45)'; g.beginPath(); g.moveTo(cx + Math.cos(ang) * (rr - 22), cy - Math.sin(ang) * (rr - 22)); g.lineTo(ax - Math.cos(ang) * 6, ay + Math.sin(ang) * 6); g.stroke();
    g.fillStyle = 'rgba(255,210,122,.8)'; g.fillText('Sun', ax + (Math.cos(ang) > 0 ? -22 : 6), ay + (Math.sin(ang) > 0 ? 10 : -10));
  }
  // flight path: flown part bright, the plan ahead dim; engine burns thick orange, coasting thin blue
  const pth = mmPath(view); const n = pth.x.length;
  if (n > 1) {
    let iNow = 0; while (iNow + 1 < n && pth.t[iNow + 1] <= t) iNow++;
    const runs = (from, to, fut) => { // segments i → i+1 for i in [from, to), batched by style
      let i = from;
      while (i < to) {
        const pw = pth.p[i], col = pth.c[i]; let j = i;
        g.beginPath(); g.moveTo(X(pth.x[i]), Y(pth.y[i]));
        while (j < to && pth.p[j] === pw && pth.c[j] === col) { const x = X(pth.x[j + 1]), y = Y(pth.y[j + 1]); pth.b[j + 1] ? g.moveTo(x, y) : g.lineTo(x, y); j++; }
        if (pw) { g.setLineDash([]); g.lineWidth = fut ? 2.4 : 3.2; g.strokeStyle = fut ? hexA(PCOL.burn, 0.6) : PCOL.burn; }
        else { g.setLineDash(fut ? [3, 3] : []); g.lineWidth = fut ? 1 : 1.6; g.strokeStyle = fut ? hexA(col, 0.42) : col; }
        g.stroke(); i = j;
      }
      g.setLineDash([]);
    };
    g.lineCap = 'round'; runs(iNow, n - 1, true); runs(0, iNow, false); g.lineCap = 'butt'; g.lineWidth = 1;
    // a dot for every burn (filled once fired, a ring while ahead) — even a few-second correction shows up
    const rBody = view === 'sun' ? 0 : Math.max(view === 'earth' ? 4.5 : 5, (view === 'earth' ? BODIES.earth.R : BODIES.mars.Rmean) * k) + 2;
    for (const b of mmBurnPts(view)) {
      const x = X(b.x), y = Y(b.y); if (Math.hypot(x - cx, y - cy) < rBody || x < 0 || y < 0 || x > W || y > Hh) continue;
      g.beginPath(); g.arc(x, y, 2.9, 0, TAU);
      if (b.t <= t) { g.fillStyle = PCOL.burn; g.fill(); g.strokeStyle = 'rgba(5,8,14,.9)'; g.lineWidth = 1; g.stroke(); }
      else { g.strokeStyle = hexA(PCOL.burn, 0.85); g.lineWidth = 1.3; g.stroke(); g.lineWidth = 1; }
    }
  }
  if (view === 'sun') { // gravity-assist and arrival markers
    if (!MM.flybyPts) { MM.flybyPts = []; for (const e of md.events) if (['flyby', 'landing', 'touchdown'].includes(e.kind) || (e.kind === 'burn' && /insertion|MOI|capture/i.test(e.name))) { const s = md.ship.stateAt(e.t); if (s) { const P = vadd(planetHelio(s.ref, e.t).r, s.r); MM.flybyPts.push({ x: P[0], y: P[1], kind: e.kind, name: e.name }); } } }
    for (const f of MM.flybyPts) { g.strokeStyle = f.kind === 'flyby' ? '#b896ff' : '#ff6767'; g.beginPath(); g.arc(X(f.x), Y(f.y), 5, 0, TAU); g.stroke(); }
  }
  // the craft(s)
  const crafts = [craftById('ship'), activeCraft(t)].filter((c, i, A) => c && c.P && A.indexOf(c) === i);
  for (const c of crafts) {
    const p = vsub(c.P, center); let x = cx + p[0] * k, y = cy - p[1] * k;
    const off = x < 4 || x > W - 4 || y < 4 || y > Hh - 4;
    const prim = c.o.id === 'ship';
    if (off) { const ang = Math.atan2(cy - y, x - cx); x = cx + Math.cos(ang) * (Math.min(W, Hh) / 2 - 8); y = cy - Math.sin(ang) * (Math.min(W, Hh) / 2 - 8); }
    const v = c.Vh ? vsub(c.Vh, view === 'sun' ? [0, 0, 0] : helio(view, t).v) : null;
    const burning = !!(c.s && c.s.T > 0 && (!c.s.surface || c.s.pad));
    const pulse = burning ? 6 + 4 * (0.5 + 0.5 * Math.sin(now / 120)) : 5 + 3 * (0.5 + 0.5 * Math.sin(now / 260));
    g.strokeStyle = burning ? hexA(PCOL.burn, 0.8) : prim ? 'rgba(255,181,71,.55)' : 'rgba(127,209,255,.55)'; g.beginPath(); g.arc(x, y, pulse, 0, TAU); g.stroke();
    g.fillStyle = burning ? PCOL.burn : prim ? '#ffb547' : '#7fd1ff'; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.fill();
    if (v && vnorm(v) > 1e-6 && !off) { const vd = vunit(v); g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(x, y); g.lineTo(x + vd[0] * 14, y - vd[1] * 14); g.stroke(); }
    if (off) { g.fillStyle = '#ffb547'; g.fillText('off map →', clamp(x - 52, 4, W - 60), y + (y > cy ? -10 : 10)); }
    MM.hits.push({ x, y, id: 'obj:' + c.o.id });
  }
  // locator inset: where this local system is around the Sun
  if (view !== 'sun') {
    const ix = W - 34, iy = 34, ir = 26; g.fillStyle = 'rgba(5,8,14,.85)'; g.strokeStyle = 'rgba(120,140,170,.35)'; g.beginPath(); g.arc(ix, iy, ir + 3, 0, TAU); g.fill(); g.stroke();
    const ik = ir / (1.7 * AU);
    for (const p of ['earth', 'mars']) { const pts = planetOrbitPts(p, t); g.strokeStyle = BODY_COLORS[p] + '66'; g.beginPath(); for (let i = 0; i < pts.length; i += 2) { const x = ix + pts[i] * ik, y = iy - pts[i + 1] * ik; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(ix, iy, 2, 0, TAU); g.fill();
    for (const p of ['earth', 'mars']) { const P = helio(p, t).r; g.fillStyle = BODY_COLORS[p]; g.beginPath(); g.arc(ix + P[0] * ik, iy - P[1] * ik, p === view ? 2.8 : 1.8, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(135,148,168,.8)'; g.fillText('Sun', ix - 8, iy + ir + 10);
  }
  g.fillStyle = 'rgba(135,148,168,.5)'; g.textAlign = 'right'; g.fillText('ecliptic · north up · ♈ →', W - 6, Hh - 10); g.textAlign = 'left';
  // legend: engine burn vs coasting (skipped on the small phone-size map)
  if (W >= 220) {
  g.fillStyle = 'rgba(5,8,14,.6)'; g.fillRect(4, 4, 78, 30);
  g.lineCap = 'round'; g.strokeStyle = PCOL.burn; g.lineWidth = 3.2; g.beginPath(); g.moveTo(10, 12); g.lineTo(22, 12); g.stroke();
  g.strokeStyle = MV.layers.phasecol ? 'rgba(195,205,218,.8)' : PCOL.coast; g.lineWidth = 1.6; g.beginPath(); g.moveTo(10, 26); g.lineTo(22, 26); g.stroke(); g.lineCap = 'butt'; g.lineWidth = 1;
  g.fillStyle = 'rgba(205,214,226,.85)'; g.fillText('engine burn', 28, 12); g.fillText('coasting', 28, 26);
  }
  // where are we, in words
  const c = activeCraft(t) || craftById('ship'); const info = $('#mmInfo');
  if (c && c.P) {
    const dS = vnorm(c.P), dE = vnorm(vsub(c.P, helio('earth', t).r)), dMo = vnorm(vsub(c.P, helio('moon', t).r)), dMa = vnorm(vsub(c.P, helio('mars', t).r));
    const dom = dominantBody(c.P, t); let txt;
    if (dom === 'sun') { const dest = nextDestination(md, t, 'sun'); txt = `Interplanetary space, ${regionText(dS)} · ${fDist(dS)} from the Sun · ${fDist(dE)} from Earth${dest && dest !== 'earth' ? ` · ${fDist(vnorm(vsub(c.P, helio(dest, t).r)))} to ${BODIES[dest].name}` : ''}`; }
    else if (dom === 'moon') txt = `Inside the Moon’s sphere of influence · ${fDist(dMo - BODIES.moon.R)} above the Moon · ${fDist(dE)} from Earth`;
    else if (dom === 'earth') txt = `Earth–Moon space · ${fDist(dE)} from Earth’s centre · ${fDist(dMo)} from the Moon`;
    else txt = `Inside Mars’s sphere of influence · ${fDist(dMa - BODIES.mars.Rmean)} above Mars · ${fDist(dE)} from Earth`;
    const who = c.o.id === 'ship' ? '' : c.o.name + ': ';
    if (info.textContent !== who + txt) info.textContent = who + txt;
  }
}

// ---------------- ground track (Earth-orbit flights) ----------------
// The world map (equirectangular, the planet texture itself) with night shaded, the flight's ground track about an
// orbit and a half behind and one ahead, the launch site and the landing runway.
function mmEarthImage() { if (!MM.earthImg) { MM.earthImg = new Image(); MM.earthImg.src = ASSET('earth_day.jpg'); } return MM.earthImg.complete && MM.earthImg.naturalWidth ? MM.earthImg : null; }
function mmNight(t) { // 180 × 90 night overlay with a soft terminator, recomputed every few minutes of mission time
  if (MM.night && Math.abs(MM.night.t - t) < 240) return MM.night.cv;
  const cv = MM.night ? MM.night.cv : document.createElement('canvas'); cv.width = 180; cv.height = 90; const g = cv.getContext('2d'), img = g.createImageData(180, 90);
  const sun = mvec(mT(bodyFixedToEcl('earth', t)), vunit(vscale(planetHelio('earth', t).r, -1)));
  for (let j = 0; j < 90; j++) { const la = (89.5 - 2 * j) * DEG; for (let i = 0; i < 180; i++) { const lo = (-179 + 2 * i) * DEG;
    const c = Math.cos(la) * Math.cos(lo) * sun[0] + Math.cos(la) * Math.sin(lo) * sun[1] + Math.sin(la) * sun[2];
    const o = 4 * (j * 180 + i); img.data[o] = 4; img.data[o + 1] = 8; img.data[o + 2] = 22; img.data[o + 3] = Math.round(175 * clamp((0.08 - c) / 0.16, 0, 1)); } }
  g.putImageData(img, 0, 0); MM.night = { t, cv }; return cv;
}
function drawGroundTrack(g, W, Hh, t, now) {
  const md = MV.md, mw = Math.min(W, 2 * Hh), mh = mw / 2, x0 = (W - mw) / 2, y0 = (Hh - mh) / 2;
  const X = lon => x0 + ((lon + 180) / 360) * mw, Y = lat => y0 + ((90 - lat) / 180) * mh;
  MM.hits = []; $('#mmTitle').textContent = MM_TITLES.track + (MM.view === 'auto' ? '' : ' · fixed');
  g.fillStyle = '#05080e'; g.fillRect(0, 0, W, Hh);
  const img = mmEarthImage(); if (img) { g.globalAlpha = 0.85; g.drawImage(img, x0, y0, mw, mh); g.globalAlpha = 1; } else { g.fillStyle = '#0d2340'; g.fillRect(x0, y0, mw, mh); }
  g.imageSmoothingEnabled = true; g.drawImage(mmNight(t), x0, y0, mw, mh);
  g.strokeStyle = 'rgba(200,215,235,.12)'; g.lineWidth = 1; g.beginPath(); for (let lo = -150; lo <= 150; lo += 30) { g.moveTo(X(lo), y0); g.lineTo(X(lo), y0 + mh); } for (let la = -60; la <= 60; la += 30) { g.moveTo(x0, Y(la)); g.lineTo(x0 + mw, Y(la)); } g.stroke();
  g.font = '10px "IBM Plex Sans Condensed", sans-serif'; g.textBaseline = 'middle';
  const ship = craftById('ship'), o = ship && ship.o; if (!o) return;
  const ll = (obj, tt) => { const s = obj.stateAt(tt); return s && s.ref === 'earth' ? subPointLL('earth', s.r, tt) : null; };
  // ground track: an orbit and a half behind (solid), one ahead (dashed)
  const P = 5560, ta = Math.max(o.t0, t - 1.5 * P), tb = Math.min(o.t1, t + P), step = 30;
  const seg = (from, to, past) => {
    g.beginPath(); let prev = null; const n = Math.max(1, Math.ceil((to - from) / step));
    for (let i = 0; i <= n; i++) { const tt = from + (to - from) * i / n, p = ll(o, tt); if (!p) { prev = null; continue; } const x = X(p[1]), y = Y(p[0]); if (!prev || Math.abs(p[1] - prev[1]) > 180) g.moveTo(x, y); else g.lineTo(x, y); prev = p; } // break at the date line
    g.setLineDash(past ? [] : [3, 3]); g.strokeStyle = past ? 'rgba(255,181,71,.95)' : 'rgba(99,199,255,.75)'; g.lineWidth = past ? 1.6 : 1.1; g.stroke(); g.setLineDash([]);
  };
  if (t > ta) seg(ta, Math.min(t, tb), true); if (MV.layers.future !== false && tb > t) seg(Math.max(t, ta), tb, false);
  // sites
  const site = (lat, lon, col, lab) => { const x = X(lon), y = Y(lat); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.stroke(); if (lab && mw >= 220) { g.fillStyle = col; g.fillText(lab, x + 5, y + (lat > 30 ? 7 : -7)); } };
  const S = LAUNCH_SITES[md.cfg.site]; if (S) site(S.lat, S.lon, '#ffd166', 'KSC');
  const rw = md.cfg.runway && RUNWAYS[md.cfg.runway]; if (rw && !(S && Math.abs(rw.lat - S.lat) < 1 && Math.abs(rw.lon - S.lon) < 1)) site(rw.lat, rw.lon, '#f15bb5', rw.short.split(' ')[0]);
  // other craft (station, telescope) and the orbiter
  for (const c of MV.crafts) { if (c.o.id === 'ship' || c.o.kind !== 'craft' || !c.P || !c.s) continue; const p = ll(c.o, t); if (!p) continue; const x = X(p[1]), y = Y(p[0]); g.fillStyle = '#9fd3ff'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); if (mw >= 220) g.fillText(c.o.id === 'iss' ? 'ISS' : c.o.name.split(' ')[0], x + 5, y - 7); MM.hits.push({ x, y, id: 'obj:' + c.o.id }); }
  const p = ship.s && ship.s.ref === 'earth' ? subPointLL('earth', ship.s.r, t) : (t < o.t0 && S ? [S.lat, S.lon] : null);
  if (p) {
    const x = X(p[1]), y = Y(p[0]), burning = !!(ship.s && ship.s.T > 0);
    const pulse = burning ? 6 + 4 * (0.5 + 0.5 * Math.sin(now / 120)) : 5 + 3 * (0.5 + 0.5 * Math.sin(now / 260));
    g.strokeStyle = burning ? hexA(PCOL.burn, 0.8) : 'rgba(255,181,71,.6)'; g.beginPath(); g.arc(x, y, pulse, 0, TAU); g.stroke();
    g.fillStyle = burning ? PCOL.burn : '#ffb547'; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.fill();
    MM.hits.push({ x, y, id: 'obj:ship' });
  }
  g.fillStyle = 'rgba(135,148,168,.6)'; g.textAlign = 'right'; g.fillText('night shaded', W - 6, Hh - 9); g.textAlign = 'left';
  // in words
  const info = $('#mmInfo'); const s = ship.s;
  if (s && p) { const alt = vnorm(s.r) - BODIES.earth.R; const txt = s.surface || s.pad ? `On the ground · ${fLat(p[0])} ${fLon(p[1])}` : `${fDist(Math.max(alt, 0))} up over ${fLat(p[0])} ${fLon(p[1])} · ${t < o.t0 + 600 ? 'climbing to orbit' : 'orbit ' + (1 + Math.floor((t - md.M.t0) / P))}`; if (info.textContent !== txt) info.textContent = txt; }
}
