// ============================================================================
// Mission Studio — renderer & UI (ES module). Engine globals come from the
// classic <script id="engine-src"> loaded before this module.
// ============================================================================
import * as THREE from '__THREE_URL__';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

// ---------------- number formatting ----------------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fx(x, d = 0) { if (x == null || !isFinite(x)) return '—'; if (d === 0) return nf0.format(x); if (d === 1) return nf1.format(x); if (d === 2) return nf2.format(x); return x.toFixed(d); }
function fDist(km) {
  if (km == null || !isFinite(km)) return '—';
  const a = Math.abs(km);
  if (a < 1) return fx(km * 1000, 0) + ' m';
  if (a < 100) return fx(km, 2) + ' km';
  if (a < 1e6) return fx(km, 0) + ' km';
  if (a < 0.05 * AU) return fx(km / 1e6, 3) + ' M km';
  return fx(km / AU, 3) + ' AU';
}
function fSpeed(kms) { if (!isFinite(kms)) return '—'; const a = Math.abs(kms); if (a > 1e-8 && a < 0.0005) return fx(kms * 1e5, 1) + ' cm/s'; return a < 1 ? fx(kms * 1000, 0) + ' m/s' : fx(kms, a < 100 ? 3 : 1) + ' km/s'; }
function fAcc(ms2) { // m/s^2, wide dynamic range
  if (!isFinite(ms2)) return '—';
  const a = Math.abs(ms2);
  if (a === 0) return '0';
  if (a >= 0.1) return fx(ms2, 2) + ' m/s²';
  if (a >= 1e-3) return fx(ms2 * 1000, 2) + ' mm/s²';
  if (a >= 1e-6) return fx(ms2 * 1e6, 2) + ' µm/s²';
  return (ms2 * 1e6).toExponential(1) + ' µm/s²';
}
function fMass(kg) { if (!isFinite(kg)) return '—'; const a = Math.abs(kg); return a >= 10000 ? fx(kg / 1000, 1) + ' t' : fx(kg, 0) + ' kg'; }
function fForce(N) { if (!isFinite(N)) return '—'; const a = Math.abs(N); return a >= 1e6 ? fx(N / 1e6, 2) + ' MN' : a >= 1000 ? fx(N / 1000, 1) + ' kN' : fx(N, 0) + ' N'; }
function fTime(s) { // compact duration
  if (!isFinite(s)) return '—'; const a = Math.abs(s), sg = s < 0 ? '−' : '';
  if (a < 60) return sg + fx(a, 1) + ' s';
  if (a < 3600) return sg + Math.floor(a / 60) + ' m ' + String(Math.floor(a % 60)).padStart(2, '0') + ' s';
  if (a < 86400 * 2) return sg + Math.floor(a / 3600) + ' h ' + String(Math.floor((a % 3600) / 60)).padStart(2, '0') + ' m';
  return sg + fx(a / 86400, 1) + ' d';
}
function fMET(dt) { return fmtMET(dt).replace('T-', 'T−'); }
function fLat(l) { return Math.abs(l).toFixed(2) + '°' + (l >= 0 ? 'N' : 'S'); }
function fLon(l) { l = ((l + 540) % 360) - 180; return Math.abs(l).toFixed(2) + '°' + (l >= 0 ? 'E' : 'W'); }
function isoLocalInput(t) { const d = tToDate(t); const p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; }
function inputToIso(v) { return v ? (v.length === 16 ? v + ':00Z' : v + 'Z') : null; }
const hexToRgb = hx => { const n = parseInt(hx.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const hexA = (hx, a) => { const c = hexToRgb(hx); return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`; };
const V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const BODY_LIST = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const GRAV_BODIES = ['sun', 'earth', 'moon', 'mars', 'venus', 'jupiter'];
// propulsion colour code used everywhere (3D paths, map, timeline, HUD): engines firing vs coasting
const PCOL = { burn: '#ff7b2e', burnCore: '#ffe2bd', coast: '#63c7ff' };
const BODY_COLORS = { sun: '#ffd27a', mercury: '#b9b2a8', venus: '#e8cf9a', earth: '#5cc8ff', moon: '#d6d6d6', mars: '#ff8a5c', jupiter: '#d8b48c', saturn: '#e3cf98', uranus: '#9fd6dc', neptune: '#6f8fff' };
// published payload capacities (for the vehicle card)
const CAPACITY = {
  saturnV: [['Low Earth orbit', '≈ 140 t'], ['Trans-lunar injection', '≈ 48.6 t (Apollo 17)']],
  sls1: [['Low Earth orbit', '≈ 95 t'], ['Trans-lunar injection', '> 27 t']],
  lm5: [['Low Earth orbit', '≈ 25 t'], ['Geostationary transfer', '≈ 14 t'], ['Trans-lunar injection', '≈ 8.2 t'], ['Trans-Mars injection', '≈ 5 t']],
  atlasV541: [['Mars 2020 (C3 14.5 km²/s²)', '4,037 kg flown']],
  atlasAgena: [['Mariner 4 to Mars (C3 ≈ 9.8)', '261 kg flown']],
  falconHeavy: [['Low Earth orbit (expendable)', '≈ 63.8 t'], ['Geostationary transfer', '≈ 26.7 t'], ['Mars', '≈ 16.8 t']],
  starship: [['Low Earth orbit (reusable)', '100 – 150 t'], ['Mars (after refilling)', '≈ 100 t']],
  lvm3: [['Geostationary transfer', '≈ 4 t'], ['Chandrayaan-3 (Earth parking orbit)', '3.9 t flown']],
  shuttle: [['Low Earth orbit (204 km, 28.5°)', '≈ 24.4 t in the payload bay'], ['Space Station orbit (51.6°)', '≈ 16 t'], ['Brought back to Earth', '≈ 14.4 t']],
};
const LENSES = [12, 16, 24, 35, 50, 85, 135, 200, 400, 800, 1600, 3200];
