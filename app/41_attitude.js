// ============================================================================
// Roll near the ground: launches, landings and liftoffs.
// basisQuat builds an attitude from a nose direction and a reference vector — the craft's +X axis is nose × reference.
// In flight the reference is the local vertical, which fails exactly when a rocket stands on its tail: craft used to
// spin about their long axis the moment they lifted off and again as they settled onto their legs. Around launches,
// landings and liftoffs a craft therefore keeps a lateral axis fixed to the ground — the axis it pitches about. The
// nose can rise, lean or settle with no turn about it; only a deliberate roll program turns that axis (the Saturn V
// rolling from its pad azimuth to the flight azimuth, a lander lifting off and swinging round to its ascent heading).
// ============================================================================
const ATT = { ramp: 4, rollRate: 8 * DEG, minRoll: 3, flip: 5 }; // s to hand over to the flight frame; roll program rate; shortest roll (s); Starship's flip for the landing burn (s)
function azDir(lf, az) { return vadd(vscale(lf.north, Math.cos(az)), vscale(lf.east, Math.sin(az))); } // horizontal unit vector at azimuth az (rad, from north through east)
function azOf(lf, v) { return Math.atan2(vdot(v, lf.east), vdot(v, lf.north)); }
function wrapPi(a) { return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; }
// azimuth of a craft's travel over the ground at t (relative to the turning surface), or null if it moves slower than vMin (km/s)
function trackAz(o, t, vMin) {
  const s = o.stateAt(t); if (!s || s.surface) return null;
  const va = vsub(s.v, vcross(bodyOmegaEcl(s.ref, t), s.r)), up = vunit(s.r), vh = vsub(va, vscale(up, vdot(va, up)));
  return vnorm(vh) < vMin ? null : azOf(localFrame(s.ref, s.r, t), vh);
}
// The windows in which a craft rolls about a ground-fixed axis, worked out once per craft:
//   launch — from the pad through the ascent: the axis across the flight path (the Saturn V first rolls into it);
//   land   — from the start of the final descent (the engine burn that ends at touchdown, or the parachutes opening)
//            through the stay on the surface: the axis across the direction of travel then (a rover: across the way it
//            will first drive);
//   lift   — from liftoff until the craft is well on its way: a roll from the landed heading to the ascent heading.
// Each episode: {kind, tA, tB, body, az(t) → azimuth of the axis, z: the axis is the craft's Z (else X), out: hands over to
// the flight frame over its last ATT.ramp seconds, tIgn: Starship's landing-burn ignition}. Starship carries its heat
// shield on −X and pitches about Z.
function attEpisodes(c) {
  if (c.attEp) return c.attEp;
  const md = MV.md, o = c.o, eps = []; c.attEp = eps;
  if (!md) return eps;
  const shuttle = isShuttle(md);
  if (o.id === 'ship' && !shuttle && md.L && LAUNCH_SITES[md.cfg.site] && o.segs.length && o.segs[0].meta && o.segs[0].meta.phase === 'ascent') {
    const asc = o.segs[0], sE = asc.stateAt(asc.t1), t0 = md.M.t0;
    const h = vunit(vcross(sE.r, sE.v)); // orbit normal: the launch plane
    const S = LAUNCH_SITES[md.cfg.site], lf = localFrame('earth', sitePosEcl('earth', S.lat, S.lon, 0, t0), t0);
    const RP = md.L.roll, azA = azOf(lf, vcross(h, lf.up)); // flight azimuth
    const d0 = RP ? wrapPi(RP.padAz * DEG - azA) : 0;
    eps.push({ kind: 'launch', tA: t0 - 4 * 3600, tB: asc.t1, body: 'earth', out: true, h, d0, RP, t0 });
  }
  if (shuttle && o.model === 'shuttle') return eps;
  const zAxis = o.model === 'starshipPayload';
  for (let i = 0; i < o.segs.length; i++) {
    const sg = o.segs[i]; if (sg.type !== 'surface') continue;
    const prev = o.segs[i - 1], next = o.segs[i + 1];
    const landed = prev && prev.type !== 'surface' && Math.abs(prev.t1 - sg.t0) < 5;
    const lifts = next && next.type !== 'surface' && Math.abs(next.t0 - sg.t1) < 5;
    let azF = null, tA = sg.t0, turn = null, pw = null;
    if (landed) {
      pw = md.powered.find(x => x.obj === o.id && !x.imp && x.t0 < sg.t0 && x.t1 >= sg.t0 - 5);
      const ch = o.configs.find(cf => cf.t <= sg.t0 && cf.t >= sg.t0 - 1800 && cf.label && (cf.label.chute || cf.label.chutes));
      let tCh = ch ? ch.t - 1 : Infinity; // parachutes: the descent samples may open them a moment before the configuration changes
      if (prev.type === 'samples') for (let k = 0; k < prev.n; k++) if (prev.extra[k].chute >= 1) { tCh = Math.min(tCh, prev.t[k] - 1); break; }
      // a capsule falling steeper than 45° (before its parachutes open) would point its nose along the vertical in the flight frame
      let tSteep = Infinity;
      for (let tt = sg.t0 - 1; tt > sg.t0 - 1800 && tt > prev.t0; tt -= 2) {
        const s = o.stateAt(tt); if (!s) break;
        const va = vsub(s.v, vcross(bodyOmegaEcl(s.ref, tt), s.r)), up = vunit(s.r), vv = vdot(va, up);
        if (vnorm(vsub(va, vscale(up, vv))) > Math.abs(vv)) { tSteep = tt; break; }
      }
      tA = Math.max(Math.min(pw ? pw.t0 : sg.t0 - 30, tCh, tSteep), sg.t0 - 1800, prev.t0);
      for (let tt = tA - 0.5; tt > tA - 1800 && azF == null; tt -= 5) azF = trackAz(o, tt, 0.001);
      const T = md.trav;
      if (T && T.seg === sg && o.id === 'ship' && azF != null) { // a rover sets down facing the way it will first drive: the descent stage yaws round on its engines
        const p = roverPose(md, sg.t0), { E, N } = meshEN(T.seg.lat, T.seg.lon), r = sg.stateAt(sg.t0).r;
        const azR = azOf(localFrame(sg.ref, r, sg.t0), meshToEcl(sg.ref, vadd(vscale(E, Math.sin(p.h)), vscale(N, Math.cos(p.h))), sg.t0));
        const d = wrapPi(azR - azF), t1 = pw ? pw.t0 + 4 : sg.t0 - 30;
        turn = { t1, d, dur: Math.max(ATT.minRoll, Math.abs(d) / ATT.rollRate) };
      }
    } else { // standing where another craft landed (a lunar module's descent stage, left behind): its heading
      for (const c2 of MV.crafts) {
        if (c2 === c) continue;
        const e2 = attEpisodes(c2).find(e => e.kind === 'land' && e.body === sg.ref && e.tA <= sg.t0 + 1 && e.tB >= sg.t0 - 1 && Math.abs(e.lat - sg.lat) < 1e-3 && Math.abs(e.lon - sg.lon) < 1e-3);
        if (e2) { azF = e2.azF; break; }
      }
    }
    if (azF == null) azF = 0;
    if (turn) azF += turn.d; // the heading it lands with
    const azP = azF - Math.PI / 2; // the pitch axis: across the direction of travel, to its left
    const az = turn ? (t => azP - turn.d * (1 - smoothstep((t - turn.t1) / turn.dur))) : (() => azP);
    eps.push({ kind: 'land', tA, tB: sg.t1, body: sg.ref, lat: sg.lat, lon: sg.lon, azF, az, z: zAxis, tIgn: zAxis && pw ? pw.t0 : null });
    if (!lifts) continue;
    // liftoff: a roll from the landed attitude (its X axis) to square across the ascent heading — whichever side is nearer,
    // so a lander that came down facing its way out leaves without turning. The heading is read where the craft crosses
    // the ground at a good clip; afterwards the flight frame keeps the same side (sign) of the local vertical.
    const tE = sg.t1, xLand = zAxis ? azF + Math.PI : azP;
    let tS = null, azA = null;
    for (let tt = tE + 8; tt < Math.min(next.t1, tE + 300) && azA == null; tt += 2) { azA = trackAz(o, tt, 0.03); if (azA != null) tS = tt; }
    if (azA == null) { eps.push({ kind: 'lift', tA: tE, tB: tE + 10, body: sg.ref, az: () => xLand, z: false, out: true, sign: 1 }); continue; }
    const plan = a => {
      const dR = wrapPi(a + Math.PI / 2 - xLand), dL = wrapPi(a - Math.PI / 2 - xLand), right = Math.abs(dR) <= Math.abs(dL), d = right ? dR : dL;
      const dur = Math.max(ATT.minRoll, Math.abs(d) / ATT.rollRate); return { d, dur, sign: right ? 1 : -1, tB: Math.max(tS, tE + 2 + dur + ATT.ramp) };
    };
    let P = plan(azA); const a2 = trackAz(o, P.tB, 0.03); if (a2 != null) P = plan(a2);
    eps.push({ kind: 'lift', tA: tE, tB: P.tB, body: sg.ref, z: false, out: true, sign: P.sign, az: t => xLand + P.d * smoothstep((t - tE - 2) / P.dur) });
  }
  return eps;
}
// Which side of the local vertical the flight frame takes as its roll reference: the craft's +X axis is nose × (±up).
// Either is as good in flight; after a liftoff it is the one the climb-out ended with, so the hand-over turns nothing.
function flightSign(c, t) {
  let s = 1; for (const e of attEpisodes(c)) if (e.kind === 'lift' && e.tA <= t) s = e.sign; return s;
}
// The ground frame at t, or null in free flight: {P: the pitch axis (world), z: it is the craft's Z axis, w: weight
// against the flight frame (1 = ground frame only), ep: the episode}
function groundFrame(c, t) {
  const eps = attEpisodes(c); if (!eps.length) return null;
  const e = eps.find(e => t >= e.tA && t <= e.tB); if (!e) return null;
  const rB = c.dom === e.body ? c.rD : vsub(c.P, helio(e.body, t).r); if (!rB) return null;
  const lf = localFrame(e.body, rB, t);
  let P;
  if (e.kind === 'launch') { // across the launch plane, after the roll program (if any) from the pad azimuth
    const hp = vsub(e.h, vscale(lf.up, vdot(e.h, lf.up))); P = vunit(vscale(hp, -1));
    const d = e.RP ? e.d0 * (1 - smoothstep((t - e.t0 - e.RP.t[0]) / (e.RP.t[1] - e.RP.t[0]))) : 0;
    if (d) P = vadd(vscale(P, Math.cos(d)), vscale(vcross(P, lf.up), Math.sin(d)));
  } else P = azDir(lf, e.az(t));
  const w = e.out ? 1 - smoothstep((t - (e.tB - ATT.ramp)) / ATT.ramp) : 1;
  return { P, z: e.z, w, ep: e };
}
// turn unit vector a toward b about axis P by the fraction f of the way, the short way round (any part along P blends linearly)
function pitchToward(a, b, P, f) {
  const ap = vunit(vsub(a, vscale(P, vdot(a, P)))), bp = vunit(vsub(b, vscale(P, vdot(b, P))));
  const ang = Math.atan2(vdot(P, vcross(ap, bp)), vdot(ap, bp)) * f, cs = Math.cos(ang), sn = Math.sin(ang);
  const along = vdot(a, P) * (1 - f) + vdot(b, P) * f;
  return vunit(vadd(vscale(vadd(vscale(ap, cs), vscale(vcross(P, ap), sn)), Math.sqrt(Math.max(0, 1 - along * along))), vscale(P, along))); // Rodrigues, ap square to P
}
