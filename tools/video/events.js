// Lists a mission's events and phases with their mission times: node events.js sts31 (the video build served on PORT, 8815)
const { launch } = require('./browser.js');
(async () => {
  const [scn] = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto('http://localhost:' + (process.env.PORT || 8815) + '/index.html');
  await page.waitForFunction(() => window.__ms && window.__ms.SETUP, null, { timeout: 60000 });
  await page.evaluate(id => document.querySelector(`#scnList [data-id="${id}"]`).click(), scn);
  await page.waitForFunction(() => window.__ms.SETUP.plan || window.__ms.SETUP.planErr, null, { timeout: 300000 });
  await page.click('#goBtn'); await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    const ms = window.__ms, md = ms.MV.md, t0 = md.M.t0, R = 6378.137;
    const ship = ms.MV.crafts.find(c => c.o.id === 'ship');
    const sunEl = t => { const s = ship.o.stateAt(t); if (!s) return null; const E = window.__ms.Planner ? null : null; return null; };
    const met = t => { const d = t - t0, s = Math.abs(d), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = Math.floor(s % 60); return (d < 0 ? '-' : '+') + `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
    return [`t0 ${new Date((t0 + 946728000) * 1000).toISOString()} tEnd ${met(md.tEnd)}`, ...md.events.map(e => `${met(e.t)}  [${e.kind}] ${e.obj}: ${e.name}`), ...md.phases.map(p => `PHASE ${met(p.t0)}–${met(p.t1)} ${p.name}`)].join('\n');
  });
  console.log(out);
  await browser.close();
})();
