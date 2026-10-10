require('./load');
const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg);

// 1. Moon vs Meeus example 47.a (1992-04-12 0h TD): lambda=133.162655 (date), beta=-3.229126, dist=368409.7
{
  const t = (2448724.5 - 2451545.0) * 86400;
  const p = moonGeoPosMeeus(t);
  const d = vnorm(p); const lam = Math.atan2(p[1], p[0]) * RAD; const bet = Math.asin(p[2] / d) * RAD;
  const T = t / (86400 * 36525); const lamDate = lam + 1.396971 * T;
  console.log('moon', lamDate.toFixed(5), bet.toFixed(5), d.toFixed(1));
  ok(Math.abs(lamDate - 133.162655) < 0.01 && Math.abs(bet + 3.229126) < 0.01 && Math.abs(d - 368409.7) < 30, 'Moon Meeus example');
  const c = moonGeo(t); ok(vnorm(vsub(c.r, p)) < 0.01, 'Moon cache interp ' + vnorm(vsub(c.r, p)).toExponential(2) + ' km; |v|=' + vnorm(c.v).toFixed(4));
}
// 2. Earth-Mars distance at 2020-10-06 14:18 UTC closest approach ~ 62.07e6 km
{
  const t = isoToT('2020-10-06T14:18:00Z');
  const d = vnorm(vsub(bodyPos('mars', t), bodyPos('earth', t)));
  console.log('Earth-Mars', (d / 1e6).toFixed(3), 'Mkm'); ok(Math.abs(d / 1e6 - 62.07) < 0.3, 'Mars close approach 2020');
  const ed = vnorm(bodyPos('earth', isoToT('2021-01-02T14:00:00Z'))) / AU; ok(Math.abs(ed - 0.98326) < 0.0005, 'Earth perihelion distance ' + ed.toFixed(5));
}
// 3. Kepler round trip
{
  const mu = BODIES.earth.mu; const r0 = [7000, 300, 100], v0 = [0.1, 7.6, 1.2];
  for (const dt of [100, 3000, 50000, -20000]) {
    const a = kepProp(r0, v0, dt, mu), b = kepProp(a.r, a.v, -dt, mu);
    ok(vnorm(vsub(b.r, r0)) < 1e-5, `kepProp ellipse dt=${dt} err=${vnorm(vsub(b.r, r0)).toExponential(2)}`);
  }
  const vh = [0.5, 11.5, 0.3];
  for (const dt of [600, 86400 * 3, 86400 * 30]) {
    const a = kepProp(r0, vh, dt, mu), b = kepProp(a.r, a.v, -dt, mu);
    ok(vnorm(vsub(b.r, r0)) < 1e-4, `kepProp hyperbola dt=${dt} err=${vnorm(vsub(b.r, r0)).toExponential(2)} rfinal=${vnorm(a.r).toFixed(0)}`);
  }
}
// 4. Lambert check
{
  const mu = BODIES.sun.mu;
  const t1 = isoToT('2020-07-30T12:00:00Z'), t2 = isoToT('2021-02-18T20:00:00Z');
  const E = planetHelio('earth', t1), M = planetHelio('mars', t2);
  const L = lambert(E.r, M.r, t2 - t1, mu);
  const p = kepProp(E.r, L.v1, t2 - t1, mu);
  ok(vnorm(vsub(p.r, M.r)) < 1, 'Lambert Earth->Mars miss ' + vnorm(vsub(p.r, M.r)).toFixed(4) + ' km');
  const vinfD = vnorm(vsub(L.v1, E.v)), vinfA = vnorm(vsub(L.v2, M.v));
  console.log('Mars2020: C3=', (vinfD * vinfD).toFixed(2), 'km2/s2 vinf_arr=', vinfA.toFixed(3), 'km/s');
}
// 5. integrator vs Kepler (two-body)
{
  const mu = BODIES.earth.mu; const r0 = [7000, 0, 0], v0 = [0, 7.546, 1.0];
  const ode = makeTwoBodyODE(mu, null);
  const res = integrate(ode, 0, [...r0, ...v0, 1000], 86400, { rtol: 1e-11, atol: 1e-9 });
  const yN = res.y[res.y.length - 1]; const kp = kepProp(r0, v0, 86400, mu);
  ok(vnorm(vsub([yN[0], yN[1], yN[2]], kp.r)) < 0.01, 'DOPRI vs Kepler 1 day err=' + vnorm(vsub([yN[0], yN[1], yN[2]], kp.r)).toExponential(2) + ' steps=' + res.t.length);
  // event: periapsis
  const ev = { name: 'peri', dir: 1, terminal: false, g: (t, y) => y[0] * y[3] + y[1] * y[4] + y[2] * y[5] };
  const r2 = integrate(ode, 0, [...r0, 0, 8.5, 0.5, 1000], 40000, { events: [ev] });
  console.log('events', r2.events.map(e => [e.t.toFixed(1), vnorm([e.y[0], e.y[1], e.y[2]]).toFixed(3)]));
}
// 6. orientation checks: Earth GMST & Mars frame
{
  const t = isoToT('2000-01-01T12:00:00Z'); ok(Math.abs(gmst(t) * RAD - 280.46061837) < 1e-6, 'GMST J2000');
  const pole = bodyPoleEcl('earth', 0); ok(Math.abs(pole[1] - Math.sin(OBLIQ)) < 1e-9, 'Earth pole ecl');
  // site KSC at launch: inertial position should have z(eq)=R sin(lat)
  const s = sitePosEcl('earth', 28.6, -80.6, 0, t); const se = eclToEq(s);
  ok(Math.abs(se[2] - BODIES.earth.R * Math.sin(28.6 * DEG)) < 1e-6, 'site eq z');
  // Moon: near side should face Earth (sub-Earth point near lon 0, lat 0)
  for (const iso of ['2024-01-01T00:00:00Z', '2026-04-06T23:00:00Z', '1969-07-20T20:17:00Z']) {
    const tt = isoToT(iso); const eRel = vscale(moonGeo(tt).r, -1);
    const ll = subPointLL('moon', eRel, tt); console.log('sub-Earth point on Moon', iso, ll.map(x => x.toFixed(2)));
  }
}
