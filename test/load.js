// Loads engine sources into the global scope for Node tests.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const ORDER = ['core.js', 'kepler.js', 'integrator.js', 'vehicles.js', 'flight.js', 'timeline.js', 'planner.js', 'lunar.js', 'interplanetary.js', 'halo.js', 'leo.js', 'scenarios.js'];
let code = '';
for (const f of ORDER) { const p = path.join(SRC, f); if (fs.existsSync(p)) code += `\n// ---- ${f}\n` + fs.readFileSync(p, 'utf8'); }
code += '\n;globalThis.__ENGINE_LOADED__=true;';
vm.runInThisContext(code, { filename: 'engine.js' });
module.exports = {};
