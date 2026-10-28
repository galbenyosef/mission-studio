require('./load');
let fail = 0;
{
  const t = isoToT('2022-01-24T19:00:00Z');
  const g = l2Gamma(); const L2 = l2Point(t); const dL2 = vnorm(L2);
  haloCR3BP(350000); const T = haloPeriodS(t, 350000);
  const a = haloRef(t, t, 350000), b = haloRef(t + T, t, 350000);
  const chk = [
    ['gamma', Math.abs(g - 0.01008) < 2e-4],
    ['L2 distance 1.45–1.55 Mkm', dL2 > 1.45e6 && dL2 < 1.55e6],
    ['L2 on the anti-Sun line', vdot(vunit(L2), vunit(planetHelio('earth', t).r)) > 0.9999],
    ['period 170–185 d', T / 86400 > 170 && T / 86400 < 185],
    // (closure in the rotating frame, in units of the Earth's distance that day: the inertial positions differ by the frame's turn)
    ['halo closes within 3000 km over one period (CR3BP)', (() => { const rot = (tt, r) => { const R = seRot(tt), L = vnorm(planetHelio('earth', tt).r); return [(R[0] * r[0] + R[3] * r[1] + R[6] * r[2]) / L, (R[1] * r[0] + R[4] * r[1] + R[7] * r[2]) / L, (R[2] * r[0] + R[5] * r[1] + R[8] * r[2]) / L]; }; return vnorm(vsub(rot(t, a.r), rot(t + T, b.r))) * 1.496e8 < 3000; })()],
    ['out-of-plane amplitude over 300 Mm', Math.max(...[0, 0.25, 0.5, 0.75].map(f => Math.abs(haloRef(t + f * T, t, 350000).r[2]))) > 3.0e5],
    ['phase 0 is the point nearest the Earth', [0.1, 0.3, 0.5, 0.7, 0.9].every(f => vnorm(haloRef(t + f * T, t, 350000).r) > vnorm(a.r))],
  ];
  for (const [n, ok] of chk) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
}
// the stable manifold: a branch comes down to the Earth
{
  const br = manifoldBranch(350000, 0.02, 1e-4, -1, 0.01);
  const chk = [
    ['a branch of the stable manifold reaches a perigee inside 100 000 km', !!br.per && br.per.r < 1e5],
    ['…about four months before the halo', !!br.per && -br.per.tau / SE_N / 86400 > 90 && -br.per.tau / SE_N / 86400 < 160],
  ];
  for (const [n, ok] of chk) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
}
// the mission
{
  const sc = scenarioById('jwst'), M = planScenario(sc.cfg, () => { }), t0 = M.t0, tArr = isoToT(sc.cfg.arrive), ship = M.objects.find(o => o.id === 'ship');
  const dEarth = t => { const s = ship.stateAt(t); return vnorm(vsub(vadd(planetHelio(s.ref, t).r, s.r), planetHelio('earth', t).r)); };
  const dL2 = t => { const s = ship.stateAt(t); return vnorm(vsub(vsub(vadd(planetHelio(s.ref, t).r, s.r), planetHelio('earth', t).r), l2Point(t))); };
  const H = M.summary.halo, tEnd = tArr + sc.cfg.halo.circuits * H.periodDays * 86400;
  const samples = []; for (let t = tArr; t <= tEnd; t += 5 * 86400) samples.push([dEarth(t), dL2(t)]);
  const inj = M.burns.find(b => b.name.startsWith('Injection')), m1a = M.burns.find(b => b.name === 'MCC-1a'), m2 = M.burns.find(b => b.name.startsWith('MCC-2'));
  const chk = [
    ['no warnings', M.warnings.length === 0, M.warnings.join('; ')],
    ['launch on the day, injection within two hours', inj && inj.t - t0 > 0 && inj.t - t0 < 7200],
    ['injection 3.2–3.35 km/s', inj && inj.dv > 3200 && inj.dv < 3350],
    ['MCC-1a under 40 m/s, MCC-2 under 25 m/s', m1a.dv < 40 && m2.dv < 25, `${m1a.dv.toFixed(1)} / ${m2.dv.toFixed(1)}`],
    ['arrival within 0.8 Mkm of L2 on the planned day', dL2(tArr) < 8e5, (dL2(tArr) / 1e3).toFixed(0) + ' thousand km'],
    ['1.2–1.8 Mkm from the Earth round the halo', samples.every(([dE]) => dE > 1.2e6 && dE < 1.8e6), samples.map(([dE]) => (dE / 1e6).toFixed(2)).join(' ')],
    ['never nearer L2 than 150 000 km, never farther than 1.0 Mkm', samples.every(([, d]) => d > 1.5e5 && d < 1.0e6), samples.map(([, d]) => (d / 1e3).toFixed(0)).join(' ')],
    ['8 station-keeping burns, each under 10 m/s, 45 m/s in all', H.dvSK.length === 8 && H.dvSK.every(v => v < 10) && H.dvTotal < 45, H.dvSK.map(v => v.toFixed(1)).join(' ') + ' = ' + H.dvTotal.toFixed(1)],
    ['17 deployment events', M.events.filter(e => e.kind === 'deploy').length === 17, String(M.events.filter(e => e.kind === 'deploy').length)],
    ['C3 at injection −1.0…−0.4 km²/s²', M.summary.design.C3 > -1.0 && M.summary.design.C3 < -0.4, M.summary.design.C3.toFixed(2)],
    ['no deployment before separation from the upper stage', (() => { const sep = M.events.find(e => e.kind === 'sep'); return M.events.filter(e => e.kind === 'deploy').every(e => e.t > sep.t); })()],
    ['all deployments by L+15 d', M.events.filter(e => e.kind === 'deploy').every(e => e.t < t0 + 15 * 86400)],
  ];
  for (const [n, ok, info] of chk) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? `  (${info})` : '')); if (!ok) fail++; }
}
// a launch that falls short, and a launch six hours late
{
  const sc = scenarioById('jwst');
  const Mf = planScenario({ ...sc.cfg, launcher: 'atlasAgena' }, () => { });
  const Ml = planScenario({ ...sc.cfg, launch: '2021-12-25T18:20:00Z' }, () => { });
  const chk = [
    ['a launcher that cannot lift it: the plan fails at the ascent with no design summary', Mf.failed === 'ascent' && Mf.summary.design == null],
    ['six hours late: no warnings', Ml.warnings.length === 0, Ml.warnings.join('; ')],
    ['six hours late: no station-keeping burn under 0.05 m/s', Ml.summary.halo.dvSK.every(v => v > 0.05), Ml.summary.halo.dvSK.map(v => v.toFixed(2)).join(' ')],
  ];
  for (const [n, ok, info] of chk) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? `  (${info})` : '')); if (!ok) fail++; }
}
process.exit(fail ? 1 : 0);
