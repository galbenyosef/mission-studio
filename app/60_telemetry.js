// ============================================================================
// Telemetry: physics read-outs for the followed craft at the current instant.
// ============================================================================
const PHASE_TEXT = [
  [/ignition/i, 'Ignition: the engines light seconds before liftoff and build up to full thrust while hold-down clamps keep the rocket on the pad. The computers check every engine and can still shut everything down safely; only then do the clamps let go. Water pours onto the pad to absorb heat and sound — the white clouds are mostly steam.'],
  [/on the pad/i, 'Final countdown. The tanks are topped off and the vehicle stands on the pad, held down by clamps until the engines reach full thrust.'],
  [/^vertical/i, EXPLAIN.vertical], [/pitch-?over/i, 'Pitch-over: clear of the tower, the rocket tips a few degrees toward its launch azimuth. From here on it flies nose into the airflow and gravity bends the path toward horizontal.'], [/gravity turn/i, EXPLAIN.gravityTurn],
  [/closed-loop/i, 'Closed-loop guidance: above the dense atmosphere the flight computer steers to hit the target orbit exactly — altitude, speed and flight-path angle.'],
  [/stranded|shortfall|drift/i, 'The vehicle did not have enough propellant for this burn, so it stays on the trajectory it reached. Choose a more capable rocket or a lighter payload in the setup.'],
  [/parking|low Earth orbit|Earth orbits/i, EXPLAIN.parking], [/high Earth orbit/i, 'High Earth orbit: an elongated orbit reaching tens of thousands of kilometres, used to check out the spacecraft before committing to the Moon.'],
  [/trans-lunar injection/i, EXPLAIN.tli], [/trans-mars|departure burn/i, EXPLAIN.tmi], [/trans-earth injection/i, EXPLAIN.tei],
  [/translunar|outbound coast/i, EXPLAIN.coast + ' The craft climbs out of Earth’s gravity well, slowing from 10.8 km/s to under 1 km/s near the Moon.'],
  [/free return|lunar flyby|circumlunar/i, EXPLAIN.freeReturn],
  [/lunar orbit insertion|LOI/i, EXPLAIN.loi], [/lunar orbit|orbit around the Moon/i, 'Lunar orbit: about 2 hours per revolution at 110 km altitude. Each pass behind the Moon cuts radio contact with Earth.'],
  [/approach to (earth|mars|the moon)|final approach/i, 'Final approach: the craft falls toward the planet, gaining speed. A last trajectory correction sets the entry angle — too steep and the g-load and heating are lethal, too shallow and the craft skips off the atmosphere.'],
  [/powered descent|braking phase|approach phase|terminal|landing burn/i, EXPLAIN.pdi], [/sky crane/i, 'Sky crane: the descent stage hovers and lowers the rover on bridles, then flies away to crash at a safe distance.'],
  [/driving/i, 'Driving: each of the six wheels has its own motor; top speed is 4.2 cm/s (0.15 km/h). AutoNav builds a 3D map of the ground ahead and steers around hazards by itself, because commands from Earth take 5–20 minutes to arrive. Drives are planned on Earth the day before and run around local midday.'],
  [/surface|landed|touchdown|making propellant/i, EXPLAIN.surface], [/lunar ascent|mars ascent|ascent/i, EXPLAIN.ascent],
  [/rendezvous|docking/i, EXPLAIN.rendezvous], [/transearth|return coast|return to Earth/i, 'Coasting home: Earth’s gravity accelerates the craft to about 11 km/s by the time it reaches the atmosphere.'],
  [/parachute/i, 'Parachutes: drogues stabilise the capsule at supersonic or high-subsonic speed, then the mains slow it to a few metres per second.'],
  [/skip/i, 'Skip entry: the capsule uses lift to bounce back out of the upper atmosphere, then re-enters — spreading out the heat and extending the range.'],
  [/entry|plasma/i, EXPLAIN.entry], [/edl/i, EXPLAIN.edl],
  [/mars orbit insertion|capture/i, EXPLAIN.moi], [/mars orbit|orbit around mars|parking orbit at mars|aerobrak/i, 'Orbiting Mars: one Martian day (sol) is 24 h 37 min. Elliptical orbits are cheap to enter and let the orbiter survey the surface below.'],
  [/flyby|gravity assist/i, EXPLAIN.flyby], [/cruise|heliocentric|solar orbit|interplanetary/i, EXPLAIN.cruise], [/departure hyperbola/i, 'Departure hyperbola: the craft is escaping Earth. Its speed relative to Earth tends toward v∞, the hyperbolic excess speed.'],
  [/spent|stage/i, 'A spent stage: empty tanks and engines, discarded to save mass.'], [/recovery/i, 'Recovery: ships and helicopters reach the capsule within the hour.'],
];
// Space Shuttle flights: checked before the general texts (their phase names overlap: entry, approach, docking)
const SHUTTLE_TEXT = [
  [/coasting with the tank/i, 'Main engine cutoff. The empty External Tank is still attached; eighteen seconds later it is released and the orbiter moves clear with its small reaction-control jets.'],
  [/External Tank — falling/i, 'The External Tank on its own: 26 tonnes of empty aluminium. Its orbit dips into the atmosphere, so half an orbit later it breaks up and falls into a remote stretch of ocean — the only part of the Shuttle not reused.'],
  [/climbing to apogee|MECO — coasting/i, 'Coasting up to the high point of the orbit. The low point is still inside the atmosphere; at the top the OMS engines will fire to lift it out (OMS-2).'],
  [/\bOMS-\d|orbit insertion|circularis/i, 'Orbital Maneuvering System: two 27 kN engines in the pods beside the tail. Their propellants — monomethylhydrazine and nitrogen tetroxide — ignite on contact, so the engines start reliably every time.'],
  [/NC-\d|catching up|closing in/i, 'Phasing: the orbiter starts thousands of kilometres behind the station. A lower orbit is a faster one, so each burn adjusts the height to close the gap at just the right rate — arriving half an orbit after terminal initiation.'],
  [/terminal initiation|TI —|closing on the station/i, 'Terminal initiation: the burn that commits to the rendezvous. Half an orbit later the orbiter arrives 600 m below the station; the crew flies the last part by hand, watching radar and laser range-finder data.'],
  [/R-bar approach/i, 'R-bar approach: the orbiter closes in from directly below the station, along the line to Earth’s centre. Orbital mechanics help: anything below the station tends to drift up toward it, so the approach is gentle.'],
  [/R-bar pitch/i, 'R-bar pitch maneuver: a slow 360° back-flip, 183 m below the station. For nine minutes the belly faces the station crew, who photograph every heat-shield tile — a check added after Columbia was lost in 2003.'],
  [/moving to the V-bar/i, 'Swinging to the V-bar: a quarter circle up and in front of the station, to its line of flight. The orbiter pitches nose-up so its docking port faces the station.'],
  [/docked to the ISS/i, 'Docked: orbiter and station fly as one 500-tonne spacecraft. The station’s robot arm moves cargo between them, and the orbiter can even draw power from the station to stay longer.'],
  [/backing away/i, 'Undocking: springs push the spacecraft apart; the orbiter backs away slowly along the V-bar with its small jets, careful not to blast the station’s solar arrays.'],
  [/flyaround/i, 'Flyaround: a last lap around the station at about 180 m, so the crew can photograph every side of it for engineers on the ground.'],
  [/V-bar approach|docking/i, 'Final approach along the V-bar at a few centimetres per second. The docking mechanism’s capture ring latches on, then retracts to pull the two spacecraft together and seal the hatches.'],
  [/deploy/i, 'Payload deploy: the 15 m Canadarm, flown from the aft flight-deck windows, lifts the payload out of the bay, holds it while its systems come alive, and lets go.'],
  [/hubble in orbit/i, 'Free flying: the Hubble Space Telescope on its own, 615 km up, its two solar array wings unrolled.'],
  [/deorbit preparations|deorbit burn/i, 'Deorbit: about an hour before landing, half a world away from the runway, the orbiter fires both OMS engines against its direction of flight. The orbit’s far side drops into the atmosphere — there is no turning back.'],
  [/falling toward the atmosphere/i, 'Falling toward the atmosphere. The orbiter has turned around to fly nose-first with its nose 40° up, so the black heat-shield tiles on its belly will take the heat.'],
  [/entry/i, 'Entry: the orbiter meets the air at 7.8 km/s and a 40° angle of attack. It is a glider: it steers by banking, and each roll reversal swings its path back toward the runway. The tiles on its belly reach 1,260 °C, the wing leading edges 1,500 °C.'],
  [/TAEM/i, 'Terminal area energy management: below 25 km and Mach 2.5 the orbiter is a supersonic glider. The computers manage its energy — speed and height — so it arrives at the runway with just enough to land.'],
  [/heading alignment/i, 'Heading alignment cone: a turn around an imaginary cylinder to line up with the runway. Wider for more energy, tighter for less: this is the last big correction.'],
  [/outer glideslope/i, 'Outer glideslope: a 19° dive at about 290 knots — seven times steeper than an airliner’s. The split rudder opens as a speed brake to hold the airspeed.'],
  [/flare|inner glideslope/i, 'Preflare and flare: the commander pulls the nose up to flatten the dive onto a 1.5° glideslope, the landing gear comes down, and the orbiter floats toward the runway, slowing to about 200 knots.'],
  [/rollout/i, 'Rollout: main gear first at about 200 knots (370 km/h), then the nose comes down; the drag chute and the brakes stop the 100-tonne glider within about 2.7 km.'],
  [/wheel stop|on the runway/i, '“Wheel stop.” Ground crews in protective suits approach first, checking for toxic propellant vapours; purge and cooling air is connected to the orbiter before the crew can leave, about an hour later.'],
  [/^in orbit|flight tests|in orbit —/i, 'In orbit: one lap every 90 minutes at about 28,000 km/h, sixteen sunrises and sunsets a day. The payload bay doors stay open: their inner faces are the radiators that keep the orbiter cool.'],
];
const MARS_TEXT = [
  [/parachute/i, 'Supersonic parachute: a 21.5 m disk-gap-band canopy opens at about Mach 1.7. The air is only 1 % as dense as Earth’s, so the parachute slows the craft to about 100 m/s — not enough to land.'],
  [/powered|sky crane|terminal|approach/i, 'Powered descent in thin Martian air: the final ~100 m/s must be removed by rocket engines. The radar measures altitude and terrain-relative navigation picks a safe spot.'],
  [/entry|plasma/i, EXPLAIN.edl],
];
function explainPhase(...names) { const s = names.filter(Boolean).join(' | '); if (MV.md && isShuttle(MV.md)) for (const [re, txt] of SHUTTLE_TEXT) if (re.test(s)) return txt; if (/\[mars\]/.test(s)) for (const [re, txt] of MARS_TEXT) if (re.test(s)) return txt; for (const [re, txt] of PHASE_TEXT) if (re.test(s)) return txt; return ''; }
function computeTele(c, t) {
  if (!c || !c.s || !c.P) return null;
  const md = MV.md, s = c.s, P = c.P; const ref = c.dom || s.ref; const rD = c.rD || s.r, vD = c.vD || s.v;
  const Rb = ref === 'sun' ? BODIES.sun.R : surfaceRadius(ref);
  const T = { c, s, ref, t };
  T.alt = vnorm(rD) - Rb;
  T.vIn = vnorm(vD);
  const rotB = ref === 'earth' || ref === 'mars' || ref === 'moon';
  const vRel = rotB ? vsub(vD, vcross(bodyOmegaEcl(ref, t), rD)) : vD;
  T.vRel = vD; T.vSurf = vnorm(vRel); T.vVert = vdot(vD, vunit(rD));
  T.ll = ref !== 'sun' ? subPointLL(ref, rD, t) : null;
  T.grav = GRAV_BODIES.map(b => { const d = vsub(helio(b, t).r, P); const dist = vnorm(d); return { body: b, a: BODIES[b].mu / (dist * dist) * 1000, dir: vunit(d), dist }; }).sort((x, y) => y.a - x.a);
  T.dEarth = vnorm(vsub(P, helio('earth', t).r)); T.dMoon = vnorm(vsub(P, helio('moon', t).r)); T.dMars = vnorm(vsub(P, helio('mars', t).r)); T.dSun = vnorm(P);
  T.light = T.dEarth / C_KMS;
  const m = s.m > 0 ? s.m : null; T.m = m;
  T.thrust = s.T || 0; T.thrustAcc = m && T.thrust ? T.thrust / m : 0; T.thrustDir = s.dir;
  const Dm = s.D ? vnorm(s.D) : 0; T.dragAcc = m ? Dm / m : 0; T.dragDir = s.D;
  const gLoc = BODIES[ref] ? BODIES[ref].mu / Math.pow(Math.max(vnorm(rD), Rb), 2) * 1000 : 0; T.gLocal = gLoc;
  if (s.surface || s.pad) { T.proper = gLoc; T.properNote = s.pad && s.T > 0 ? 'held down by clamps' : 'standing on the surface'; }
  else if (s.extra && s.extra.gload != null) { T.proper = s.extra.gload * G0; }
  else { const f = vadd(vscale(s.dir || [0, 0, 0], T.thrust), s.D || [0, 0, 0]); T.proper = m ? vnorm(f) / m : 0; }
  // orbit about the dominant body
  const b = ref; const r = rD, v = vD;
  T.orbBody = b; T.orbR = r; T.orbV = v; T.el = rv2coe(r, v, BODIES[b].mu); T.orbRb = b === 'sun' ? BODIES.sun.R : surfaceRadius(b);
  T.vEsc = Math.sqrt(2 * BODIES[b].mu / vnorm(r));
  // vehicle
  T.cfg = cfgAt(c, t); T.burn = md.burnAt(t, c.o.id);
  return T;
}
// ---------------- propulsion status: engines firing vs coasting (inertial flight) ----------------
const PSTAT = { cur: null, key: '' };
function engineName(T) {
  const md = MV.md, cf = T.cfg, L = md.L, s = T.s;
  if (cf && cf.key === 'launch') { const st = L.stages.find(x => x.id === (s.extra && s.extra.stage)) || L.stages[cf.stFrom] || L.stages[0]; return `${st.n} × ${st.engine}`; }
  const x = md.poweredAt(T.t, T.c.o.id); const b = (x && x.burn) || T.burn;
  if (b && b.engine) return b.engine;
  const mod = md.SC.modules.DS || md.SC.modules.LDR || Object.values(md.SC.modules).find(m => m.engine);
  if (mod && mod.engine) return mod.engine.name;
  const up = L.stages[L.stages.length - 1]; return up ? `${up.n} × ${up.engine}` : ''; // e.g. Starship lands on its own upper-stage engines
}
function propStatus(T, t) {
  const md = MV.md; if (!md || !T) return null;
  const c = T.c, s = T.s, id = c.o.id;
  const cur = md.poweredAt(t, id), next = md.nextPowered(t, id);
  const short = n => String(n || '').split('—')[0].trim();
  if (s.pad && s.ign) return { k: 'burn', l: 'IGNITION', name: 'Ignition', d: `${engineCounts(s.ign.liq)} at ${Math.round(s.ign.f * 100)} % thrust · hold-down clamps holding · liftoff in ${fTime(Math.max(0, md.M.t0 - t))}` };
  if (s.pad) return { k: 'rest', l: 'ON THE PAD', d: `liftoff in ${fTime(Math.max(0, md.M.t0 - t))}` };
  if (cur && !s.surface && !(T.thrust > 0) && T.cfg && T.cfg.key === 'launch') return { k: 'burn', l: 'STAGING', name: cur.name, d: `${cur.name} · engines off for a moment between stages` };
  if ((T.thrust > 0 || cur) && !s.surface) {
    const nm = cur ? cur.name : 'Engine burn'; const parts = [nm]; const eng = engineName(T);
    if (eng) parts.push(eng);
    if (T.thrustAcc > 0) parts.push(`${fx(T.thrustAcc / G0, 2)} g`);
    if (cur) parts.push(`${fTime(Math.max(0, cur.t1 - t))} left`);
    return { k: 'burn', l: 'ENGINE ON', name: nm, d: parts.join(' · ') };
  }
  const nxt = next ? `next burn: ${short(next.name)} in ${fTime(next.t0 - t)}` : 'no more burns planned';
  if (s.surface) return { k: 'rest', l: 'ON THE SURFACE', d: `${BODIES[s.ref].name} · ${nxt}` };
  const ex = s.extra || {};
  if (ex.chute) return { k: 'aero', l: 'ENGINES OFF', d: `under parachutes, descending at ${fSpeed(Math.abs(Math.min(T.vVert, 0)))}` };
  if (isShuttle(md) && c.o.id === 'ship') { // the orbiter after entry: a glider, then a vehicle rolling on its wheels
    const ph = ex.phase || '';
    if (/rollout/.test(ph)) return { k: 'aero', l: 'ROLLOUT', d: `on the runway at ${fx(T.vSurf * 1000 / 0.5144, 0)} knots — ${T.cfg && T.cfg.dragChute ? 'drag chute and brakes' : 'brakes and air drag'} slowing the orbiter` };
    if (/TAEM|alignment|glideslope|flare/.test(ph)) return { k: 'aero', l: 'GLIDING', d: `engines off, trading height for speed — ${fx(T.vSurf * 1000 / 0.5144, 0)} knots, sinking ${fx(Math.max(0, -T.vVert * 1000), 0)} m/s` };
  }
  if (T.dragAcc > 0.05 || ex.q > 50) return { k: 'aero', l: 'ENGINES OFF', d: `atmospheric entry — air drag is braking the craft (${fx(T.dragAcc / G0, 1)} g)` };
  const ph = md.phaseAt(t); const fly = ph && /flyby|gravity assist/i.test(ph.name);
  const who = !fly ? '' : /lunar|moon/i.test(ph.name) ? 'the Moon’s' : /mars/i.test(ph.name) ? 'Mars’s' : /earth/i.test(ph.name) ? 'Earth’s' : /venus/i.test(ph.name) ? 'Venus’s' : /jupiter/i.test(ph.name) ? 'Jupiter’s' : 'the planet’s';
  return { k: 'coast', l: 'COASTING', d: `${fly ? `gravity assist, engines off — ${who} pull bends the path` : 'inertial flight, engines off'} · ${nxt}` };
}
function drawProp(T, t) {
  const el = $('#prop'); const st = propStatus(T, t); PSTAT.cur = st;
  const met = t - MV.md.M.t0;
  if (!st || (met > -10.0001 && met < 0)) { if (!el.hidden) el.hidden = true; return; } // the big launch countdown already says it
  if (el.hidden) el.hidden = false;
  if (el.className !== st.k) el.className = st.k;
  const pl = el.children[1], pd = el.children[2];
  if (pl.textContent !== st.l) pl.textContent = st.l; if (pd.textContent !== st.d) pd.textContent = st.d;
}
const TELE = { built: null, els: {}, lastDraw: 0, objSel: 'ship' };
function buildTelePanel() {
  const root = $('#tele'); root.innerHTML = '';
  const kv = (id, k) => [h('div', { class: 'k' }, k), h('div', { class: 'v', id: 'tv-' + id }, '—')];
  const sec = (title, rt, ...kids) => h('div', { class: 'sec' }, h('h4', null, title, h('span', { class: 'rt', id: 'trt-' + title.replace(/\W/g, '') }, rt || '')), ...kids);
  root.append(
    h('div', { class: 't-obj' }, h('span', { id: 'tv-obj' }, ''), h('span', { id: 'tv-crew' }, '')),
    h('div', { class: 't-phase' }, h('span', { class: 'chip', id: 'tv-chip' }), h('span', { class: 'name', id: 'tv-phase' }, '—')),
    h('div', { class: 't-explain', id: 'tv-explain' }),
    sec('Flight', '', h('div', { class: 'kv' }, ...kv('alt', 'Altitude'), ...kv('vin', 'Speed (inertial)'), ...kv('vsurf', 'Speed over the surface'), ...kv('vvert', 'Vertical speed'), ...kv('ll', 'Ground track'), ...kv('dE', 'Distance from Earth'), ...kv('dX', 'Distance from Moon'), ...kv('light', 'Radio delay (one way)'))),
    sec('Forces', '', h('div', { class: 'gauge' }, h('span', { class: 'big', id: 'tv-g' }, '0.00'), h('span', { class: 'unit' }, 'g felt'), h('span', { class: 'note', id: 'tv-gnote' }, '')),
      h('div', { class: 'kv', style: 'margin-top:6px' }, ...kv('thr', 'Thrust acceleration'), ...kv('drag', 'Aerodynamic deceleration')),
      h('div', { class: 'note-s', style: 'margin:8px 0 4px' }, 'Gravitational pull here (log scale)'), h('div', { class: 'bars', id: 'tv-bars' })),
    sec('Orbit', '', h('div', { class: 'kv' }, ...kv('pa', 'Periapsis × apoapsis'), ...kv('ae', 'Semi-major axis · eccentricity'), ...kv('inc', 'Inclination'), ...kv('per', 'Period'), ...kv('c3', 'Specific energy · C3'), ...kv('vesc', 'Escape speed here'))),
    sec('Vehicle', '', h('div', { class: 'kv' }, ...kv('cfg', 'Configuration'), ...kv('mass', 'Mass'), ...kv('eng', 'Engine'), ...kv('prop', 'Propellant'), ...kv('thrN', 'Thrust · Isp'), ...kv('mdot', 'Propellant flow'), ...kv('tw', 'Thrust-to-weight'), ...kv('burn', 'Burn'), ...kv('dv', 'Δv spent so far')), h('div', { id: 'tv-tanks' })),
    h('div', { class: 'sec', id: 'tv-atmoSec' }, h('h4', null, 'Atmosphere'), h('div', { class: 'kv' }, ...kv('q', 'Dynamic pressure q'), ...kv('mach', 'Mach'), ...kv('heat', 'Heat flux (stagnation)'), ...kv('bo', 'Radio blackout'), ...kv('chute', 'Parachutes'), ...kv('bank', 'Bank angle'), ...kv('alpha', 'Angle of attack'))),
  );
  TELE.els = {}; for (const e of root.querySelectorAll('[id^="tv-"]')) TELE.els[e.id.slice(3)] = e;
}
function setv(id, txt, cls) { const e = TELE.els[id]; if (!e) return; if (e.textContent !== txt) e.textContent = txt; if (cls !== undefined) e.className = 'v' + (cls ? ' ' + cls : ''); }
function drawTele(T, t) {
  if (!TELE.els.alt) return;
  const md = MV.md; const E = TELE.els;
  if (!T) { setv('phase', t < md.M.t0 ? 'Countdown' : '—'); return; }
  const c = T.c, s = T.s;
  E.obj.textContent = c.o.name; E.crew.textContent = c.o.crew ? `${c.o.crew} crew` : (c.o.kind === 'craft' ? 'uncrewed' : c.o.kind);
  const ph = md.phaseAt(t); const exPh = s.extra && s.extra.phase;
  const label = exPh ? exPh.charAt(0).toUpperCase() + exPh.slice(1) : (ph ? ph.name : '—');
  E.phase.textContent = label; E.chip.style.background = ph ? ph.color : '#666';
  const b = T.burn; const ex = explainPhase(b && b.name, exPh, ph && ph.name, T.ref === 'mars' && T.alt < 200 ? '[mars]' : ''); if (E.explain.textContent !== ex) E.explain.textContent = ex;
  const RB = { earth: 'Earth', moon: 'Moon', mars: 'Mars', sun: 'Sun' };
  if (T.ref === 'earth' && (s.surface || s.pad)) T.alt = Math.max(T.alt, 0); // the drawn ground sits a fraction of a metre under the datum
  setv('alt', T.ref === 'sun' ? '—' : (T.alt < -0.0005 ? '−' + fDist(-T.alt) + ' (below datum)' : fDist(Math.max(T.alt, 0))) + ' · ' + RB[T.ref]);
  setv('vin', fSpeed(T.vIn)); setv('vsurf', T.ref === 'sun' || T.alt > 1500 ? '—' : fSpeed(T.vSurf)); setv('vvert', Math.abs(T.vVert) < 5e-4 ? '0 m/s' : (T.vVert >= 0 ? '+' : '−') + fSpeed(Math.abs(T.vVert)));
  setv('ll', T.ll ? `${fLat(T.ll[0])} ${fLon(T.ll[1])}` : 'heliocentric');
  setv('dE', fDist(T.dEarth));
  const other = md.cfg.dest === 'mars' || (md.cfg.profile || '').startsWith('mars') || md.cfg.profile === 'multi-flyby' ? ['Mars', T.dMars] : ['Moon', T.dMoon];
  E.dX.previousSibling.textContent = 'Distance from ' + other[0]; setv('dX', fDist(other[1]));
  setv('light', T.light < 1 ? fx(T.light * 1000, 0) + ' ms' : T.light < 120 ? fx(T.light, 2) + ' s' : fTime(T.light));
  // forces
  const g = T.proper / G0; E.g.textContent = g < 0.01 ? (g < 1e-4 ? '0.0000' : g.toFixed(4)) : g.toFixed(2);
  E.gnote.textContent = T.properNote || (g < 1e-3 && !(T.thrust > 0) ? 'free fall — weightless' : T.thrust > 0 ? 'engines firing' : T.dragAcc > 0.05 ? 'air braking' : '');
  setv('thr', T.thrustAcc > 0 ? fAcc(T.thrustAcc) + ` (${(T.thrustAcc / G0).toFixed(2)} g)` : '—');
  setv('drag', T.dragAcc > 1e-5 ? fAcc(T.dragAcc) + ` (${(T.dragAcc / G0).toFixed(2)} g)` : '—');
  const bars = E.bars; const top = T.grav.slice(0, 5); const amax = top[0].a;
  if (bars.childElementCount !== top.length) { bars.innerHTML = ''; for (let i = 0; i < top.length; i++) bars.append(h('div', { class: 'bar' }, h('span', { class: 'n' }), h('div', { class: 'track' }, h('div', { class: 'fill' })), h('span', { class: 'val' }))); }
  top.forEach((gr, i) => { const row = bars.children[i]; row.children[0].textContent = BODIES[gr.body].name; const f = clamp(1 + Math.log10(gr.a / amax) / 6, 0.02, 1); row.children[1].firstChild.style.cssText = `width:${(f * 100).toFixed(1)}%;background:${BODY_COLORS[gr.body]}`; row.children[2].textContent = fAcc(gr.a); });
  // orbit
  const el = T.el, ob = T.orbBody; const Rb = T.orbRb;
  $('#trt-Orbit').textContent = 'around ' + BODIES[ob].name;
  if (el.rp < Rb && (s.surface || s.pad || T.alt < 200 && ob !== 'sun')) { setv('pa', el.e < 1 ? `suborbital · apoapsis ${fDist(el.ra - Rb)}` : 'escape', ''); setv('per', '—'); }
  else if (el.e < 1) { setv('pa', `${fDist(el.rp - Rb)} × ${fDist(el.ra - Rb)}`, el.rp < Rb ? 'bad' : ''); setv('per', fTime(el.period)); }
  else { setv('pa', `${fDist(el.rp - Rb)} × ∞ (escape)`, el.rp < Rb ? 'bad' : 'hi'); setv('per', 'v∞ ' + fSpeed(el.vinf)); }
  setv('ae', `${fDist(el.a > 0 ? el.a : -Math.abs(el.a))} · ${el.e.toFixed(4)}`);
  const pole = ob === 'sun' ? [0, 0, 1] : bodyPoleEcl(ob, t); setv('inc', ((vangle(vcross(T.orbR, T.orbV), pole)) * RAD).toFixed(2) + '°' + (ob === 'sun' ? ' (ecliptic)' : ' (equator)'));
  setv('c3', `${fx(el.energy, 2)} km²/s² · C3 ${fx(2 * el.energy, 2)}`, el.energy > 0 ? 'hi' : '');
  setv('vesc', fSpeed(T.vEsc));
  // vehicle
  const cf = T.cfg; let cfgTxt = '—';
  const L = md.L;
  if (cf) {
    if (cf.key === 'launch') cfgTxt = L.sideMount ? ['Orbiter', 'External Tank', cf.boosters ? '2 boosters' : null].filter(Boolean).join(' + ') : L.stages.filter((st, i) => (st.parallel ? cf.boosters : i >= cf.stFrom)).map(st => st.id).join(' + ') + (cf.fairing ? ' + fairing' : '') + (cf.les ? ' + escape tower' : '');
    else if (cf.sc === 'shuttle') cfgTxt = ['Orbiter', cf.docked ? 'docked to the ISS' : null, cf.bay === 'open' ? 'payload bay open' : 'bay doors closed', cf.payArm ? 'payload on the arm' : null, cf.gear ? 'gear down' : null, cf.dragChute ? 'drag chute' : null].filter(Boolean).join(' · ');
    else if (cf.sc === 'iss') cfgTxt = 'International Space Station' + (cf.mplm ? ' + logistics module' : '');
    else if (cf.key === 'stack') cfgTxt = `${L.stages[cf.stage].id} + spacecraft`;
    else if (cf.key === 'stage') cfgTxt = L.stages[cf.stage].name;
    else if (cf.key === 'capsule') cfgTxt = 'Capsule' + (cf.chutes ? ' under parachutes' : '');
    else cfgTxt = (cf.parts || []).join(' + ') + (cf.landed ? ' (landed)' : '');
  }
  setv('cfg', cfgTxt);
  setv('mass', T.m ? fMass(T.m) : '—');
  let eng = '—', prop = '—', thrTxt = '—', mdot = '—', tw = '—', burnTxt = '—';
  if (T.thrust > 0) {
    if (cf && cf.key === 'launch') {
      const st = L.stages.find(x => x.id === (s.extra && s.extra.stage)) || L.stages[cf.stFrom] || L.stages[0];
      const bst = L.stages[0].parallel && cf.boosters ? L.stages[0] : null;
      eng = `${st.n} × ${st.engine}` + (bst && bst !== st ? ` + ${bst.n} × ${bst.engine}` : '');
      prop = PROP[st.prop].label + (bst && bst !== st && bst.prop !== st.prop ? ' + ' + PROP[bst.prop].label : '');
      const pr = Math.exp(-Math.max(T.alt, 0) / 7.2); const isp = st.ispVac + (st.ispSL - st.ispVac) * pr;
      thrTxt = `${fForce(T.thrust)} · ${isp.toFixed(0)} s`; mdot = fx(T.thrust / (isp * G0), 0) + ' kg/s';
    } else if (b) {
      eng = b.engine; prop = (PROP[b.propType] || {}).label || b.propType || '—'; thrTxt = `${fForce(T.thrust)} · ${fx(b.isp, 0)} s`; mdot = fx(T.thrust / (b.isp * G0), 1) + ' kg/s';
      burnTxt = `${b.name.split('—')[0].trim()} ${fTime(t - b.t)} / ${fTime(b.dur)} · Δv ${fx(b.dv, 0)} m/s`;
    } else { const mod = md.SC.modules.DS || md.SC.modules.LDR; if (mod && mod.engine) { eng = mod.engine.name; prop = PROP[mod.engine.prop].label; thrTxt = `${fForce(T.thrust)} · ${mod.engine.isp} s`; mdot = fx(T.thrust / (mod.engine.isp * G0), 1) + ' kg/s'; } else thrTxt = fForce(T.thrust); }
    if (T.gLocal > 0 && T.m) tw = (T.thrust / (T.m * T.gLocal)).toFixed(2);
  } else if (cf && (cf.key === 'launch' || cf.key === 'stack')) { const st = cf.key === 'launch' ? L.stages[cf.stFrom] : L.stages[cf.stage]; eng = `${st.n} × ${st.engine} (off)`; prop = PROP[st.prop].label; }
  setv('eng', eng); setv('prop', prop); setv('thrN', thrTxt); setv('mdot', mdot); setv('tw', tw); setv('burn', burnTxt);
  setv('dv', fx(md.dvSpent(t, c.o.id), 0) + ' m/s');
  // tanks
  const tanksEl = E.tanks; const tks = md.tanks;
  if (tanksEl.childElementCount !== tks.length + 1) { tanksEl.innerHTML = ''; tanksEl.append(h('div', { class: 'note-s', style: 'margin:8px 0 2px' }, 'Propellant remaining')); for (const tk of tks) tanksEl.append(h('div', { class: 'tank' }, h('span', { class: 'tn' }), h('span', { class: 'tv' }), h('div', { class: 'track' }, h('div', { class: 'fill' })))); }
  const upObj = md.M.obj('upper');
  tks.forEach((tk, i) => {
    const row = tanksEl.children[i + 1]; const v = md.tankValue(tk, t); const active = b && b.engine === tk.engine;
    const gone = tk.id === 'upper' && upObj && t > upObj.t0;
    row.children[0].textContent = (active ? '▶ ' : '') + tk.name + (gone ? ' (separated)' : '');
    row.children[0].style.color = active ? 'var(--amber)' : gone ? 'var(--dim)' : '';
    row.children[1].textContent = v == null ? '—' : fMass(v);
    row.children[2].firstChild.style.cssText = `width:${v == null ? 0 : clamp(v / tk.cap * 100, 0, 100).toFixed(1)}%;background:${(PROP[tk.prop] || {}).plume || '#5cc8ff'}`;
  });
  if (cf && cf.key === 'launch' && t >= md.M.t0 && s.m) {
    let dry = 0; L.stages.forEach((st, i) => { if (st.parallel ? cf.boosters : i >= cf.stFrom) dry += st.dry; });
    const jet = L.jettison.filter(j => (j.part === 'fairing' && cf.fairing) || (j.part === 'LES' && cf.les) || (j.part === 'SAJ' && cf.saj)).reduce((a, j) => a + j.mass, 0);
    const lvProp = s.m - dry - scTotalMass(md.SC) - jet;
    setv('prop', (E.prop.textContent || '') + ''); E.prop.title = 'Launch-vehicle propellant on board: ' + fMass(lvProp);
    setv('mass', fMass(s.m) + ' (' + fMass(Math.max(lvProp, 0)) + ' propellant)');
  }
  // atmosphere
  const ex2 = s.extra || {};
  const inAtm = (T.ref === 'earth' && T.alt < 130) || (T.ref === 'mars' && T.alt < 130);
  E.atmoSec.style.display = inAtm && !s.surface ? '' : 'none';
  if (inAtm) {
    setv('q', ex2.q != null ? fx(ex2.q / 1000, 2) + ' kPa' : '—'); setv('mach', ex2.mach != null ? fx(ex2.mach, 2) : '—');
    setv('heat', ex2.heat != null ? fx(ex2.heat, 1) + ' W/cm²' : '—', ex2.heat > 50 ? 'bad' : '');
    setv('bo', ex2.blackout ? 'NO SIGNAL' : 'clear', ex2.blackout ? 'bad' : 'ok');
    setv('chute', ex2.chute ? (ex2.chute >= 2 ? 'main canopies' : 'drogue / supersonic') : (cf && cf.dragChute ? 'drag chute' : '—')); setv('bank', ex2.bank != null ? fx(ex2.bank, 0) + '°' : '—');
    setv('alpha', ex2.alpha != null ? fx(ex2.alpha, 1) + '°' : '—'); E.alpha.parentNode && (E.alpha.style.display = E.alpha.previousSibling.style.display = ex2.alpha != null ? '' : 'none');
  }
}
