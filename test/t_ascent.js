require('./load');
function planeNormalFromAz(body, lat, lon, t, az) {
  const r = sitePosEcl(body, lat, lon, 0, t); const lf = localFrame(body, r, t);
  const d = vadd(vscale(lf.north, Math.cos(az * DEG)), vscale(lf.east, Math.sin(az * DEG)));
  return vunit(vcross(lf.up, d));
}
function test(lname, payload, siteKey, iso, az, extra = {}) {
  const L = LAUNCHERS[lname], S = LAUNCH_SITES[siteKey], t0 = isoToT(iso);
  const stack = buildAscentStack(L, payload);
  const tgt = { normal: planeNormalFromAz('earth', S.lat, S.lon, t0, az), hp: extra.hp ?? L.ascent.hp, ha: extra.ha ?? L.ascent.ha, hCut: extra.hCut ?? L.ascent.hCut };
  const T0 = Date.now();
  const res = optimizeAscent({ body: 'earth', t0, lat: S.lat, lon: S.lon, stack, target: tgt, vert: L.ascent.vert, kickGuess: L.ascent.kickGuess, fairingR: L.payloadFairing ? L.payloadFairing.r : 0, qMax: L.ascent.qMax || 33000, arefExtra: L.arefExtra || 0, gTgo: !!L.ascent.gTgo });
  const ms = Date.now() - T0;
  console.log(`\n== ${L.name} payload ${payload} kg  (${ms} ms) ok=${res.ok} kick=${res.kick.toFixed(2)}° az I/R=${res.azI.toFixed(1)}/${res.azR.toFixed(1)}`);
  console.log(`  insertion T+${(res.t - t0).toFixed(0)} s, orbit ${res.hpAch.toFixed(0)} x ${res.haAch.toFixed(0)} km, i=${(Math.acos(vdot(vunit(res.el.h), [0, 0, 1])) * RAD).toFixed(2)} ecl, maxG=${res.maxG.toFixed(2)}, maxQ=${(res.maxQ / 1000).toFixed(1)} kPa, upper=${res.upper && res.upper.id} prop left ${res.upperProp.toFixed(0)} kg, mass ${res.m.toFixed(0)}`);
  for (const e of res.events) console.log(`   T+${(e.t - t0).toFixed(0).padStart(4)}  ${e.name}`);
  return res;
}
test('saturnV', 45704, 'KSC39A', '1969-07-16T13:32:00Z', 72.058);
test('sls1', 26500, 'KSC39B', '2026-04-01T22:35:12Z', 75);
test('lm5', 8200, 'WENCHANG', '2020-11-23T20:30:12Z', 100);
test('atlasV541', 4061, 'CCSFS41', '2020-07-30T11:50:00Z', 100);
test('atlasAgena', 261, 'CCSFS12', '1964-11-28T14:22:01Z', 100);
test('falconHeavy', 6065, 'KSC39A', '2024-10-14T16:06:00Z', 100);
test('starship', 100000, 'STARBASE', '2033-01-01T00:00:00Z', 95);
// Space Shuttle (STS-135): orbiter + payload as the 'payload'; direct insertion, MECO into a 58 × 225 km orbit
test('shuttle', 91500 + 12900 + 11000, 'KSC39A', '2011-07-08T15:29:04Z', 41.9);
