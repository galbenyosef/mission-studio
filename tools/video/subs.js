// Writes the captions of a storyboard as an ASS subtitle file, on the timeline of the finished video (scenes joined by
// crossfades), and prints each caption's place in the mission so it can be checked against the events.
//   node subs.js [--board scenes.js] [--out captions.ass] [--lang ko|en] [--timeline]
// --timeline: also the event timeline along the bottom (board.timeline): a thin bar with a mark for each event, the
// mission's phases under it, a dot for where the film is, and the mission time at its right end.
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SB = require(path.resolve(arg('board', path.join(__dirname, 'scenes.js')))), OUT = arg('out', path.join(__dirname, 'captions.ass'));
const XF = SB.xfade || 0, LANG = arg('lang', 'ko');

function pchip(keys) { // the same interpolation as vidlib.js, to report mission time
  const n = keys.length, x = keys.map(k => k[0]), y = keys.map(k => k[1]);
  if (n === 1) return () => y[0];
  const h = [], d = []; for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
  const m = new Array(n); m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  return xx => {
    if (xx <= x[0]) return y[0] + m[0] * (xx - x[0]); if (xx >= x[n - 1]) return y[n - 1] + m[n - 1] * (xx - x[n - 1]);
    let i = 0; while (i < n - 2 && xx > x[i + 1]) i++;
    const t = (xx - x[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const ts = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };
const met = s => { const a = Math.abs(s), h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60), x = Math.floor(a % 60); return (s < 0 ? '-' : '+') + `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
const len = sc => sc.range ? sc.range[1] - sc.range[0] : sc.dur;

// the look: a light weight in off-white on a soft dark halo (a wide, blurred, half-transparent outline) so it reads on sky
// and clouds as well as on space; lower third
const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Noto Sans CJK KR DemiLight,46,&H00F0F2F4,&H000000FF,&H70000000,&HA0000000,0,0,0,0,100,100,2,0,1,2.6,0,2,120,120,124,1
Style: Title,Noto Sans CJK KR DemiLight,64,&H00F2F4F6,&H000000FF,&H70000000,&HA0000000,0,0,0,0,100,100,3,0,1,2.8,0,2,120,120,132,1
Style: TL,Noto Sans CJK KR DemiLight,20,&H00F0F2F4,&H000000FF,&H78000000,&HA0000000,0,0,0,0,100,100,1,0,1,1.8,0,8,0,0,0,1
Style: TLd,Noto Sans CJK KR DemiLight,20,&H00F4F4F4,&H000000FF,&HA8000000,&HA0000000,0,0,0,0,100,100,0,0,1,1.2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const lines = []; let at = 0;
SB.scenes.forEach((sc, i) => {
  const r0 = sc.range ? sc.range[0] : 0, L = len(sc);
  const tOf = pchip(sc.time.map(([tau, m]) => [tau, m]));
  for (const c of sc.captions || []) {
    let a = c.at - r0, b = c.at + c.dur - r0;
    if (b <= 0 || a >= L) continue; a = Math.max(a, 0); b = Math.min(b, L);
    const A = at + a, B = at + b, title = i === 0 && /\\N/.test(c.text);
    let text = LANG === 'en' ? c.en : c.text; if (!text) throw new Error(`no ${LANG} caption in ${sc.id}`);
    if (title) { const [l1, ...rest] = text.split('\\N'); text = `${l1}\\N{\\fs40\\fsp2\\1a&H18&}${rest.join('\\N')}`; }
    lines.push(`Dialogue: 0,${ts(A)},${ts(B)},${title ? 'Title' : 'Cap'},,0,0,0,,{\\fad(1200,1600)\\blur3.5}${text}`);
    const warn = b > L - XF ? '  (runs into the crossfade)' : '';
    console.log(`${ts(A).slice(0, 10)} ${sc.id.padEnd(14)} τ ${c.at.toFixed(1).padStart(5)}  MET ${met(tOf(c.at))}  ${text.replace(/\{[^}]*\}/g, '').replace('\\N', ' / ')}${warn}`);
  }
  at += L - (i < SB.scenes.length - 1 ? XF : 0);
});
if (process.argv.includes('--timeline') && SB.timeline) timeline(at);
fs.writeFileSync(OUT, head + lines.join('\n') + '\n');
console.log(`${lines.length} captions, video ${ts(at)} (${at.toFixed(1)} s) → ${OUT}`);

// the event timeline: drawn from the moment the title has gone until the end, fading in and out with the film
function timeline(T) {
  const TL = SB.timeline, X0 = 160, X1 = 1760, W = X1 - X0, Y = 1024, ON = 16, en = LANG === 'en';
  const x = t => X0 + W * t / T, ms = t => Math.round((t - ON) * 1000);
  const starts = [], maps = {}; let s0 = 0;
  SB.scenes.forEach((sc, i) => { starts.push(s0); maps[sc.id] = { i, start: s0, tOf: pchip(sc.time) }; s0 += len(sc) - (i < SB.scenes.length - 1 ? XF : 0); });
  const tauOf = (id, met) => { const m = maps[id], sc = SB.scenes[m.i]; let a = 0, b = len(sc); for (let k = 0; k < 60; k++) { const c = (a + b) / 2; if (m.tOf(c) < met) a = c; else b = c; } return a; };
  const at0 = id => maps[id].start + (maps[id].i ? XF / 2 : 0);
  const fad = `\\fad(2000,3000)`, ev = (layer, style, body) => lines.push(`Dialogue: ${layer},${ts(ON)},${ts(T)},${style},,0,0,0,,${body}`);
  const rect = (w, h) => `{\\p1}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}{\\p0}`;
  // the bar, and the part of it the film has passed
  ev(1, 'TLd', `{\\an7\\pos(${X0},${Y - 1})${fad}\\1a&HC0&}${rect(W, 2)}`);
  ev(2, 'TLd', `{\\an7\\pos(${X0},${Y - 1})${fad}\\1a&H58&\\bord0\\fscx${(100 * ON / T).toFixed(3)}\\t(0,${ms(T)},\\fscx100)}${rect(W, 2)}`);
  // the phases: a mark where each begins, its name under its stretch of the bar, bright while the film is in it
  const ph = TL.phases.map(([id, ko, enName], k) => ({ t0: k ? at0(id) : 0, name: en ? enName : ko }));
  ph.forEach((p, k) => {
    const t1 = k + 1 < ph.length ? ph[k + 1].t0 : T, cx = (x(p.t0) + x(t1)) / 2;
    if (k) ev(1, 'TLd', `{\\an7\\pos(${(x(p.t0) - 0.75).toFixed(1)},${Y - 9})${fad}\\1a&H90&}${rect(1.5, 18)}`);
    const on = p.t0 <= ON, a0 = on ? '&H10&' : '&H80&';
    let tr = on ? '' : `\\t(${ms(p.t0)},${ms(p.t0) + 1500},\\1a&H10&)`; if (t1 < T) tr += `\\t(${ms(t1)},${ms(t1) + 1500},\\1a&H80&)`;
    ev(1, 'TL', `{\\an8\\pos(${cx.toFixed(1)},${Y + 11})${fad}\\blur1.5\\1a${a0}${tr}}${p.name}`);
  });
  // the events: a short mark each, brightening once the film has passed it
  for (const [id, w] of TL.events) {
    const t = maps[id].start + (typeof w === 'number' ? tauOf(id, w) : w.tau);
    ev(3, 'TLd', `{\\an7\\pos(${(x(t) - 1).toFixed(1)},${Y - 5})${fad}\\1a&HA0&\\t(${ms(t)},${ms(t) + 800},\\1a&H20&)}${rect(2, 10)}`);
  }
  // where the film is
  const r = 4.5, k = (0.5523 * r).toFixed(2), d = 2 * r, dot = `{\\p1}m ${r} 0 b ${r + +k} 0 ${d} ${r - k} ${d} ${r} b ${d} ${r + +k} ${r + +k} ${d} ${r} ${d} b ${r - k} ${d} 0 ${r + +k} 0 ${r} b 0 ${r - k} ${r - k} 0 ${r} 0{\\p0}`;
  ev(4, 'TLd', `{\\an7\\move(${(x(ON) - r).toFixed(1)},${Y - r},${(X1 - r).toFixed(1)},${Y - r},0,${ms(T)})${fad}\\1a&H08&\\bord1.4\\blur0.8}${dot}`);
  // the mission time at the right end, above the bar: the scene on screen (the next one from halfway through a crossfade)
  const sceneAt = t => { let i = 0; while (i + 1 < SB.scenes.length && t >= starts[i + 1] + XF / 2) i++; return i; };
  const fmt = met => {
    const m = Math.floor(Math.abs(met) / 60), d = Math.floor(met / 86400), h = Math.floor(met % 86400 / 3600), mi = Math.floor(met % 3600 / 60);
    if (Math.abs(met) < 60) { const sec = Math.floor(Math.abs(met)); return met < 0 ? (en ? `T−${sec + 1} s` : `발사 ${sec + 1}초 전`) : (en ? `T+${sec} s` : `발사 후 ${sec}초`); } // seconds around liftoff
    if (met < 0) return en ? `T−${Math.ceil(-met / 60)} min` : `발사 ${Math.ceil(-met / 60)}분 전`;
    if (en) return 'T+' + (d ? `${d}d ` : '') + (d || h ? `${h}h ` : '') + `${mi}m`;
    return '발사 후 ' + (d ? `${d}일 ` : '') + (d || h ? `${h}시간 ` : '') + `${mi}분`;
  };
  let cur = null, from = ON; const runs = [];
  for (let t = ON; t <= T + 1e-9; t += 1 / 24) {
    const i = sceneAt(t), sc = SB.scenes[i], tau = Math.min(Math.max(t - starts[i], 0), len(sc)), s = fmt(maps[sc.id].tOf(tau));
    if (s !== cur) { if (cur !== null) runs.push([from, t, cur]); cur = s; from = t; }
  }
  runs.push([from, T, cur]);
  runs.forEach(([a, b, s], k) => lines.push(`Dialogue: 4,${ts(a)},${ts(b)},TL,,0,0,0,,{\\an3\\pos(${X1},${Y - 12})\\blur1.5\\1a&H50&${k === 0 ? '\\fad(2000,0)' : ''}${k === runs.length - 1 ? '\\fad(0,3000)' : ''}}${s}`));
  console.log(`timeline: ${TL.events.length} events, ${ph.length} phases, ${runs.length} clock changes`);
}
