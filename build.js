// Builds the single-page app from src/ (engine) and app/ (renderer + UI) into dist/:
//
//   dist/index.html          the page (engine as a classic script, app as an ES module)
//   dist/assets/*            three.js and the textures, with content hashes in their names
//
// Every path is relative, so dist/ works from any base path (/, /apps/mission-studio/, …)
// and the hashed file names are safe to cache forever.
//
//   node build.js            → dist/
//   python3 -m http.server -d dist 8000
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, OUT = path.join(ROOT, 'dist');
const ORDER = ['core.js', 'kepler.js', 'integrator.js', 'vehicles.js', 'flight.js', 'timeline.js', 'planner.js', 'lunar.js', 'interplanetary.js', 'leo.js', 'scenarios.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
// copy a file into dist/assets/ under a content-hashed name, return that name
function hashed(src, name) {
  const buf = fs.readFileSync(src); const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const ext = path.extname(name), out = `${path.basename(name, ext)}.${h}${ext}`;
  fs.writeFileSync(path.join(OUT, 'assets', out), buf); return out;
}
const assetMap = {};
for (const f of fs.readdirSync(path.join(ROOT, 'assets')).sort()) assetMap[f] = hashed(path.join(ROOT, 'assets', f), f);
const threeFile = hashed(path.join(ROOT, 'vendor', 'three.module.min.js'), 'three.module.min.js');

const engine = ORDER.map(f => `// ---- ${f}\n` + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const appFiles = fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.js')).sort();
let app = appFiles.map(f => `// ==== ${f}\n` + fs.readFileSync(path.join(ROOT, 'app', f), 'utf8')).join('\n');
app = app.replace('__THREE_URL__', `./assets/${threeFile}`);
const ASSET_LINE = "const ASSET = n => 'assets/' + n;";
if (!app.includes(ASSET_LINE)) throw new Error('asset resolver not found in app/20_scene.js');
app = app.replace(ASSET_LINE, `const ASSET_MAP = ${JSON.stringify(assetMap)};\nconst ASSET = n => 'assets/' + (ASSET_MAP[n] || n);`);
for (const [n, s] of [['engine', engine], ['app', app]]) if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');

const css = fs.readFileSync(path.join(ROOT, 'app', 'style.css'), 'utf8');
const markup = fs.readFileSync(path.join(ROOT, 'app', 'markup.html'), 'utf8');
const DESC = '3D Moon and Mars mission simulator with real launch vehicles, solved trajectories, live telemetry and storyboard capture.';
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ffd9a8"/><stop offset=".55" stop-color="#ff7b2e"/><stop offset="1" stop-color="#7a2a08"/></radialGradient></defs><circle cx="32" cy="32" r="28" fill="url(#g)"/></svg>')}`;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Moon &amp; Mars Mission Studio</title>
<meta name="description" content="${DESC}">
<link rel="icon" href="${ICON}">
<link rel="modulepreload" href="./assets/${threeFile}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&display=swap">
<style>[hidden]{display:none!important}
${css}
</style>
</head>
<body>
${markup}
<script id="engine-src">
${engine}
</script>
<script type="module">
${app}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), page);
// syntax check of both scripts (module with its import stubbed out)
const vm = require('vm');
new vm.Script(engine, { filename: 'engine.js' });
console.log('built dist/index.html', (page.length / 1024).toFixed(0) + ' KB,', Object.keys(assetMap).length + 1, 'hashed assets');
