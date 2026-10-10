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
