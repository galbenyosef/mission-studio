require('./load');
const L = LAUNCHERS.ariane5ECA, S = LAUNCH_SITES.KOUROU3, SC = SPACECRAFT.jwst;
if (!L || !S || !SC) { console.log('FAIL missing ariane5ECA / KOUROU3 / jwst'); process.exit(1); }
const ok = L.stages.map(s => s.id).join() === 'EAP,EPC,ESC-A' && L.stages[0].parallel && L.ign.t === 7.3 && Math.abs(S.lat - 5.2392) < 1e-6 && SC.modules.OBS.dry + SC.modules.OBS.prop === 6161;
console.log(ok ? 'PASS jwst data' : 'FAIL jwst data'); if (!ok) process.exit(1);
