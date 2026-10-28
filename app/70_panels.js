// ============================================================================
// Panels: event log, Δv & fuel budget, mission sheet, timeline, captions,
// storyboard shots and contact sheet.
// ============================================================================
const KIND_LABEL = { launch: 'launch', ascent: 'ascent', maxq: 'max-Q', staging: 'staging', ignition: 'ignition', jettison: 'jettison', insertion: 'orbit', burn: 'burn', sep: 'separation', soi: 'gravity', los: 'radio', flyby: 'flyby', record: 'record', photo: 'photo', info: 'note', emergency: 'emergency', entry: 'entry', skip: 'entry', chute: 'parachute', blackout: 'radio', heat: 'heating', gload: 'g-load', landing: 'landing', touchdown: 'landing', powered: 'descent', skycrane: 'descent', dock: 'docking', refill: 'refilling', isru: 'ISRU', fail: 'failure', approach: 'descent', terminal: 'descent', trim: 'entry', deploy: 'deploy' };
const EVF = { all: () => true, key: e => !['ascent', 'heat', 'gload', 'blackout', 'los', 'soi', 'approach', 'terminal'].includes(e.kind), burns: e => ['burn', 'ignition', 'staging', 'sep', 'jettison', 'insertion', 'powered', 'dock', 'launch', 'refill'].includes(e.kind), photo: e => ['photo', 'info', 'record', 'flyby', 'emergency', 'landing', 'touchdown'].includes(e.kind) };
const PANEL = { evFilter: 'key', curEv: -2, userScroll: 0 };
function buildEventsPanel() {
  const md = MV.md; const pane = $('#tab-events'); pane.innerHTML = '';
  const fl = h('div', { class: 'filter' }, ...[['key', 'Key events'], ['all', 'All'], ['burns', 'Burns & staging'], ['photo', 'Story moments']].map(([k, l]) => h('button', { class: PANEL.evFilter === k ? 'on' : '', onclick: () => { PANEL.evFilter = k; buildEventsPanel(); } }, l)));
  pane.append(fl);
  const list = h('div', { id: 'evList' }); pane.append(list);
  md.events.forEach((e, i) => {
    if (!EVF[PANEL.evFilter](e)) return;
    const obj = md.M.obj(e.obj); const objName = obj && obj.id !== 'ship' ? obj.name : '';
    const row = h('div', { class: `ev kind-${e.kind}`, dataset: { i } },
      h('div', { class: 'em' }, fMET(e.t - md.M.t0)),
      h('div', { class: 'en' }, h('span', null, e.name), h('span', { class: 'kind' }, KIND_LABEL[e.kind] || e.kind)),
      h('div', { class: 'ed' }, e.desc, e.gaNote ? h('div', { style: 'color:var(--cyan);margin-top:3px' }, e.gaNote) : null, h('div', { class: 'obj' }, fmtUTC(e.t) + ' UTC' + (objName ? ' · ' + objName : ''))));
    row.addEventListener('click', () => { jumpToEvent(e); row.classList.toggle('open'); });
    list.append(row);
  });
  list.addEventListener('wheel', () => { PANEL.userScroll = performance.now(); }, { passive: true });
  list.addEventListener('touchmove', () => { PANEL.userScroll = performance.now(); }, { passive: true });
  PANEL.curEv = -2;
}
function updateEventsPanel(t) {
  const md = MV.md; if (!md) return;
  let ci = -1; for (let i = 0; i < md.events.length; i++) if (md.events[i].t <= t + 0.01) ci = i; else break;
  if (ci === PANEL.curEv) return; PANEL.curEv = ci;
  const rows = $$('#evList .ev'); let curRow = null;
  for (const r of rows) { const i = +r.dataset.i; r.classList.toggle('future', i > ci); r.classList.remove('cur'); if (i <= ci) curRow = r; }
  if (curRow) { curRow.classList.add('cur'); if (performance.now() - PANEL.userScroll > 6000 && !$('#tab-events').hidden) { const pane = $('#tab-events'); const top = curRow.offsetTop - pane.clientHeight * 0.35; pane.scrollTo({ top, behavior: 'smooth' }); } }
}
function jumpToEvent(e) {
  const lead = ['launch'].includes(e.kind) ? 15 : ['flyby', 'landing', 'touchdown', 'entry', 'photo', 'info', 'emergency', 'record', 'soi'].includes(e.kind) ? 25 : 6;
  setTime(e.t - lead); STATE.lastCaptionEv = -1;
  if (STATE.auto) STATE.rateTarget = 1;
}
// ---------------- Δv & fuel ----------------
function buildBudgetPanel() {
  const md = MV.md; const M = md.M; const L = md.L; const pane = $('#tab-budget'); pane.innerHTML = '';
  const liftoffMass = (() => { let m = scTotalMass(md.SC); for (const s of L.stages) m += s.dry + s.propMass; m += L.jettison.reduce((a, j) => a + j.mass, 0); return m; })();
  const liftoffThrust = L.stages.filter((s, i) => i === 0 || (L.stages[0].parallel && i === 1 && !s.ignition)).reduce((a, s) => a + s.thrustSL, 0);
  const lvProp = L.stages.reduce((a, s) => a + s.propMass, 0);
  const scProp = md.burns.reduce((a, b) => a + (b.prop || 0), 0);
  const dvTot = md.burns.reduce((a, b) => a + (b.dv || 0), 0);
  pane.append(h('h3', { class: 'h' }, 'Launch'),
    h('div', { class: 'kv' },
      h('div', { class: 'k' }, 'Liftoff mass'), h('div', { class: 'v' }, fMass(liftoffMass)),
      h('div', { class: 'k' }, 'Liftoff thrust'), h('div', { class: 'v' }, fForce(liftoffThrust)),
      h('div', { class: 'k' }, 'Thrust-to-weight at liftoff'), h('div', { class: 'v' }, (liftoffThrust / (liftoffMass * G0)).toFixed(2)),
      h('div', { class: 'k' }, 'Launch-vehicle propellant'), h('div', { class: 'v' }, fMass(lvProp)),
      h('div', { class: 'k' }, 'Δv delivered by ascent'), h('div', { class: 'v' }, fx(md.ascentDv, 0) + ' m/s'),
      md.cfg.refill ? [h('div', { class: 'k' }, 'Refilled in orbit'), h('div', { class: 'v' }, fMass(md.cfg.refill.to) + ` (${md.cfg.refill.tankers} tankers)`)] : null));
  const stTable = h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', { style: 'text-align:right' }, 'Loaded · burn'))),
    h('tbody', null, ...L.stages.map(s => { const mdot = s.thrustVac / (s.ispVac * G0); return h('tr', null, h('td', null, h('b', null, s.name), h('div', { class: 'note-s' }, `${s.n} × ${s.engine} · ${(PROP[s.prop] || {}).label}`), h('div', { class: 'note-s' }, `${fForce(s.thrustSL)} sea level / ${fForce(s.thrustVac)} vacuum · Isp ${s.ispSL}/${s.ispVac} s`)), h('td', { class: 'n' }, fMass(s.propMass), h('div', { class: 'note-s' }, fTime(s.propMass / mdot)))); })));
  pane.append(h('div', { class: 'scroll-x' }, stTable));
  pane.append(h('h3', { class: 'h' }, 'Spacecraft & upper-stage burns'));
  const bt = h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Burn'), h('th', { style: 'text-align:right' }, 'Δv · propellant'))),
    h('tbody', null, ...md.burns.map(b => { const tr = h('tr', { class: 'click' }, h('td', null, h('b', null, b.name), h('div', { class: 'note-s mono' }, fMET(b.t - M.t0) + ' · ' + fTime(b.dur)), h('div', { class: 'note-s' }, `${b.engine} · ${(PROP[b.propType] || {}).label || b.propType || ''}${b.obj !== 'ship' ? ' · ' + (M.obj(b.obj) || {}).name : ''}`)), h('td', { class: 'n' }, fx(b.dv, 0) + ' m/s', h('div', { class: 'note-s' }, fMass(b.prop)))); tr.addEventListener('click', () => setTime(b.t - 8)); return tr; }),
      h('tr', { class: 'tot' }, h('td', null, 'Total'), h('td', { class: 'n' }, fx(dvTot, 0) + ' m/s', h('div', { class: 'note-s' }, fMass(scProp))))));
  pane.append(h('div', { class: 'scroll-x' }, bt));
  pane.append(h('p', { class: 'note-s' }, 'Each burn obeys the rocket equation Δv = Isp · g₀ · ln(m₀ / m₁): the propellant needed grows exponentially with the Δv asked of it, which is why staging and low-mass spacecraft matter.'));
  pane.append(h('h3', { class: 'h' }, 'Propellant tanks'));
  const tt = h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Tank'), h('th', { style: 'text-align:right' }, 'Loaded · left'))), h('tbody', null, ...md.tanks.map(tk => h('tr', null, h('td', null, h('b', null, tk.name), h('div', { class: 'note-s' }, `${tk.engine} · ${(PROP[tk.prop] || {}).label || tk.prop}`)), h('td', { class: 'n' }, fMass(tk.init), h('div', { class: 'note-s' }, fMass(md.tankValue(tk, md.tEnd))))))));
  pane.append(h('div', { class: 'scroll-x' }, tt));
}
// ---------------- mission sheet ----------------
function buildInfoPanel() {
  const md = MV.md, M = md.M, scn = md.scn, L = md.L, SC = md.SC, pane = $('#tab-info'); pane.innerHTML = '';
  pane.append(h('h3', { class: 'h' }, scn ? `${scn.agency} · ${scn.year} · ${scn.status}` : 'Custom mission'));
  if (scn) pane.append(h('p', { class: 'p' }, scn.blurb));
  if (scn && scn.crewNames) pane.append(h('p', { class: 'p' }, h('b', null, 'Crew: '), scn.crewNames));
  if (M.warnings.length) for (const w of M.warnings) pane.append(h('p', { class: 'warn' }, '⚠ ' + w));
  pane.append(h('h3', { class: 'h' }, 'Vehicle'));
  pane.append(h('div', { class: 'kv kv2' },
    h('div', { class: 'k' }, 'Launch vehicle'), h('div', { class: 'v' }, L.name),
    h('div', { class: 'k' }, 'Height · diameter'), h('div', { class: 'v' }, `${L.height} m · ${L.diameter} m`),
    h('div', { class: 'k' }, 'Spacecraft'), h('div', { class: 'v' }, SC.name),
    h('div', { class: 'k' }, 'Spacecraft mass'), h('div', { class: 'v' }, fMass(scTotalMass(SC))),
    h('div', { class: 'k' }, 'Crew'), h('div', { class: 'v' }, String(md.cfg.crew || 0))));
  const mt = h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Module'), h('th', null, 'Dry'), h('th', null, 'Propellant'))), h('tbody', null, ...Object.values(SC.modules).map(m => h('tr', null, h('td', null, m.name, m.engine ? h('div', { class: 'note-s' }, `${m.engine.name} · ${fForce(m.engine.thrust)} · Isp ${m.engine.isp} s · ${(PROP[m.engine.prop] || {}).label}`) : null), h('td', { class: 'n' }, fMass(m.dry)), h('td', { class: 'n' }, m.prop ? fMass(m.prop) : '—')))));
  pane.append(h('div', { class: 'scroll-x' }, mt));
  // simulated vs real
  pane.append(h('h3', { class: 'h' }, 'Simulated results'));
  const rows = [];
  const add = (k, v) => rows.push(h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
  add('Liftoff', fmtUTC(M.t0) + ' UTC');
  const a = M.summary.ascent; if (a) { add(L.sideMount ? 'Main engine cutoff' : 'Orbit insertion', `${fMET(a.tIns)} · ${fx(a.hp, 0)} × ${fx(a.ha, 0)} km`); add('Ascent max g · max q', `${a.maxG.toFixed(2)} g · ${fx(a.maxQ / 1000, 1)} kPa`); add('Launch azimuth', a.az.toFixed(1) + '°'); }
  if (M.summary.halo) { const hd = M.summary.design || {}; add('Transfer to L2', `the stable manifold of the halo · perigee ${fx(hd.perigeeKm, 0)} km · C3 ${hd.C3.toFixed(2)} km²/s²`); add('Halo orbit', `${fDist(M.summary.halo.az)} out of the ecliptic · period ${fx(M.summary.halo.periodDays, 0)} days`); add('Station-keeping', `${M.summary.halo.dvSK.length} burns · ${M.summary.halo.dvTotal.toFixed(1)} m/s in all`); }
  else if (M.summary.design) add('Departure C3 · v∞', `${M.summary.design.C3.toFixed(2)} km²/s² · ${M.summary.design.vinfDep.toFixed(2)} km/s`);
  for (const e of md.events) if (['touchdown', 'landing'].includes(e.kind) && /touchdown|splashdown|landing/i.test(e.name)) add(e.name, fmtUTC(e.t) + ' UTC (' + fMET(e.t - M.t0) + ')');
  for (const e of md.events) if (e.kind === 'flyby') add(e.name, fmtUTC(e.t) + ' UTC');
  if (M.summary.landing && M.summary.landing.runway) add('Runway', M.summary.landing.runway);
  else if (M.summary.landing) add('Landing accuracy', `${fx(M.summary.landing.miss * 1000, 0)} m from target`);
  const ents = M.summary.entries || (M.summary.entry ? [{ body: 'earth', ...M.summary.entry }] : []);
  for (const en of ents) add(`Entry at ${BODIES[en.body || 'earth'].name}`, `${en.vEI.toFixed(2)} km/s · peak ${en.maxG.toFixed(1)} g · ${fx(en.maxHeat, 0)} W/cm² · ` + (en.reversals != null ? `${en.reversals} roll reversals` : `${fx(en.miss, 0)} km from target`));
  if (md.stats.maxDistEarth && (md.cfg.profile || '').startsWith('leo')) add('Highest point', `${fDist(md.stats.maxDistEarth - BODIES.earth.R)} above the equator's radius`);
  else if (md.stats.maxDistEarth) add('Farthest from Earth', `${fDist(md.stats.maxDistEarth)} (${fmtUTC(md.stats.tMaxDist, false)})`);
  for (const f of md.stats.flybys || []) add(`Gravity assist (${BODIES[f.body].name})`, `solar orbit ${f.before} → ${f.after}`);
  add('Mission duration', fTime(M.tEnd - M.t0));
  pane.append(h('div', { class: 'kv kv2' }, ...rows));
  if (scn && scn.real) {
    pane.append(h('h3', { class: 'h' }, scn.status === 'Flown' || scn.status === 'In flight' ? 'Real mission record' : 'Reference'));
    pane.append(h('div', { class: 'kv kv2' }, ...Object.entries(scn.real).flatMap(([k, v]) => [h('div', { class: 'k' }, k), h('div', { class: 'v', style: 'color:var(--fg-2)' }, v)])));
  }
  if (M.notes.length) { pane.append(h('h3', { class: 'h' }, 'Flight-dynamics notes')); for (const n of M.notes) pane.append(h('p', { class: 'note-s' }, n)); }
}
// ---------------- timeline ----------------
const TL = { map: null };
function buildTimelineMap() {
  const md = MV.md; const t0 = md.tStart, t1 = md.tEnd;
  const pts = new Set([t0, t1, md.M.t0]);
  for (const p of md.phases) { if (p.t0 > t0 && p.t0 < t1) pts.add(p.t0); if (p.t1 > t0 && p.t1 < t1) pts.add(p.t1); }
  const arr = [...pts].sort((a, b) => a - b).filter((v, i, A) => i === 0 || v - A[i - 1] > 1);
  const w = []; for (let i = 0; i + 1 < arr.length; i++) w.push(Math.pow(arr[i + 1] - arr[i], 0.33));
  const W = w.reduce((a, b) => a + b, 0); const cum = [0]; for (const x of w) cum.push(cum[cum.length - 1] + x / W);
  TL.map = { b: arr, cum };
}
function tlX(t) { const { b, cum } = TL.map; if (t <= b[0]) return 0; if (t >= b[b.length - 1]) return 1; let i = 0; while (i + 1 < b.length && b[i + 1] < t) i++; return cum[i] + (cum[i + 1] - cum[i]) * (t - b[i]) / (b[i + 1] - b[i]); }
function tlT(x) { const { b, cum } = TL.map; x = clamp(x, 0, 1); let i = 0; while (i + 1 < cum.length && cum[i + 1] < x) i++; if (i >= b.length - 1) return b[b.length - 1]; return b[i] + (b[i + 1] - b[i]) * (x - cum[i]) / Math.max(cum[i + 1] - cum[i], 1e-12); }
function drawTimeline(t) {
  const cv = $('#tlc'); const md = MV.md; if (!md || !TL.map) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); const W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W || !Hh) return; // timeline hidden (clean-frame mode)
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); TL.bg = null; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 6, x0 = pad, x1 = W - pad, bw = x1 - x0; const X = tt => x0 + tlX(tt) * bw;
  if (!TL.bg || TL.bgW !== W) {
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = '#0d1420'; g.fillRect(x0, 16, bw, 14);
    const phases = md.phases.slice().sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
    for (const p of phases) { const a = X(p.t0), b = X(p.t1); g.fillStyle = p.color; g.globalAlpha = 0.62; g.fillRect(a, 16, Math.max(b - a, 1.5), 14); g.globalAlpha = 1; }
    g.font = '600 10px "IBM Plex Sans Condensed", sans-serif'; g.textBaseline = 'middle';
    let lastEnd = -1e9;
    for (const p of md.phases) { const a = X(p.t0), b = X(p.t1); const tw = g.measureText(p.name).width; if (b - a > tw + 8 && a + 4 > lastEnd + 6) { g.fillStyle = 'rgba(0,0,0,.75)'; g.fillText(p.name, a + 4, 23.5); lastEnd = a + 4 + tw; } }
    for (const e of md.events) { const x = X(e.t); const big = ['burn', 'launch', 'landing', 'touchdown', 'flyby', 'emergency', 'dock'].includes(e.kind); g.fillStyle = e.kind === 'burn' ? '#ff9f43' : e.kind === 'photo' ? '#b896ff' : (e.kind === 'emergency' || e.kind === 'fail') ? '#ff6767' : 'rgba(230,236,245,.55)'; g.fillRect(Math.round(x), big ? 6 : 10, 1, big ? 8 : 5); }
    // engine strip: thin blue while coasting, orange blocks while any engine fires
    const sh = md.ship; if (sh) { const a = X(Math.max(sh.t0, md.M.t0)), b = X(Math.min(sh.t1, md.tEnd)); g.fillStyle = hexA(PCOL.coast, 0.32); g.fillRect(a, 32.5, Math.max(b - a, 1), 3); }
    g.fillStyle = PCOL.burn; for (const x of md.powered) { const a = X(x.t0), b = X(x.t1); g.fillRect(Math.min(a, b - 2), 31, Math.max(b - a, 2), 6); }
    g.fillStyle = 'rgba(135,148,168,.9)'; g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'alphabetic';
    const days = (md.tEnd - md.M.t0) / DAY; const step = days > 400 ? 100 : days > 120 ? 30 : days > 30 ? 7 : days > 6 ? 1 : days > 1.5 ? 0.5 : 0.125;
    let last = -1e9; for (let d = 0; d <= days; d += step) { const x = X(md.M.t0 + d * DAY); if (x - last < 34) continue; g.fillRect(Math.round(x), 38, 1, 4); g.fillText(step >= 1 ? `${d}d` : `${fx(d * 24, 0)}h`, x + 2, 51); last = x; }
    TL.bg = g.getImageData(0, 0, cv.width, cv.height); TL.bgW = W;
  } else g.putImageData(TL.bg, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const x = X(t); g.fillStyle = '#ffb547'; g.fillRect(Math.round(x) - 1, 3, 2, 35); g.beginPath(); g.moveTo(x - 5, 2); g.lineTo(x + 5, 2); g.lineTo(x, 8); g.fill();
}
function initTimeline() {
  const el = $('#timeline'); const hov = $('#tlHover'); let drag = false;
  const tAt = e => { const r = el.getBoundingClientRect(); return tlT((e.clientX - r.left - 6) / (r.width - 12)); };
  el.addEventListener('pointerdown', e => { if (!MV.md) return; drag = true; el.setPointerCapture(e.pointerId); setTime(tAt(e)); });
  el.addEventListener('pointermove', e => {
    if (!MV.md || !TL.map) return; const t = tAt(e); if (drag) setTime(t);
    const md = MV.md; let near = null, nd = 1e9; const r = el.getBoundingClientRect();
    for (const ev of md.events) { const d = Math.abs(tlX(ev.t) * (r.width - 12) + 6 - (e.clientX - r.left)); if (d < nd) { nd = d; near = ev; } }
    const ph = md.phaseAt(t); const px = e.clientX - r.left; let burn = null;
    for (const x of md.powered) { const a = tlX(x.t0) * (r.width - 12) + 6, b = tlX(x.t1) * (r.width - 12) + 6; if (px >= a - 3 && px <= b + 3) { burn = x; break; } }
    hov.style.display = 'block'; hov.style.left = px + 'px';
    hov.textContent = `${fMET(t - md.M.t0)} · ${ph ? ph.name : ''}${burn ? ' · ENGINE ON: ' + burn.name : near && nd < 6 ? ' · ' + near.name : ''}`;
  });
  const end = () => { drag = false; }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { hov.style.display = 'none'; });
}
// ---------------- captions ----------------
const CAP = { until: 0, ev: null };
function showCaption(e) {
  if (!MV.layers.captions) return;
  const el = $('#caption'); el.querySelector('.cap-name').textContent = e.name;
  let d = e.desc || ''; const sentences = d.split(/(?<=[.!?”])\s+/); d = sentences.slice(0, 2).join(' ');
  el.querySelector('.cap-desc').textContent = d; el.classList.remove('fade'); CAP.until = clockMs() + clamp(3500 + d.length * 45, 4000, 11000); CAP.ev = e;
}
function updateCaption() { if (CAP.until && clockMs() > CAP.until) { $('#caption').classList.add('fade'); CAP.until = 0; } }
// ---------------- storyboard ----------------
const SHOTS = { list: [], key: '' };
function shotsKey() { return 'mstudio-shots-' + (MV.md ? (MV.md.scn ? MV.md.scn.id : 'custom') : 'none'); }
function loadShots() { SHOTS.key = shotsKey(); SHOTS.list = lsGet(SHOTS.key, []) || []; renderShots(); }
function saveShots() { if (!lsSet(SHOTS.key, SHOTS.list)) { /* storage full: keep in memory */ } }
function camDesc(c) {
  const lens = `${Math.round(c.lens)} mm`; const tgt = c.target.startsWith('obj:') ? ((MV.md.M.obj(c.target.slice(4)) || {}).name || c.target) : BODIES[c.target.slice(5)].name;
  const mode = { orbit: 'Orbit cam', chase: 'Chase cam', lookat: 'Look-at', ground: 'Ground observer', top: 'Top-down map' }[c.mode];
  return `${mode} · ${lens} · on ${tgt}${c.mode === 'lookat' ? ' → ' + (c.look.startsWith('body:') ? BODIES[c.look.slice(5)].name : c.look.slice(4)) : ''}`;
}
function captureShot() {
  const md = MV.md; if (!md) return;
  renderFrame(true);
  const src = R.renderer.domElement; const pr = R.renderer.getPixelRatio(); const fr = frameRect();
  const sx = fr.x * pr, sy = fr.y * pr, sw = fr.w * pr, sh = fr.h * pr;
  const W = 960, Hh = Math.round(W * fr.h / fr.w);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  g.drawImage(src, sx, sy, sw, sh, 0, 0, W, Hh);
  const t = STATE.t; const ph = md.phaseAt(t); const prevEv = [...md.events].reverse().find(e => e.t <= t && t - e.t < 1800);
  const ps = PSTAT.cur; const propTxt = ps ? (ps.k === 'burn' ? `${ps.l}: ${String(ps.name || '').split('—')[0].trim()}` : ps.l) : '';
  const camS = { mode: CAM.mode, target: CAM.target, look: CAM.look, lens: CAM.lens, az: CAM.az, el: CAM.el, dist: CAM.dist, roll: CAM.roll, aspect: CAM.aspect, ground: { ...CAM.ground } };
  const n = SHOTS.list.length ? Math.max(...SHOTS.list.map(s => s.n)) + 1 : 1;
  // slate strip
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, Hh - 26, W, 26); g.fillStyle = '#ffb547'; g.font = '600 14px "IBM Plex Mono", monospace'; g.fillText(`SHOT ${n}`, 10, Hh - 8);
  g.fillStyle = '#e6ecf5'; g.font = '13px "IBM Plex Mono", monospace'; g.fillText(`${fMET(t - md.M.t0)}  ·  ${camDesc(camS)}  ·  ${ph ? ph.name : ''}${propTxt ? '  ·  ' + propTxt : ''}`, 92, Hh - 8);
  const img = cv.toDataURL('image/jpeg', 0.82);
  const shot = { n, t, met: fMET(t - md.M.t0), utc: fmtUTC(t), phase: ph ? ph.name : '', prop: propTxt, cam: camS, img, caption: prevEv ? prevEv.name + ' — ' : (ph ? ph.name + ' — ' : ''), w: W, h: Hh };
  SHOTS.list.push(shot); saveShots(); renderShots();
  const b = $('#bShot'); b.textContent = '✓ Saved'; setTimeout(() => { b.textContent = '● Shot'; }, 900);
  const flash = h('div', { style: 'position:absolute;inset:0;background:#fff;opacity:.35;pointer-events:none;transition:opacity .35s;z-index:30' }); $('#app').append(flash); requestAnimationFrame(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 400); });
}
function gotoShot(s) {
  Object.assign(CAM, { mode: s.cam.mode, target: s.cam.target, look: s.cam.look, lens: s.cam.lens, az: s.cam.az, el: s.cam.el, dist: s.cam.dist, roll: s.cam.roll || 0, aspect: s.cam.aspect || 0 }); CAM.ground = { ...s.cam.ground }; CAM.trans = null;
  $('#selAspect').value = String(CAM.aspect || 0); applyLens(); syncCamUI(); setTime(s.t); STATE.playing = false; syncPlayUI();
}
function renderShots() {
  const pane = $('#tab-shots'); pane.innerHTML = '';
  $('#shotCount').textContent = SHOTS.list.length ? `(${SHOTS.list.length})` : '';
  pane.append(h('p', { class: 'note-s' }, 'Frame the view, pick a lens and aspect ratio, then capture. Each shot stores the time, camera and lens so you can return to it exactly.'));
  pane.append(h('div', { class: 'btnrow' }, h('button', { class: 'tb primary', onclick: captureShot }, '● Capture shot'), h('button', { class: 'tb', onclick: openSheet, disabled: !SHOTS.list.length }, 'Contact sheet'), h('button', { class: 'tb', onclick: copyShotList, disabled: !SHOTS.list.length }, 'Copy shot list')));
  SHOTS.list.forEach((s, i) => {
    const ta = h('textarea', { placeholder: 'Caption / action / dialogue…' }); ta.value = s.caption || ''; ta.addEventListener('input', () => { s.caption = ta.value; saveShots(); });
    const del = h('button', null, 'Delete'); let armed = false; del.addEventListener('click', () => { if (!armed) { armed = true; del.textContent = 'Confirm delete'; del.style.color = 'var(--red)'; setTimeout(() => { armed = false; del.textContent = 'Delete'; del.style.color = ''; }, 2500); return; } SHOTS.list.splice(i, 1); saveShots(); renderShots(); });
    pane.append(h('div', { class: 'shot' }, h('img', { src: s.img, alt: 'Shot ' + s.n, onclick: () => gotoShot(s) }),
      h('div', { style: 'min-width:0' }, h('div', { class: 'meta' }, h('b', null, `#${s.n}`), ` ${s.met}`, h('br'), `${camDesc(s.cam)}`), ta,
        h('div', { class: 'acts' }, h('button', { onclick: () => gotoShot(s) }, 'Go to'), h('button', { onclick: () => { if (i > 0) { SHOTS.list.splice(i - 1, 0, SHOTS.list.splice(i, 1)[0]); saveShots(); renderShots(); } } }, '↑'), h('button', { onclick: () => { if (i < SHOTS.list.length - 1) { SHOTS.list.splice(i + 1, 0, SHOTS.list.splice(i, 1)[0]); saveShots(); renderShots(); } } }, '↓'), del))));
  });
}
function shotListText() {
  const md = MV.md; const lines = [`${md.M.name} — storyboard shot list`, ''];
  SHOTS.list.forEach((s, i) => lines.push(`${i + 1}. [Shot ${s.n}] ${s.met}  (${s.utc} UTC)  ${s.phase}${s.prop ? ' · ' + s.prop : ''}\n   Camera: ${camDesc(s.cam)}${s.cam.aspect ? ' · ' + s.cam.aspect + ':1' : ''}\n   ${s.caption || ''}`));
  return lines.join('\n');
}
function copyShotList() { const txt = shotListText(); try { navigator.clipboard.writeText(txt).then(() => toast('Shot list copied'), () => openSheet()); } catch (e) { openSheet(); } }
function openSheet() {
  const shots = SHOTS.list; if (!shots.length) return;
  const cols = shots.length > 4 ? 3 : 2, cw = 640, ch = 360, capH = 64, pad = 24;
  const rows = Math.ceil(shots.length / cols); const cv = document.createElement('canvas'); cv.width = pad + cols * (cw + pad); cv.height = 70 + rows * (ch + capH + pad) + pad;
  const g = cv.getContext('2d'); g.fillStyle = '#0a0d13'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#ffb547'; g.font = '700 26px "IBM Plex Sans Condensed", sans-serif'; g.fillText(MV.md.M.name + ' — storyboard', pad, 44);
  let loaded = 0;
  shots.forEach((s, i) => {
    const im = new Image(); im.onload = () => {
      const c = i % cols, r = Math.floor(i / cols); const x = pad + c * (cw + pad), y = 70 + r * (ch + capH + pad);
      const k = Math.min(cw / s.w, ch / s.h); const w = s.w * k, hh = s.h * k; g.fillStyle = '#000'; g.fillRect(x, y, cw, ch); g.drawImage(im, x + (cw - w) / 2, y + (ch - hh) / 2, w, hh);
      g.fillStyle = '#e6ecf5'; g.font = '15px "IBM Plex Sans Condensed", sans-serif'; wrapText(g, `${i + 1}. ${s.caption || s.phase}`, x, y + ch + 22, cw, 18, 2);
      if (++loaded === shots.length) { $('#sheetImg').src = cv.toDataURL('image/jpeg', 0.88); }
    }; im.src = s.img;
  });
  $('#sheetText').value = shotListText(); $('#sheet').hidden = false;
}
function wrapText(g, text, x, y, maxW, lh, maxLines) { const words = text.split(/\s+/); let line = '', n = 0; for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return; } else line = test; } if (line) g.fillText(line, x, y); }
function toast(msg) { const t = h('div', { style: 'position:absolute;left:50%;top:60px;transform:translateX(-50%);background:var(--panel-solid);border:1px solid var(--line-2);padding:6px 12px;border-radius:6px;z-index:40;font-size:13px' }, msg); $('#app').append(t); setTimeout(() => t.remove(), 1800); }
