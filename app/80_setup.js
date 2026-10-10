// ============================================================================
// Setup: scenario library, mission inputs, vehicle card, porkchop plot,
// live planning (the flight is solved in the background as you edit).
// ============================================================================
const SETUP = { scn: null, cfg: null, orig: null, plan: null, planErr: null, planning: false, debounce: 0, progress: '' };
const MOON_SITES = [['Tranquility Base (Apollo 11)', 0.674, 23.473], ['Ocean of Storms (Apollo 12)', -3.012, -23.422], ['Fra Mauro (Apollo 14)', -3.645, -17.471], ['Hadley–Apennine (Apollo 15)', 26.132, 3.634], ['Descartes (Apollo 16)', -8.973, 15.5], ['Taurus–Littrow (Apollo 17)', 20.191, 30.772], ['Mons Rümker (Chang’e 5)', 43.058, -51.916], ['Copernicus crater rim', 9.62, -20.08]];
const MARS_SITES = [['Jezero Crater (Perseverance)', 18.4447, 77.4508, -2.57], ['Gale Crater (Curiosity)', -4.5895, 137.4417, -4.5], ['Utopia Planitia (Zhurong)', 25.066, 109.925, -4.1], ['Arcadia Planitia (Starship candidate)', 40.8, 150.0, -4.0], ['Elysium Planitia (InSight)', 4.502, 135.623, -2.6], ['Meridiani Planum (Opportunity)', -1.946, -5.527, -1.4], ['Chryse Planitia (Viking 1)', 22.27, -47.95, -3.6]];
const EARTH_SITES = [['Pacific, SW of Hawaii (Apollo)', 13.3, -169.15], ['Pacific off San Diego (Artemis)', 32.3, -117.8], ['Siziwang Banner, Inner Mongolia', 42.0, 111.5], ['Starbase, Texas', 25.99, -97.15], ['Utah Test and Training Range', 40.2, -113.5], ['Atlantic off Florida', 29.0, -79.0]];
function scnGroups() { return [['Moon', SCENARIOS.filter(s => s.dest === 'moon')], ['Mars', SCENARIOS.filter(s => s.dest === 'mars' && s.cfg.profile !== 'multi-flyby')], ['Gravity assist', SCENARIOS.filter(s => s.cfg.profile === 'multi-flyby')]]; }
function buildScenarioList() {
  const nav = $('#scnList'); nav.innerHTML = '';
  for (const [g, list] of scnGroups()) {
    nav.append(h('div', { class: 'scn-group' }, g));
    for (const s of list) nav.append(h('button', { class: 'scn' + (SETUP.scn === s ? ' on' : ''), dataset: { id: s.id }, onclick: () => selectScenario(s.id) },
      h('div', { class: 'st' }, h('span', null, s.title), h('span', { class: 'yr' }, s.year)),
      h('div', { class: 'tg' }, s.tag),
      h('div', { class: 'ag' }, h('span', { class: 'pill ' + (s.crewed ? 'crew' : 'robot') }, s.crewed ? 'Crewed' : 'Robotic'), s.agency)));
  }
}
function selectScenario(id) {
  const s = scenarioById(id); SETUP.scn = s; SETUP.orig = JSON.parse(JSON.stringify(s.cfg)); SETUP.cfg = JSON.parse(JSON.stringify(s.cfg));
  SETUP.plan = null; SETUP.planErr = null;
  lsSet('mstudio-last', id);
  buildScenarioList(); renderDetail(); schedulePlan(0);
}
// ---------------- field model ----------------
const gp = (o, path) => path.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
function sp(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
function fieldsFor(cfg, scn) {
  const F = []; const SC = SPACECRAFT[cfg.spacecraft];
  const lunar = (cfg.profile || '').startsWith('lunar');
  const grp = (title, ...items) => F.push({ group: title, items: items.filter(Boolean) });
  const launchers = Object.entries(LAUNCHERS).filter(([k]) => SC.usesUpperStage ? k === 'starship' : k !== 'starship').map(([k, L]) => [k, `${L.name} — ${L.org}`]);
  grp('Launch',
    { path: 'launcher', label: 'Launch vehicle', type: 'select', options: launchers, wide: true, onSet: c => { delete c.launchAz; } },
    { path: 'site', label: 'Launch site', type: 'select', options: Object.entries(LAUNCH_SITES).map(([k, s]) => [k, s.name]), wide: true, onSet: c => { delete c.launchAz; } },
    { path: 'launch', label: 'Liftoff (UTC)', type: 'datetime', wide: true, onSet: (c, v, old) => { delete c.launchAz; } },
    { path: 'parking.hp', label: 'Parking orbit perigee', unit: 'km', type: 'number', min: 150, max: 1000, step: 1 },
    { path: 'parking.ha', label: 'Parking orbit apogee', unit: 'km', type: 'number', min: 150, max: 60000, step: 1 },
  );
  grp('Crew & payload',
    { path: 'name', label: 'Mission name', type: 'text', wide: true },
    { path: 'shipName', label: 'Spacecraft name', type: 'text', wide: true },
    (SC.crewMax > 0) && { path: 'crew', label: 'Crew', type: 'number', min: 1, max: SC.crewMax, step: 1, unit: `max ${SC.crewMax}` },
    cfg.payloadMass != null && { path: 'payloadMass', label: 'Habitat + cargo mass', unit: 'kg', type: 'number', min: 10000, max: 200000, step: 1000 },
    cfg.refill && { path: 'refill.tankers', label: 'Tanker flights', type: 'number', min: 0, max: 20, step: 1, onSet: (c, v) => { c.refill.to = Math.min(1500000, Math.round(80000 + v * 150000)); } },
    cfg.refill && { path: 'refill.to', label: 'Propellant after refilling', unit: 'kg', type: 'number', min: 0, max: 1500000, step: 10000 },
    cfg.isru && { path: 'isru.to', label: 'Propellant made on Mars (ISRU)', unit: 'kg', type: 'number', min: 0, max: 1500000, step: 10000 },
  );
  if (lunar) {
    grp('To the Moon',
      cfg.tliMET != null && { path: 'tliMET', label: 'Trans-lunar injection', unit: 'h after liftoff', type: 'number', min: 1.5, max: 6, step: 0.01 },
      cfg.heo && { path: 'heo.ha', label: 'High Earth orbit apogee', unit: 'km', type: 'number', min: 20000, max: 100000, step: 100 },
      { path: 'tof', label: 'Earth → Moon flight time', unit: 'h', type: 'number', min: 55, max: 130, step: 0.1 },
      { path: 'perilune', label: cfg.profile === 'lunar-flyby' ? 'Closest approach to the Moon' : 'Arrival perilune altitude', unit: 'km', type: 'number', min: 60, max: 20000, step: 1 },
      cfg.loi && { path: 'loi.circ', label: 'Lunar orbit altitude', unit: 'km', type: 'number', min: 60, max: 500, step: 1, onSet: (c, v) => { if (c.perilune < v * 0.6) c.perilune = v; } },
      cfg.loi && { path: 'loi.apo', label: 'Initial capture apolune', unit: 'km', type: 'number', min: 100, max: 10000, step: 1 },
    );
    if (cfg.landing) grp('Lunar landing',
      { kind: 'preset', label: 'Landing site', list: MOON_SITES, path: 'landing', wide: true },
      { path: 'landing.lat', label: 'Latitude', unit: '°N', type: 'number', min: -60, max: 60, step: 0.001 },
      { path: 'landing.lon', label: 'Longitude', unit: '°E', type: 'number', min: -180, max: 180, step: 0.001 },
      { path: 'landMET', label: 'Touchdown', unit: 'h after liftoff', type: 'number', min: 60, max: 400, step: 0.01, onSet: (c, v, old) => { const d = v - old; for (const k of ['undockMET', 'pdiMET', 'ascentMET', 'teiMET']) if (c[k] != null) c[k] = +(c[k] + d).toFixed(3); } },
      { kind: 'calc', label: 'Surface stay', unit: 'h', get: c => +(c.ascentMET - c.landMET).toFixed(2), set: (c, v) => { const old = c.ascentMET; c.ascentMET = +(c.landMET + v).toFixed(3); if (c.teiMET != null) c.teiMET = +(c.teiMET + (c.ascentMET - old)).toFixed(3); }, min: 2, max: 400, step: 0.1 },
    );
    grp('Home',
      cfg.teiMET != null && { path: 'teiMET', label: 'Trans-Earth injection', unit: 'h after liftoff', type: 'number', min: 70, max: 600, step: 0.01 },
      cfg.returnTof != null && { path: 'returnTof', label: 'Moon → Earth flight time', unit: 'h', type: 'number', min: 50, max: 120, step: 0.1 },
      { kind: 'preset', label: 'Splashdown / landing zone', list: EARTH_SITES, path: 'splash', wide: true },
      { path: 'splash.lat', label: 'Latitude', unit: '°N', type: 'number', min: -60, max: 60, step: 0.01 },
      { path: 'splash.lon', label: 'Longitude', unit: '°E', type: 'number', min: -180, max: 180, step: 0.01 },
      { path: 'entry.fpa', label: 'Entry flight-path angle', unit: '°', type: 'number', min: -8, max: -5, step: 0.01 },
    );
  } else {
    (cfg.legs || []).forEach((leg, i) => {
      const P = `legs.${i}.`; const body = BODIES[leg.body].name; const ret = leg.body === 'earth' && leg.departMars;
      const title = leg.type === 'flyby' ? `${body} flyby` : leg.type === 'orbit' ? `${body} orbit` : leg.type === 'entry' ? (ret ? 'Return to Earth' : `${body} entry & landing`) : `${body} (design point)`;
      const items = [];
      if (ret) items.push({ path: P + 'departMars', label: 'Leave Mars (UTC)', type: 'datetime', wide: true });
      items.push({ path: P + 't', label: leg.type === 'entry' ? `Atmospheric entry (UTC)` : leg.type === 'flyby' ? 'Closest approach (UTC)' : 'Arrival (UTC)', type: 'datetime', wide: true, onSet: (c, v, old) => { if (leg.tLand && old) { const d = isoToT(v) - isoToT(old); c.legs[i].tLand = new Date((isoToT(c.legs[i].tLand) + d + J2000_UNIX) * 1000).toISOString().replace('.000', ''); } } });
      if (leg.type === 'flyby') items.push(leg.alt != null ? { path: P + 'alt', label: 'Flyby altitude', unit: 'km', type: 'number', min: 100, max: 200000, step: 1 } : { path: P + 'minAlt', label: 'Minimum flyby altitude', unit: 'km', type: 'number', min: 100, max: 20000, step: 1 });
      if (leg.type === 'orbit') items.push({ path: P + 'alt', label: 'Capture periapsis altitude', unit: 'km', type: 'number', min: 150, max: 5000, step: 1 }, { path: P + 'apo', label: 'Capture apoapsis altitude', unit: 'km', type: 'number', min: 1000, max: 300000, step: 100 }, { path: P + 'incl', label: 'Arrival inclination', unit: '°', type: 'number', min: 0, max: 180, step: 0.1 });
      if (leg.site && leg.body === 'mars') items.push({ kind: 'preset', label: 'Landing site', list: MARS_SITES, path: P + 'site', wide: true }, { path: P + 'site.lat', label: 'Latitude', unit: '°N', type: 'number', min: -60, max: 60, step: 0.001 }, { path: P + 'site.lon', label: 'Longitude', unit: '°E', type: 'number', min: -180, max: 180, step: 0.001 });
      if (leg.next === 'land' && leg.tLand) items.push({ path: P + 'tLand', label: 'Landing (UTC)', type: 'datetime', wide: true });
      if (leg.site && leg.body === 'earth') items.push({ kind: 'preset', label: 'Landing zone', list: EARTH_SITES, path: P + 'site', wide: true }, { path: P + 'site.lat', label: 'Latitude', unit: '°N', type: 'number', min: -60, max: 60, step: 0.01 }, { path: P + 'site.lon', label: 'Longitude', unit: '°E', type: 'number', min: -180, max: 180, step: 0.01 });
      if (leg.entry && leg.entry.fpa != null) items.push({ path: P + 'entry.fpa', label: 'Entry flight-path angle', unit: '°', type: 'number', min: -20, max: -4, step: 0.1 });
      grp(title, ...items);
    });
  }
  return F;
}
function renderDetail() {
  const s = SETUP.scn, cfg = SETUP.cfg; const root = $('#scnDetail'); root.innerHTML = '';
  root.append(h('div', { class: 'det-head' },
    h('div', null, h('h2', null, s.title), h('div', { class: 'det-sub' }, `${s.agency} · ${s.year} · ${s.status}`)),
    h('div', { class: 'chipline' }, h('span', { class: 'pill ' + (s.crewed ? 'crew' : 'robot') }, s.crewed ? 'Crewed' : 'Robotic'), h('span', { class: 'pill st' }, s.tag))));
  root.append(h('p', { class: 'p', style: 'max-width:75ch;margin-top:8px' }, s.blurb));
  if (s.crewNames) root.append(h('p', { class: 'p' }, h('b', null, 'Crew: '), s.crewNames));
  const colA = h('div'), colB = h('div');
  root.append(h('div', { class: 'det-cols' }, colA, colB));
  // inputs
  colA.append(h('h3', { class: 'h' }, 'Mission inputs'));
  const form = h('form', { id: 'cfgForm', onsubmit: e => e.preventDefault() });
  for (const g of fieldsFor(cfg, s)) {
    const fs = h('fieldset', null, h('legend', null, g.group)); const grid = h('div', { class: 'fgrid' }); fs.append(grid);
    for (const f of g.items) grid.append(fieldEl(f));
    form.append(fs);
  }
  form.append(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'tb', onclick: () => { SETUP.cfg = JSON.parse(JSON.stringify(SETUP.orig)); renderDetail(); schedulePlan(0); } }, 'Reset to the real mission')));
  colA.append(form);
  if (cfg.legs && cfg.legs[0] && cfg.legs[0].body === 'mars') {
    colA.append(h('h3', { class: 'h' }, 'Launch window — porkchop plot'));
    colA.append(h('p', { class: 'note-s' }, 'Departure energy C3 (km²/s²) for every departure date and flight time to Mars. Darker = cheaper. Click to pick a departure and arrival; the planner re-targets the whole flight.'));
    colA.append(h('div', { id: 'porkWrap' }, h('canvas', { id: 'pork', width: 640, height: 400 }), h('div', { id: 'porkInfo' })));
    setTimeout(drawPorkchop, 30);
  }
  // vehicle card
  colB.append(h('h3', { class: 'h' }, 'Launch vehicle'), h('div', { id: 'vehCard' }));
  colB.append(h('h3', { class: 'h' }, 'Spacecraft'), h('div', { id: 'scCard' }));
  if (s.real) colB.append(h('h3', { class: 'h' }, s.status === 'Flown' || s.status === 'In flight' ? 'What really happened' : 'Reference'), h('div', { class: 'kv kv2' }, ...Object.entries(s.real).flatMap(([k, v]) => [h('div', { class: 'k' }, k), h('div', { class: 'v', style: 'color:var(--fg-2)' }, v)])));
  // plan box
  root.append(h('div', { class: 'plan-box' }, h('div', { style: 'min-width:0' }, h('div', { class: 'plan-status', id: 'planStatus' }), h('div', { class: 'plan-kpis', id: 'planKpis' })), h('div', { class: 'go-wrap' }, h('label', { class: 'chk go-sound', title: 'Sound (M) — engines, countdown, separations, ambient music' }, h('input', { type: 'checkbox', id: 'goSound', checked: SND.on, onchange: e => setSound(e.target.checked) }), 'Sound'), h('button', { class: 'tb primary go', id: 'goBtn', onclick: launchFromSetup }, 'Fly this mission ▶'))));
  renderVehicleCard(); renderScCard(); renderPlanStatus();
}
function fieldEl(f) {
  const cfg = SETUP.cfg; const wrap = h('label', { class: 'f' + (f.wide ? ' wide' : '') });
  const lab = h('span', null, f.label, f.unit ? h('em', null, ` (${f.unit})`) : null); wrap.append(lab);
  let input;
  if (f.kind === 'preset') {
    input = h('select', null, h('option', { value: '' }, 'Choose a known site…'), ...f.list.map((x, i) => h('option', { value: i }, x[0])));
    const cur = gp(cfg, f.path); const idx = cur ? f.list.findIndex(x => Math.abs(x[1] - cur.lat) < 0.01 && Math.abs(x[2] - cur.lon) < 0.01) : -1; if (idx >= 0) input.value = idx;
    input.addEventListener('change', () => { if (input.value === '') return; const x = f.list[+input.value]; const o = gp(SETUP.cfg, f.path) || {}; o.lat = x[1]; o.lon = x[2]; o.name = x[0].replace(/\s*\(.*\)/, ''); if (x[3] != null) o.elev = x[3]; sp(SETUP.cfg, f.path, o); renderDetail(); schedulePlan(); });
    wrap.append(input); return wrap;
  }
  const val = f.kind === 'calc' ? f.get(cfg) : gp(cfg, f.path);
  if (f.type === 'select') { input = h('select', null, ...f.options.map(([v, l]) => h('option', { value: v }, l))); input.value = val; }
  else if (f.type === 'datetime') { input = h('input', { type: 'datetime-local', value: val ? isoLocalInput(isoToT(val)) : '', step: 60 }); }
  else if (f.type === 'number') { input = h('input', { type: 'number', value: val ?? '', min: f.min, max: f.max, step: f.step || 'any', inputmode: 'decimal' }); }
  else input = h('input', { type: 'text', value: val ?? '' });
  const origV = f.kind === 'calc' ? f.get(SETUP.orig) : gp(SETUP.orig, f.path);
  const mark = () => { const cur = f.kind === 'calc' ? f.get(SETUP.cfg) : gp(SETUP.cfg, f.path); wrap.classList.toggle('changed', JSON.stringify(cur) !== JSON.stringify(origV)); };
  input.addEventListener('change', () => {
    const old = f.kind === 'calc' ? f.get(SETUP.cfg) : gp(SETUP.cfg, f.path);
    let v = input.value;
    if (f.type === 'number' || f.kind === 'calc') { v = parseFloat(v); if (!isFinite(v)) { input.value = old; return; } if (f.min != null) v = Math.max(f.min, v); if (f.max != null) v = Math.min(f.max, v); input.value = v; }
    if (f.type === 'datetime') { v = inputToIso(v); if (!v || !isFinite(isoToT(v))) { input.value = isoLocalInput(isoToT(old)); return; } }
    if (f.kind === 'calc') f.set(SETUP.cfg, v); else sp(SETUP.cfg, f.path, v);
    if (f.onSet) f.onSet(SETUP.cfg, v, old);
    mark();
    if (['launcher', 'crew', 'payloadMass'].includes(f.path)) { renderVehicleCard(); renderScCard(); }
    if (f.path === 'launch' || /legs\.0\.t$/.test(f.path)) drawPorkchop();
    if (f.path && f.path.startsWith('landMET') || f.kind === 'calc') renderDetailSoft();
    schedulePlan();
  });
  mark(); wrap.append(input); return wrap;
}
function renderDetailSoft() { const y = $('#setup').scrollTop; renderDetail(); $('#setup').scrollTop = y; }
// ---------------- vehicle & spacecraft cards ----------------
function stackDeltaV(L, payload) {
  const st = L.stages; let m = payload + st.reduce((a, s) => a + s.dry + s.propMass, 0) + L.jettison.reduce((a, j) => a + j.mass, 0);
  let dv = 0, i = 0; const jet = L.jettison.reduce((a, j) => a + j.mass, 0);
  if (st[0].parallel) {
    const B = st[0], Cc = st[1]; const FB = (B.thrustSL + B.thrustVac) / 2, FC = (Cc.thrustSL + Cc.thrustVac) / 2;
    const mdB = FB / (((B.ispSL + B.ispVac) / 2) * G0), mdC = FC / (((Cc.ispSL + Cc.ispVac) / 2) * G0);
    const tB = B.propMass / mdB; const coreUsed = Cc.ignition ? 0 : Math.min(Cc.propMass * 0.9, mdC * tB);
    const isp = (FB + (Cc.ignition ? 0 : FC)) / ((mdB + (Cc.ignition ? 0 : mdC)) * G0);
    const m1 = m - B.propMass - coreUsed; dv += isp * G0 * Math.log(m / m1); m = m1 - B.dry - jet;
    const rem = Cc.propMass - coreUsed; dv += Cc.ispVac * G0 * Math.log(m / (m - rem)); m -= rem + Cc.dry; i = 2;
  }
  for (; i < st.length; i++) { const s = st[i]; const isp = i === 0 ? (s.ispSL + s.ispVac) / 2 : s.ispVac; dv += isp * G0 * Math.log(m / (m - s.propMass)); m -= s.propMass + s.dry; if (i === 0) m -= jet; }
  return dv / 1000;
}
const SHORT_NAMES = { saturnV: 'Saturn V', sls1: 'SLS Block 1', lm5: 'Long March 5', atlasV541: 'Atlas V 541', atlasAgena: 'Atlas-Agena', falconHeavy: 'Falcon Heavy', starship: 'Starship', lvm3: 'LVM3' };
function launcherSVG(selKey) {
  const keys = Object.keys(LAUNCHERS); const Hh = 300, base = 266, k = 225 / 125; let x = 30; const out = [];
  const grid = [0, 25, 50, 75, 100, 125];
  for (const key of keys) {
    const L = LAUNCHERS[key]; const sel = key === selKey; const op = sel ? 1 : 0.38;
    const core = L.stages.filter(s => !s.parallel); const bst = L.stages[0].parallel ? L.stages[0] : null;
    const maxR = Math.max(...L.stages.map(s => Math.max(...s.geom.map(g => g[1]))), (bst ? bst.booster.offset + bst.geom[0][1] : 0));
    const slot = Math.max(66, 2 * maxR * k + 18); const cx = x + slot / 2; let y = base; const parts = [];
    if (bst) { const off = bst.booster.offset; for (const sgn of [-1, 1]) { let yb = base; for (const [len, rb, rt, col] of bst.geom) { parts.push(`<path d="M${cx + sgn * off * k - rb * k},${yb} L${cx + sgn * off * k + rb * k},${yb} L${cx + sgn * off * k + rt * k},${yb - len * k} L${cx + sgn * off * k - rt * k},${yb - len * k}Z" fill="${col}"/>`); yb -= len * k; } } }
    for (const s of core) for (const [len, rb, rt, col] of s.geom) { parts.push(`<path d="M${cx - rb * k},${y} L${cx + rb * k},${y} L${cx + rt * k},${y - len * k} L${cx - rt * k},${y - len * k}Z" fill="${col}" stroke="rgba(0,0,0,.35)" stroke-width=".4"/>`); y -= len * k; }
    const rest = L.height * k - (base - y);
    if (rest > 1) { const r = (L.payloadFairing ? L.payloadFairing.r : core[core.length - 1].geom.slice(-1)[0][2]) * k; parts.push(`<path d="M${cx - r},${y} L${cx + r},${y} L${cx + r},${y - rest * 0.45} Q${cx + r},${y - rest * 0.8} ${cx},${y - rest} Q${cx - r},${y - rest * 0.8} ${cx - r},${y - rest * 0.45}Z" fill="${L.payloadFairing ? L.payloadFairing.color : '#d9dde2'}"/>`); }
    out.push(`<g opacity="${op}" style="cursor:pointer" data-key="${key}"><rect x="${x}" y="0" width="${slot}" height="${Hh}" fill="transparent"/>${parts.join('')}<text x="${cx}" y="${base + 16}" fill="${sel ? '#ffb547' : '#8794a8'}" font-size="11" text-anchor="middle" font-family="IBM Plex Sans Condensed, sans-serif" font-weight="${sel ? 700 : 500}">${esc(SHORT_NAMES[key] || L.name)}</text><text x="${cx}" y="${base - L.height * k - 7}" fill="${sel ? '#ffb547' : '#56647a'}" font-size="10" text-anchor="middle" font-family="IBM Plex Mono, monospace">${L.height} m</text></g>`);
    x += slot;
  }
  const W = x + 10;
  const g = `<g stroke="#1c2738">${grid.map(m => `<line x1="24" x2="${W - 4}" y1="${base - m * k}" y2="${base - m * k}"/><text x="2" y="${base - m * k + 3}" fill="#56647a" stroke="none" font-size="9" font-family="IBM Plex Mono, monospace">${m}</text>`).join('')}</g>`;
  return `<div class="scroll-x"><svg class="vehicle-svg" viewBox="0 0 ${W} ${Hh}" style="min-width:${Math.round(W * 0.82)}px" role="img" aria-label="Launch vehicles drawn to scale; heights in metres">${g}${out.join('')}</svg></div>`;
}
function renderVehicleCard() {
  const el = $('#vehCard'); if (!el) return; const cfg = SETUP.cfg; const L = LAUNCHERS[cfg.launcher];
  const SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft])); if (cfg.payloadMass && SC.modules.CARGO) SC.modules.CARGO.dry = cfg.payloadMass;
  const pay = scTotalMass(SC);
  const dvCap = stackDeltaV(L, pay);
  const lunar = (cfg.profile || '').startsWith('lunar');
  let dep = 3.13, depTxt = 'trans-lunar injection';
  if (!lunar) { try { const tDep = isoToT(cfg.launch) + (cfg.refill ? cfg.refill.days * DAY : 0); const leg = cfg.legs[0]; const a = planetHelio('earth', tDep), b = planetHelio(leg.body, isoToT(leg.t)); const Lm = lambert(a.r, b.r, isoToT(leg.t) - tDep, BODIES.sun.mu, [0, 0, 1]); const vinf = vsub(Lm.v1, a.v); const rp = BODIES.earth.R + 200; dep = Math.sqrt(vdot(vinf, vinf) + 2 * BODIES.earth.mu / rp) - Math.sqrt(BODIES.earth.mu / rp); depTxt = `escape to ${BODIES[leg.body].name} (C3 ${vdot(vinf, vinf).toFixed(1)})`; } catch (e) { dep = 3.6; } }
  const leo = 9.3; const need = leo + (cfg.refill || (lunar && cfg.tliBy === 'sc') ? 0 : dep);
  const margin = dvCap - need;
  el.innerHTML = launcherSVG(cfg.launcher);
  el.querySelector('svg').addEventListener('click', e => { const g = e.target.closest('g[data-key]'); if (!g) return; const k = g.dataset.key; const ok = $$('#cfgForm select').find(s => [...s.options].some(o => o.value === k)); if (!ok) return; ok.value = k; ok.dispatchEvent(new Event('change')); });
  el.append(h('p', { class: 'p', style: 'margin-top:8px' }, L.blurb));
  el.append(h('div', { class: 'kv' },
    h('div', { class: 'k' }, 'Height · diameter'), h('div', { class: 'v' }, `${L.height} m · ${L.diameter} m`),
    h('div', { class: 'k' }, 'Liftoff mass with this payload'), h('div', { class: 'v' }, fMass(pay + L.stages.reduce((a, s) => a + s.dry + s.propMass, 0) + L.jettison.reduce((a, j) => a + j.mass, 0))),
    ...(CAPACITY[cfg.launcher] || []).flatMap(([k, v]) => [h('div', { class: 'k' }, 'Capacity: ' + k), h('div', { class: 'v' }, v)]),
    h('div', { class: 'k' }, 'Ideal stack Δv with this payload'), h('div', { class: 'v' }, fx(dvCap, 2) + ' km/s'),
    h('div', { class: 'k' }, `Needed: orbit ≈ ${leo} km/s${need > leo ? ' + ' + depTxt + ' ' + fx(dep, 2) : ''}`), h('div', { class: 'v ' + (margin >= 0 ? 'ok' : 'bad') }, fx(need, 2) + ' km/s'),
    h('div', { class: 'full note-s' }, margin >= 0 ? `Margin ≈ ${fx(margin, 2)} km/s (rough rocket-equation check; the full simulation decides).` : `Short by ≈ ${fx(-margin, 2)} km/s — expect the simulation to fall short.` + (cfg.refill ? '' : ''))));
  el.append(h('div', { class: 'scroll-x' }, h('table', { class: 't', style: 'margin-top:8px' }, h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', null, 'Propellant'), h('th', null, 'Prop. mass'), h('th', null, 'Thrust (vac)'))),
    h('tbody', null, ...L.stages.map(s => h('tr', null, h('td', null, s.name), h('td', null, PROP[s.prop].label), h('td', { class: 'n' }, fMass(s.propMass)), h('td', { class: 'n' }, fForce(s.thrustVac))))))));
}
function renderScCard() {
  const el = $('#scCard'); if (!el) return; const cfg = SETUP.cfg; const SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft])); if (cfg.payloadMass && SC.modules.CARGO) SC.modules.CARGO.dry = cfg.payloadMass;
  el.innerHTML = '';
  el.append(h('p', { class: 'p' }, h('b', null, SC.name), ` — ${fMass(scTotalMass(SC))} total${SC.crewMax ? `, up to ${SC.crewMax} crew` : ''}.`));
  el.append(h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Module'), h('th', null, 'Dry'), h('th', null, 'Propellant'))), h('tbody', null, ...Object.values(SC.modules).map(m => h('tr', null, h('td', null, m.name, m.engine ? h('div', { class: 'note-s' }, `${m.engine.name} · ${fForce(m.engine.thrust)} · Isp ${m.engine.isp} s · ${PROP[m.engine.prop].label}`) : null), h('td', { class: 'n' }, fMass(m.dry)), h('td', { class: 'n' }, m.prop ? fMass(m.prop) : '—')))))));
}
// ---------------- porkchop ----------------
function drawPorkchop() {
  const cv = $('#pork'); if (!cv) return; const cfg = SETUP.cfg; const leg = cfg.legs[0];
  const extra = (cfg.refill ? cfg.refill.days * DAY : 0) + (cfg.tmiDelay ?? 1) * 3600;
  const tDepCur = isoToT(cfg.launch) + extra, tArrCur = isoToT(leg.t), tofCur = tArrCur - tDepCur;
  const tD0 = tDepCur - 50 * DAY, tD1 = tDepCur + 50 * DAY, tf0 = 110 * DAY, tf1 = 360 * DAY; const nx = 80, ny = 60;
  const pc = porkchop('earth', leg.body, tD0, tD1, tf0, tf1, nx, ny);
  const W = cv.width, Hh = cv.height, L = 46, B = 30, Tp = 8, Rr = 10; const pw = W - L - Rr, ph = Hh - B - Tp;
  const g = cv.getContext('2d'); g.fillStyle = '#060a12'; g.fillRect(0, 0, W, Hh);
  const img = g.createImageData(pw, ph);
  const col = c3 => { if (!isFinite(c3)) return [10, 14, 22]; const f = clamp((Math.log(c3) - Math.log(8)) / (Math.log(120) - Math.log(8)), 0, 1); const band = Math.floor(f * 14) / 14; const a = [[20, 70, 110], [40, 160, 170], [230, 200, 90], [200, 80, 40], [60, 20, 30]]; const p = band * (a.length - 1); const i = Math.floor(p), r = p - i; const c0 = a[i], c1 = a[Math.min(i + 1, a.length - 1)]; return c0.map((v, k) => v + (c1[k] - v) * r); };
  for (let py = 0; py < ph; py++) for (let px = 0; px < pw; px++) {
    const fx_ = px / (pw - 1) * (nx - 1), fy = (1 - py / (ph - 1)) * (ny - 1); const i = Math.round(fx_), j = Math.round(fy);
    const c = col(pc.c3[j * nx + i]); const o = 4 * (py * pw + px); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, L, Tp);
  g.fillStyle = '#8794a8'; g.font = '11px "IBM Plex Mono", monospace';
  for (let d = 0; d <= 100; d += 25) { const x = L + d / 100 * pw; const dt = tToDate(tD0 + d / 100 * (tD1 - tD0)); const lab = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; const tw = g.measureText(lab).width; g.fillText(lab, clamp(x - tw / 2, 2, W - tw - 2), Hh - 10); g.fillRect(x, Tp + ph, 1, 4); }
  for (let tf = 120; tf <= 360; tf += 60) { const y = Tp + (1 - (tf * DAY - tf0) / (tf1 - tf0)) * ph; g.fillText(tf + 'd', 6, y + 4); g.fillRect(L - 4, y, 4, 1); }
  const X = td => L + (td - tD0) / (tD1 - tD0) * pw, Y = tf => Tp + (1 - (tf - tf0) / (tf1 - tf0)) * ph;
  if (tofCur > tf0 && tofCur < tf1) { g.strokeStyle = '#ffb547'; g.lineWidth = 2; g.beginPath(); g.arc(X(tDepCur), Y(tofCur), 7, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(X(tDepCur) - 12, Y(tofCur)); g.lineTo(X(tDepCur) + 12, Y(tofCur)); g.moveTo(X(tDepCur), Y(tofCur) - 12); g.lineTo(X(tDepCur), Y(tofCur) + 12); g.stroke(); }
  // minimum marker
  let bi = 0; for (let i = 0; i < pc.c3.length; i++) if (isFinite(pc.c3[i]) && pc.c3[i] < pc.c3[bi]) bi = i;
  const bx = bi % nx, by = Math.floor(bi / nx); g.fillStyle = '#5fe3a1'; g.beginPath(); g.arc(L + bx / (nx - 1) * pw, Tp + (1 - by / (ny - 1)) * ph, 4, 0, TAU); g.fill();
  const c3Cur = (() => { const a = planetHelio('earth', tDepCur), b = planetHelio(leg.body, tArrCur); const Lm = lambert(a.r, b.r, tofCur, BODIES.sun.mu, [0, 0, 1]); if (!Lm) return NaN; const d = vsub(Lm.v1, a.v); return vdot(d, d); })();
  $('#porkInfo').textContent = `Selected: depart ${fmtUTC(tDepCur, false)}, ${fx(tofCur / DAY, 0)} d → C3 ${fx(c3Cur, 1)} km²/s² · green dot = cheapest (C3 ${fx(pc.c3[bi], 1)})`;
  cv.onclick = e => {
    const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * Hh;
    if (px < L || px > L + pw || py < Tp || py > Tp + ph) return;
    const td = tD0 + (px - L) / pw * (tD1 - tD0), tf = tf0 + (1 - (py - Tp) / ph) * (tf1 - tf0);
    const launchT = td - extra; const iso = t => tToDate(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const oldArr = isoToT(leg.t); SETUP.cfg.launch = iso(Math.round(launchT / 60) * 60); delete SETUP.cfg.launchAz;
    const newArr = Math.round((td + tf) / 60) * 60; const dShift = newArr - oldArr; leg.t = iso(newArr);
    if (leg.tLand) leg.tLand = iso(isoToT(leg.tLand) + dShift);
    renderDetailSoft(); schedulePlan();
  };
}
// ---------------- background planning ----------------
function schedulePlan(delay = 650) {
  clearTimeout(SETUP.debounce); SETUP.plan = null; SETUP.planErr = null; SETUP.planning = true; SETUP.progress = 'waiting for inputs…'; renderPlanStatus();
  SETUP.debounce = setTimeout(() => {
    const cfg = JSON.parse(JSON.stringify(SETUP.cfg)); const scn = SETUP.scn; const t0 = performance.now();
    SETUP.planning = true; SETUP.progress = 'starting…'; renderPlanStatus();
    Planner.plan(cfg, m => { SETUP.progress = m; renderPlanStatus(); SETUP.onProgress && SETUP.onProgress(m); })
      .then(M => { if (JSON.stringify(SETUP.cfg) !== JSON.stringify(cfg)) return; SETUP.plan = M; SETUP.planMs = performance.now() - t0; SETUP.planning = false; renderPlanStatus(); SETUP.onDone && SETUP.onDone(M); })
      .catch(err => { if (err && err.superseded) return; SETUP.planErr = err; SETUP.planning = false; renderPlanStatus(); SETUP.onFail && SETUP.onFail(err); });
  }, delay);
}
function renderPlanStatus() {
  const st = $('#planStatus'), kp = $('#planKpis'), go = $('#goBtn'); if (!st) return;
  kp.innerHTML = '';
  if (SETUP.planErr) { st.innerHTML = `<b style="color:var(--red)">The planner could not solve this mission.</b> ${esc(SETUP.planErr.message || '')} — try values closer to the original.`; go.disabled = true; return; }
  if (SETUP.planning || !SETUP.plan) { st.innerHTML = `<span class="spinner"></span><b>Solving the trajectory…</b> <span style="color:var(--muted)">${esc(SETUP.progress)}</span>`; go.disabled = false; go.textContent = 'Fly this mission ▶'; return; }
  const M = SETUP.plan; const fail = M.failed;
  st.innerHTML = fail ? `<b style="color:var(--red)">Solved — but the mission falls short.</b> ${esc(M.warnings[0] || '')}` : `<b style="color:var(--green)">Trajectory solved</b> in ${(SETUP.planMs / 1000).toFixed(1)} s.${M.warnings.length ? ' <span style="color:var(--amber)">⚠ ' + esc(M.warnings.join(' ')) + '</span>' : ''}`;
  const dvTot = M.burns.reduce((a, b) => a + (b.dv || 0), 0), prop = M.burns.reduce((a, b) => a + (b.prop || 0), 0);
  const kpi = (l, v) => h('div', { class: 'kpi' }, h('span', { class: 'kl' }, l), h('span', { class: 'kv2' }, v));
  kp.append(kpi('Duration', fTime(M.tEnd - M.t0)), kpi('Burns', String(M.burns.length)), kpi('Total Δv (burns)', fx(dvTot, 0) + ' m/s'), kpi('Propellant burned', fMass(prop)));
  if (M.summary.ascent) kp.append(kpi('Ascent peak', M.summary.ascent.maxG.toFixed(1) + ' g'));
  const ents = M.summary.entries || (M.summary.entry ? [M.summary.entry] : []);
  if (ents.length) { const e = ents[ents.length - 1]; kp.append(kpi('Entry', `${e.vEI.toFixed(1)} km/s · ${e.maxG.toFixed(1)} g`), kpi('Landing error', fx(e.miss, 0) + ' km')); }
  go.disabled = false; go.textContent = 'Fly this mission ▶';
}
function launchFromSetup() {
  if (SETUP.plan) { startMission(SETUP.plan, SETUP.scn); return; }
  if (SETUP.planErr) return;
  const ov = $('#planning'); ov.hidden = false; $('#planTitle').textContent = 'Solving ' + SETUP.cfg.name + '…'; $('#planLog').innerHTML = '';
  const log = m => { $('#planLog').append(h('div', null, m)); $('#planLog').scrollTop = 1e9; };
  if (SETUP.progress) log(SETUP.progress);
  SETUP.onProgress = log;
  SETUP.onDone = M => { SETUP.onProgress = SETUP.onDone = SETUP.onFail = null; ov.hidden = true; startMission(M, SETUP.scn); };
  SETUP.onFail = err => { SETUP.onProgress = SETUP.onDone = SETUP.onFail = null; ov.hidden = true; };
  if (!SETUP.planning) schedulePlan(0);
}
