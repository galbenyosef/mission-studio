// Builds the single-page app from src/ (engine) and app/ (renderer + UI).
//
//   node build.js            → docs/index.html   full HTML page (GitHub Pages or any static host)
//   node build.js fragment   → dist/index.html   page body only, for hosts that supply their own <head>
//
// Both outputs load three.js r160 from jsDelivr and the textures from ./assets/.
const fs = require('fs'), path = require('path');
const mode = process.argv[2] === 'fragment' ? 'fragment' : 'page';
const ROOT = __dirname;
const ORDER = ['core.js', 'kepler.js', 'integrator.js', 'vehicles.js', 'flight.js', 'timeline.js', 'planner.js', 'lunar.js', 'interplanetary.js', 'scenarios.js'];
const engine = ORDER.map(f => `// ---- ${f}\n` + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const appFiles = fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.js')).sort();
let app = appFiles.map(f => `// ==== ${f}\n` + fs.readFileSync(path.join(ROOT, 'app', f), 'utf8')).join('\n');
app = app.replace('__THREE_URL__', process.env.THREE_URL || 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js');
for (const [n, s] of [['engine', engine], ['app', app]]) if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
const css = fs.readFileSync(path.join(ROOT, 'app', 'style.css'), 'utf8');
const markup = fs.readFileSync(path.join(ROOT, 'app', 'markup.html'), 'utf8');
const DESC = '3D Moon and Mars mission simulator with real launch vehicles, solved trajectories, live telemetry and storyboard capture.';
const body = `<title>Moon &amp; Mars Mission Studio</title>
<meta name="description" content="${DESC}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
${markup}
<script id="engine-src">
${engine}
</script>
<script type="module">
${app}
</script>
`;
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ffd9a8"/><stop offset=".55" stop-color="#ff7b2e"/><stop offset="1" stop-color="#7a2a08"/></radialGradient></defs><circle cx="32" cy="32" r="28" fill="url(#g)"/></svg>')}`;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta property="og:title" content="Moon &amp; Mars Mission Studio">
<meta property="og:description" content="${DESC}">
<meta property="og:image" content="media/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${ICON}">
<style>[hidden]{display:none!important}</style>
</head>
<body>
${body}</body>
</html>
`;
const out = path.join(ROOT, mode === 'page' ? 'docs' : 'dist');
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), mode === 'page' ? page : body);
if (mode === 'page') fs.writeFileSync(path.join(out, '.nojekyll'), ''); // serve docs/ as-is on GitHub Pages
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(out, 'assets', f));
if (mode === 'page' && fs.existsSync(path.join(ROOT, 'media', 'og.jpg'))) { fs.mkdirSync(path.join(out, 'media'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'media', 'og.jpg'), path.join(out, 'media', 'og.jpg')); }
console.log('built', path.relative(ROOT, path.join(out, 'index.html')), ((mode === 'page' ? page : body).length / 1024).toFixed(0) + ' KB');
