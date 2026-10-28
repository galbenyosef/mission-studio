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
process.exit(fail ? 1 : 0);
