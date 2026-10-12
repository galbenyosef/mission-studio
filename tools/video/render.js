// Renders the scenes of a storyboard (scenes.js) from the video build of Mission Studio into clips.
//   node render.js [--only id,id] [--stills N] [--w 1920 --h 1080] [--out dir] [--q 0.93]
// --stills N: N stills per scene (JPEG) instead of clips, for checking a storyboard. A scene with range: [a, b] renders only
// τ a…b of itself (for previews).
// A clip that already exists with all its frames is skipped, so an interrupted run resumes where it stopped.
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { launch } = require('./browser.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = +arg('w', 1920), H = +arg('h', 1080), OUT = arg('out', path.join(__dirname, 'clips')), Q = +arg('q', 0.93), STILLS = +arg('stills', 0);
const ONLY = arg('only', ''), SB = require(path.resolve(arg('board', path.join(__dirname, 'scenes.js'))));
const LIB = fs.readFileSync(path.join(__dirname, 'vidlib.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });
const log = m => { const s = new Date().toISOString().slice(11, 19) + ' ' + m; console.log(s); fs.appendFileSync(path.join(OUT, 'render.log'), s + '\n'); };
const r0 = sc => sc.range ? sc.range[0] : 0, len = sc => sc.range ? sc.range[1] - sc.range[0] : sc.dur;
const frames = sc => Math.round(len(sc) * sc.fps);
const clipDone = f => { try { const n = +execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f]).toString().trim(); return n; } catch (e) { return 0; } };

async function session(scenes, aa) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => log('pageerror ' + e));
  await page.addInitScript(aa => { try { localStorage.setItem('mstudio-sound', 'false'); } catch (e) {}
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) { if (/webgl/.test(type)) attrs = Object.assign({}, attrs, { antialias: aa }); return orig.call(this, type, attrs); };
  }, aa);
  await page.goto('http://localhost:' + (process.env.PORT || 8815) + '/index.html');
  await page.waitForFunction(() => window.__ms && window.__ms.SETUP, null, { timeout: 60000 });
  await page.evaluate(id => document.querySelector(`#scnList [data-id="${id}"]`).click(), SB.mission);
  if (SB.cfg) { await page.waitForTimeout(500); await page.evaluate(c => { const ms = window.__ms; Object.assign(ms.SETUP.cfg, c); ms.schedulePlan(0); }, SB.cfg); }
  await page.waitForFunction(() => window.__ms.SETUP.plan || window.__ms.SETUP.planErr, null, { timeout: 600000 });
  await page.click('#goBtn'); await page.waitForTimeout(2000);
  await page.addScriptTag({ content: LIB });
  await page.waitForFunction(() => window.__vid.ready(), null, { timeout: 180000 });
  await page.evaluate(() => window.__vid.setup());
  log(`session aa=${aa} ${W}x${H} ready`);
  for (const sc of scenes) {
    const N = frames(sc), file = path.join(OUT, sc.id + '.mp4');
    if (!STILLS && fs.existsSync(file) && clipDone(file) >= N) { log(`${sc.id} done already`); continue; }
    const part = file + '.part.mp4'; // another process is rendering it (its file grew in the last two minutes)
    if (!STILLS && fs.existsSync(part) && Date.now() - fs.statSync(part).mtimeMs < 120000) { log(`${sc.id} being rendered by another process, skipped`); continue; }
    await page.evaluate(spec => window.__vid.scene(spec), sc);
    // settle: a few frames at the start so attitudes, plumes and the exhaust trail are in place
    for (let i = 0; i < 4; i++) await page.evaluate(([tau, fps]) => window.__vid.frame(tau, fps, 0), [r0(sc), sc.fps]);
    if (STILLS) {
      for (let k = 0; k < STILLS; k++) {
        const tau = r0(sc) + (STILLS === 1 ? len(sc) / 2 : k * (len(sc) - 1 / sc.fps) / (STILLS - 1));
        if (k > 0) for (let i = 0; i < 3; i++) await page.evaluate(([tau, fps]) => window.__vid.frame(tau, fps, 0), [tau - (3 - i) / sc.fps, sc.fps]);
        const url = await page.evaluate(([tau, fps]) => window.__vid.frame(tau, fps, 0.9), [tau, sc.fps]);
        const info = await page.evaluate(tau => window.__vid.info(tau), tau);
        fs.writeFileSync(path.join(OUT, `${sc.id}_${k}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
        log(`${sc.id} still ${k} τ=${tau.toFixed(1)} MET ${(info.met / 60).toFixed(2)} min alt ${info.alt && info.alt.toFixed(1)} km`);
      }
      continue;
    }
    const tmp = file + '.part.mp4';
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(sc.fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(sc.fps), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let k = 0; k < N; k++) {
      const url = await page.evaluate(([tau, fps, q]) => window.__vid.frame(tau, fps, q), [r0(sc) + k / sc.fps, sc.fps, Q]);
      const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (k % 240 === 239) { const el = (Date.now() - t0) / 1000; log(`${sc.id} ${k + 1}/${N} ${(el / (k + 1)).toFixed(2)} s/frame, ${((N - k - 1) * el / (k + 1) / 60).toFixed(1)} min left`); }
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    fs.renameSync(tmp, file);
    log(`${sc.id} rendered ${N} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  }
  await browser.close();
}
(async () => {
  let scenes = SB.scenes; if (ONLY) { const ids = ONLY.split(','); scenes = scenes.filter(s => ids.includes(s.id)); }
  for (const aa of [true, false]) { const g = scenes.filter(s => !!s.aa === aa); if (g.length) await session(g, aa); }
  log('all done');
})().catch(e => { log('FAIL ' + (e.stack || e)); process.exit(1); });
