// The browser half of the livery tool (paint.py runs it): orthographic views of the orbiter scan's colour map, the bake of
// repainted views back into the map, and the NASA logotype drawn as a mask. Run from anywhere; files go to tools/livery/work/.
//
//   node tools/livery/livery.js views               work/views/<view>.png (raw colours, 100 px/m) and <view>.json
//   node tools/livery/livery.js bake <work dir>      <dir>/baked.png from <dir>/edits.json
//   node tools/livery/livery.js worm <px> <out.png>  the NASA logotype, <px> tall, as an alpha mask
//   node tools/livery/livery.js check <work dir>     <dir>/check_<view>.png: the scan with <dir>/atlas.png, 40 px/m
const http = require('http'), fs = require('fs'), path = require('path');
const { launch } = require('../video/browser.js');
const ROOT = path.join(__dirname, '..', '..'), WORK = path.join(__dirname, 'work');
// the page's files: three.js and its glTF loader from vendor/ (their imports pointed at each other), the scan, this tool
const LIB = {
  'three.js': ['vendor/three.module.min.js', []],
  'GLTFLoader.js': ['vendor/GLTFLoader.js', [["from 'three'", "from './three.js'"], ["from '../utils/BufferGeometryUtils.js'", "from './BufferGeometryUtils.js'"]]],
  'BufferGeometryUtils.js': ['vendor/BufferGeometryUtils.js', [["from 'three'", "from './three.js'"]]],
  'meshopt.js': ['vendor/meshopt_decoder.module.js', []],
};
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json' };
function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); let file = null, body = null;
    if (u.startsWith('/lib/') && LIB[u.slice(5)]) { const [f, subs] = LIB[u.slice(5)]; body = fs.readFileSync(path.join(ROOT, f), 'utf8'); for (const [a, b] of subs) body = body.split(a).join(b); file = f; }
    else if (u === '/orbiter.glb') file = path.join(ROOT, 'assets', 'orbiter.glb');
    else if (u.startsWith('/work/')) file = path.join(WORK, path.normalize(u.slice(6)).replace(/^(\.\.[/\\])+/, ''));
    else if (u === '/' || u === '/bake.html') file = path.join(__dirname, 'bake.html');
    else if (u === '/bake.js') file = path.join(__dirname, 'bake.js');
    if (!file || (body === null && !fs.existsSync(file))) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body !== null ? body : fs.readFileSync(file));
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}
const save = (file, dataUrl) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); };
(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (!['views', 'bake', 'worm', 'check'].includes(cmd)) { console.log('usage: livery.js views | bake <dir> | worm <px> <out.png> | check <dir>'); process.exit(1); }
  const srv = await serve(), browser = await launch(), page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  let failed = false; page.on('pageerror', e => { failed = true; console.error('page error:', e.message); });
  page.on('console', m => { if (m.type() === 'error') console.error('page:', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/bake.html`);
  await page.waitForFunction(() => window.ready || window.failed, null, { timeout: 180000 });
  if (cmd === 'views') for (const n of ['left', 'right', 'top', 'bottom']) {
    const r = await page.evaluate(n => window.view(n, 100), n);
    save(path.join(WORK, 'views', n + '.png'), r.png); fs.writeFileSync(path.join(WORK, 'views', n + '.json'), JSON.stringify(r.meta));
    console.log(`views/${n}.png ${r.meta.w}×${r.meta.h}`);
  }
  if (cmd === 'bake') {
    const dir = path.resolve(args[0]), edits = JSON.parse(fs.readFileSync(path.join(dir, 'edits.json'), 'utf8'));
    const rel = path.relative(WORK, dir).split(path.sep).join('/');
    const png = await page.evaluate(e => window.bake(e), edits.map(e => ({ ...e, url: `/work/${rel}/${e.file}` })));
    save(path.join(dir, 'baked.png'), png); console.log(path.relative(process.cwd(), path.join(dir, 'baked.png')));
  }
  if (cmd === 'check') {
    const dir = path.resolve(args[0]), rel = path.relative(WORK, dir).split(path.sep).join('/');
    for (const n of ['left', 'right', 'top']) save(path.join(dir, `check_${n}.png`), (await page.evaluate(([u, n]) => window.viewWith(u, n, 40), [`/work/${rel}/atlas.png`, n])).png);
  }
  if (cmd === 'worm') save(path.resolve(args[1]), await page.evaluate(px => window.worm(px), +args[0]));
  await browser.close(); srv.close(); if (failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
