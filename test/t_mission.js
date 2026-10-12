require('./load');
const id = process.argv[2] || 'apollo11';
const sc = scenarioById(id);
const T0 = Date.now();
let M;
try { M = planScenario(sc.cfg, msg => console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`)); }
catch (e) { console.error('PLANNER ERROR', e.stack); process.exit(1); }
console.log(`\n=== ${sc.title}: planned in ${((Date.now() - T0) / 1000).toFixed(1)} s; duration ${fmtDur(M.tEnd - M.t0)}; objects ${M.objects.map(o => o.id).join(',')}`);
console.log('warnings:', M.warnings, '\nnotes:', M.notes);
console.log('\n-- burns');
for (const b of M.burns) console.log(`  GET ${fmtMET(b.t - M.t0).padEnd(16)} ${b.name.padEnd(42)} dv=${(b.dv || 0).toFixed(1).padStart(7)} m/s  dur=${fmtDur(b.dur || 0).padStart(9)}  prop=${(b.prop || 0).toFixed(0).padStart(7)} kg  ${b.engine}`);
console.log('\n-- events');
for (const e of M.events) console.log(`  GET ${fmtMET(e.t - M.t0).padEnd(16)} ${fmtUTC(e.t)}  [${e.obj}] ${e.name}`);
console.log('\nsummary', JSON.stringify(M.summary, null, 0));
// continuity check: sample ship state every 60 s, look for jumps
for (const o of M.objects) {
  let prev = null, maxJump = 0, at = 0;
  for (let t = o.t0; t <= o.t1; t += 20) {
    const s = o.stateAt(t); if (!s) continue;
    const p = vsub(vadd(planetHelio(s.ref, t).r, s.r), planetHelio('earth', t).r);
    const vE = vsub(vadd(planetHelio(s.ref, t).v, s.v), planetHelio('earth', t).v);
    if (prev) { const d = vnorm(vsub(p, prev.p)); const exp = Math.max(vnorm(vE), vnorm(prev.v)) * 20 + 2; const j = d - exp; if (j > maxJump) { maxJump = j; at = t; } }
    prev = { p, v: vE };
  }
  console.log(`continuity ${o.id}: max excess jump ${maxJump.toFixed(1)} km at GET ${fmtMET(at - M.t0)}`);
}
// segment junctions: the next segment starts where the earlier one ends (the end carried on over the gap between them), and
// in a gap the craft keeps moving (stateAt bridges it) instead of holding still in space while the planet turns under it
let junctionFail = 0;
for (const o of M.objects) for (let i = 1; i < o.segs.length; i++) {
  const a = o.segs[i - 1], b = o.segs[i], h = b.t0 - a.t1; if (h < 0) continue; // overlapping: the later segment takes over
  const A = a.stateAt(a.t1), B = b.stateAt(b.t0); if (A.ref !== B.ref) continue;
  const rB = B.surface ? vscale(B.r, 1 - SURF_LIFT / vnorm(B.r)) : B.r; // a landing ends on the ground
  const miss = vnorm(vsub(rB, vadd(A.r, vscale(vadd(A.v, B.v), h / 2)))) * 1000;
  const mid = h > 0 ? vnorm(vsub(o.stateAt(a.t1 + h / 2).r, vscale(vadd(A.r, rB), 0.5))) * 1000 - vnorm(vsub(A.v, B.v)) * h / 8 * 1000 : 0;
  if (miss > 50 || mid > 10) { junctionFail++; console.log(`FAIL junction ${o.id} ${a.type}→${b.type} at GET ${fmtMET(b.t0 - M.t0)}: gap ${h.toFixed(3)} s, starts ${miss.toFixed(1)} m off, mid-gap ${mid.toFixed(1)} m off`); }
}
console.log(junctionFail ? `junctions: ${junctionFail} failed` : 'PASS segment junctions');
if (junctionFail) process.exit(1);
