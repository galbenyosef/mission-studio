// ============================================================================
// Sound — synthesised live with the Web Audio API, no recordings: rocket roar,
// air rush, re-entry plasma, parachutes, the rover's motors, countdown beeps,
// pyro bangs, touchdowns and an ambient score. Off until the viewer turns it on
// (browsers only start audio after a click or a key press).
// ============================================================================
const SND = {
  ctx: null, g: null, armed: false,
  on: lsGet('mstudio-sound', false), music: lsGet('mstudio-music', true),
  silentVacuum: lsGet('mstudio-silent-vacuum', false), vol: lsGet('mstudio-volume', 0.8),
  beepSec: null, chordIdx: -1, chordEnd: 0,
};
// D-major pad (MIDI notes): Dmaj9, Bm9, Gmaj9, Asus2, D/F#, Gmaj7, Em9, Asus4
const AUD_CHORDS = [[50, 57, 64, 66, 69, 73], [47, 54, 57, 62, 66, 73], [43, 55, 59, 62, 66, 69], [45, 57, 59, 64, 69, 71],
  [42, 54, 57, 62, 64, 69], [43, 55, 59, 62, 66, 71], [40, 55, 59, 62, 66, 74], [45, 57, 62, 64, 69, 74]];
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

// looping noise buffers; the tail is cross-faded into the head so the loop point is seamless
function audNoise(ctx, sec, kind) {
  const n = Math.floor(ctx.sampleRate * sec), m = Math.floor(ctx.sampleRate * 0.25), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const x = new Float32Array(n + m); let b = 0;
    for (let i = 0; i < n + m; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { b = (b + 0.02 * w) / 1.02; x[i] = b * 3.5; }
      else if (kind === 'crackle') x[i] = Math.random() < 0.0022 ? (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6) : w * 0.05;
      else x[i] = w;
    }
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = i < m ? x[i] * (i / m) + x[n + i] * (1 - i / m) : x[i];
  }
  return buf;
}
function audImpulse(ctx, sec) { // synthetic hall for the score
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8) * 0.5; }
  return b;
}
function audInit() {
  if (SND.ctx) return SND.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  let ctx; try { ctx = new AC(); } catch (e) { return null; }
  const g = {}; SND.ctx = ctx; SND.g = g;
  const gain = (v = 0) => { const x = ctx.createGain(); x.gain.value = v; return x; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  g.master = gain(0);
  g.comp = ctx.createDynamicsCompressor(); g.comp.threshold.value = -14; g.comp.knee.value = 10; g.comp.ratio.value = 5; g.comp.attack.value = 0.004; g.comp.release.value = 0.25;
  g.lim = ctx.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(1.4 * x) / Math.tanh(1.4); } g.lim.curve = curve; g.lim.oversample = '2x';
  g.master.connect(g.comp); g.comp.connect(g.lim); g.lim.connect(ctx.destination);
  g.cue = gain(0); g.cue.connect(g.lim); // countdown beeps skip the compressor so the engines' roar does not duck them
  g.sfx = gain(1); g.sfx.connect(g.master);
  // score: pad → low-pass → dry + hall
  g.mus = gain(0); g.mus.connect(g.master);
  g.musIn = gain(1); const mlp = filt('lowpass', 3000); g.musIn.connect(mlp); mlp.connect(g.mus);
  const verb = ctx.createConvolver(); verb.buffer = audImpulse(ctx, 3.4); const wet = gain(0.8); mlp.connect(verb); verb.connect(wet); wet.connect(g.mus);
  g.white = audNoise(ctx, 5, 'white'); g.brown = audNoise(ctx, 6, 'brown'); const crackle = audNoise(ctx, 4, 'crackle');
  const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); return s; };
  const voice = (src, ...nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } const out = gain(0); n.connect(out); out.connect(g.sfx); return out; };
  // rocket roar: brown-noise body, band-passed texture, crackle (big engines in air), sub-bass
  g.roarF = filt('lowpass', 400); g.roar = voice(loop(g.brown), g.roarF);
  g.texF = filt('bandpass', 700, 0.6); g.tex = voice(loop(g.white), g.texF);
  g.crk = voice(loop(crackle), filt('highpass', 900));
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 36;
  const subLfo = ctx.createOscillator(); subLfo.frequency.value = 0.7; const subLfoG = gain(4); subLfo.connect(subLfoG); subLfoG.connect(sub.frequency); sub.start(); subLfo.start();
  g.sub = voice(sub);
  // air rush (ascent, entry, parachutes) and re-entry plasma
  g.airF = filt('bandpass', 600, 0.5); g.air = voice(loop(g.white, 0.9), g.airF);
  g.plasmaF = filt('lowpass', 520); g.plasma = voice(loop(g.brown, 0.7), g.plasmaF);
  // rover drive motors: a buzzing saw with a little wobble
  g.mot = ctx.createOscillator(); g.mot.type = 'sawtooth'; g.mot.frequency.value = 95;
  const vib = ctx.createOscillator(); vib.frequency.value = 7; const vibG = gain(3); vib.connect(vibG); vibG.connect(g.mot.frequency); g.mot.start(); vib.start();
  g.motG = voice(g.mot, filt('lowpass', 750, 2));
  document.addEventListener('visibilitychange', () => { if (!SND.ctx) return; if (document.hidden) SND.ctx.suspend(); else if (SND.on) SND.ctx.resume(); });
  return ctx;
}
function setSound(on) {
  SND.on = on; lsSet('mstudio-sound', on);
  if (on) {
    const ctx = audInit();
    if (!ctx) { SND.on = false; syncSoundUI(); toast('Sound is not available in this browser'); return; }
    ctx.resume(); SND.g.master.gain.setTargetAtTime(SND.vol, ctx.currentTime, 0.05); SND.g.cue.gain.setTargetAtTime(SND.vol, ctx.currentTime, 0.05);
  } else if (SND.ctx) {
    SND.g.master.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.04); SND.g.cue.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.04);
    setTimeout(() => { if (!SND.on && SND.ctx) SND.ctx.suspend(); }, 400);
  }
  syncSoundUI();
}
function syncSoundUI() {
  const b = $('#btnSound'); if (!b) return;
  b.classList.toggle('on', SND.on); b.setAttribute('aria-pressed', SND.on ? 'true' : 'false');
  b.querySelector('.ico-on').style.display = SND.on ? '' : 'none'; b.querySelector('.ico-off').style.display = SND.on ? 'none' : '';
  $('#sndOn').checked = SND.on; $('#sndVol').value = SND.vol; $('#sndMusic').checked = SND.music; $('#sndVac').checked = SND.silentVacuum;
  const gs = $('#goSound'); if (gs) gs.checked = SND.on;
}
function initSound() {
  $('#btnSound').addEventListener('click', e => {
    e.stopPropagation(); const pop = $('#soundPop');
    if (!SND.on) { setSound(true); pop.hidden = false; } else pop.hidden = !pop.hidden;
    $('#top').classList.toggle('pop-open', !pop.hidden);
  });
  document.addEventListener('click', e => { const pop = $('#soundPop'); if (!pop.hidden && !e.target.closest('#soundPop') && !e.target.closest('#btnSound')) { pop.hidden = true; $('#top').classList.remove('pop-open'); } });
  $('#sndOn').addEventListener('change', e => setSound(e.target.checked));
  $('#sndVol').addEventListener('input', e => { SND.vol = +e.target.value; lsSet('mstudio-volume', SND.vol); if (SND.ctx && SND.on) { SND.g.master.gain.setTargetAtTime(SND.vol, SND.ctx.currentTime, 0.05); SND.g.cue.gain.setTargetAtTime(SND.vol, SND.ctx.currentTime, 0.05); } });
  $('#sndMusic').addEventListener('change', e => { SND.music = e.target.checked; lsSet('mstudio-music', SND.music); });
  $('#sndVac').addEventListener('change', e => { SND.silentVacuum = e.target.checked; lsSet('mstudio-silent-vacuum', SND.silentVacuum); });
  // sound was left on last time: start it with the first click or key press (browsers block it before that)
  const arm = () => { if (SND.on && !SND.armed) { SND.armed = true; setSound(true); } window.removeEventListener('pointerdown', arm, true); window.removeEventListener('keydown', arm, true); };
  if (SND.on) { window.addEventListener('pointerdown', arm, true); window.addEventListener('keydown', arm, true); }
  syncSoundUI();
}

// ---------------- per-frame mix, driven by the craft in view ----------------
function updateAudio(t, T) {
  const ctx = SND.ctx; if (!ctx || !SND.on || ctx.state !== 'running') return;
  const g = SND.g, now = ctx.currentTime, md = MV.md, live = !!md && STATE.playing;
  let roar = 0, tex = 0, crk = 0, sub = 0, air = 0, plasma = 0, mot = 0, cut = 300, airF = 600, motF = 95;
  if (md && T && T.c && T.c.node && T.c.node.visible) {
    const c = T.c, s = T.s, isTarget = CAM.target === 'obj:' + c.o.id;
    const d = Math.max(1e-4, R.camera.position.distanceTo(c.node.position)); // km
    const rho = T.ref === 'earth' || T.ref === 'mars' ? atmosOf(T.ref, Math.max(0, T.alt)).rho : 0; // kg/m³
    const airK = rho > 1e-5 ? clamp(Math.log10(rho / 1e-5) / Math.log10(1.225 / 1e-5), 0, 1) : 0; // 0 in vacuum … 1 at sea level
    const inAir = airK > 0.02;
    const medium = inAir ? 1 : SND.silentVacuum ? 0 : 0.55; // cinematic: engines in vacuum still rumble, muffled
    const thrust = live ? (T.thrust || 0) : 0;
    if (thrust > 0) {
      const loud = clamp(0.2 + 0.8 * Math.log10(thrust / 2e4) / Math.log10(3.5e7 / 2e4), 0.12, 1); // Saturn V ≈ 1, lunar module ≈ 0.3
      const att = 1 / (1 + Math.pow(d / (0.15 + 1.2 * loud), 1.3));
      const k = loud * Math.max(att, isTarget ? 0.22 : 0) * medium;
      roar = 0.9 * k; tex = (inAir ? 0.32 : 0.06) * k; sub = (inAir ? 0.7 : 0.35) * k;
      crk = inAir && thrust > 4e6 ? 0.5 * k * airK : 0;
      cut = inAir ? 260 + 1200 * loud * att * (0.4 + 0.6 * airK) : 240;
    }
    if (inAir && live && !s.surface && !s.pad) { // wind: dynamic pressure q = ½ρv² from the speed through the air
      const v = T.vSurf * 1000, q = 0.5 * rho * v * v;
      const attA = Math.max(1 / (1 + Math.pow(d / 0.4, 1.2)), isTarget ? 0.3 : 0);
      if (q > 5) {
        const qK = clamp(Math.sqrt(q / 35000), 0, 1);
        if (v > 2600) { plasma = 0.85 * qK * attA; air = 0.22 * qK * attA; } else air = 0.55 * qK * attA;
        airF = 300 + 2200 * clamp(v / 2500, 0, 1);
      }
      if (s.extra && s.extra.chute) { air = Math.max(air, 0.28 * attA); airF = 420 + 140 * Math.sin(now * 9); }
    }
    if (live && s.rover && s.rover.driving && d < 0.12) { mot = 0.12 * (1 - d / 0.12) * (T.ref === 'mars' ? 0.75 : 1) * (SND.silentVacuum && !inAir ? 0 : 1); motF = s.rover.kind === 'turn' ? 80 : 100 + 600 * Math.abs(s.rover.v); }
  }
  const set = (node, v, tc = 0.1) => node.gain.setTargetAtTime(v, now, tc);
  set(g.roar, roar); set(g.tex, tex); set(g.crk, crk); set(g.sub, sub); set(g.air, air, 0.2); set(g.plasma, plasma, 0.25); set(g.motG, mot, 0.15);
  g.roarF.frequency.setTargetAtTime(cut, now, 0.15); g.texF.frequency.setTargetAtTime(500 + cut * 0.5, now, 0.2);
  g.airF.frequency.setTargetAtTime(airF, now, 0.2); g.mot.frequency.setTargetAtTime(motF, now, 0.2);
  // final launch countdown: a beep each second from T−10 (higher for the last three)
  if (live && STATE.rate <= 2.5) {
    const met = t - md.M.t0;
    if (met > -10.05 && met < 0) {
      const sec = Math.ceil(-met - 1e-6);
      if (sec !== SND.beepSec) { if (SND.beepSec == null || sec < SND.beepSec) audBeep(sec <= 3 ? 1318.5 : 987.8, sec <= 3 ? 0.16 : 0.1); SND.beepSec = sec; }
    } else SND.beepSec = null;
  }
  updateMusic();
}
function updateMusic() {
  const ctx = SND.ctx, g = SND.g, now = ctx.currentTime;
  g.mus.gain.setTargetAtTime(SND.music ? 0.32 : 0, now, 0.8);
  if (!SND.music || now < SND.chordEnd - 3.2) return; // the next chord fades in while this one fades out
  SND.chordIdx = (SND.chordIdx + 1) % AUD_CHORDS.length;
  const ch = AUD_CHORDS[SND.chordIdx], t0 = now + 0.05, t1 = t0 + 10.5;
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(1, t0 + 3.2); env.gain.setValueAtTime(1, t1 - 3.2); env.gain.linearRampToValueAtTime(0, t1); env.connect(g.musIn);
  ch.forEach((m, j) => {
    for (const det of [-0.0017, 0.0017]) {
      const o = ctx.createOscillator(); o.type = j === 0 ? 'sine' : 'triangle'; o.frequency.value = midiHz(m) * (1 + det);
      const vg = ctx.createGain(); vg.gain.value = (j === 0 ? 0.12 : 0.045) * (m > 68 ? 0.7 : 1);
      o.connect(vg); vg.connect(env); o.start(t0); o.stop(t1 + 0.1);
    }
  });
  for (let k = 0; k < 2; k++) { // a soft bell or two, high above the pad
    if (Math.random() < 0.35) continue;
    const tb = t0 + 1.5 + Math.random() * 7, m = ch[2 + Math.floor(Math.random() * 4)] + 12;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(m);
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, tb); vg.gain.linearRampToValueAtTime(0.05, tb + 0.01); vg.gain.exponentialRampToValueAtTime(0.0005, tb + 3.2);
    o.connect(vg); vg.connect(g.musIn); o.start(tb); o.stop(tb + 3.3);
  }
  SND.chordEnd = t1;
}

// ---------------- one-shot effects ----------------
function audEnv(node, now, peak, attack, decay) { node.gain.setValueAtTime(0, now); node.gain.linearRampToValueAtTime(peak, now + attack); node.gain.exponentialRampToValueAtTime(0.0005, now + attack + decay); }
function audThump(now, k, f0, f1, dur) {
  const ctx = SND.ctx, o = ctx.createOscillator(), ga = ctx.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  audEnv(ga, now, k, 0.008, dur); o.connect(ga); ga.connect(SND.g.sfx); o.start(now); o.stop(now + dur + 0.05);
}
function audNoiseHit(now, buf, type, f, k, attack, decay, q = 0.7) {
  const ctx = SND.ctx, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), ga = ctx.createGain();
  src.buffer = buf; fl.type = type; fl.frequency.value = f; fl.Q.value = q; audEnv(ga, now, k, attack, decay);
  src.connect(fl); fl.connect(ga); ga.connect(SND.g.sfx); src.start(now, Math.random() * (buf.duration - 2)); src.stop(now + attack + decay + 0.05);
  return fl;
}
function audBeep(f, dur) {
  const ctx = SND.ctx, now = ctx.currentTime, o = ctx.createOscillator(), ga = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f; audEnv(ga, now, 0.32, 0.005, dur); o.connect(ga); ga.connect(SND.g.cue); o.start(now); o.stop(now + dur + 0.05);
}
const AUD_FX = {
  bang(now, k) { audNoiseHit(now, SND.g.white, 'highpass', 900, 0.9 * k, 0.003, 0.22); audThump(now, 0.8 * k, 95, 38, 0.35); }, // pyrotechnic separation
  whoomp(now, k) { const f = audNoiseHit(now, SND.g.brown, 'lowpass', 120, 0.9 * k, 0.25, 1.0); f.frequency.setValueAtTime(120, now); f.frequency.exponentialRampToValueAtTime(900, now + 0.5); audThump(now, 0.5 * k, 70, 32, 0.6); }, // engine start
  boom(now, k) { AUD_FX.bang(now, k); audThump(now + 0.04, 1.0 * k, 60, 24, 1.2); audNoiseHit(now + 0.05, SND.g.white, 'bandpass', 1800, 0.5 * k, 0.02, 1.4, 0.5); }, // liftoff
  fwump(now, k) { audNoiseHit(now, SND.g.white, 'bandpass', 420, 0.8 * k, 0.06, 0.8, 0.9); audThump(now + 0.15, 0.6 * k, 62, 38, 0.3); }, // canopy opens
  thud(now, k) { audThump(now, 0.9 * k, 72, 28, 0.5); audNoiseHit(now, SND.g.brown, 'lowpass', 300, 0.5 * k, 0.004, 0.18); }, // touchdown
  sonic(now, k) { for (const dt of [0, 0.38]) { audNoiseHit(now + dt, SND.g.brown, 'lowpass', 260, 1.0 * k, 0.002, 0.28); audThump(now + dt, 0.9 * k, 48, 26, 0.45); } }, // the orbiter's twin sonic boom
  clunk(now, k) { audThump(now, 0.6 * k, 150, 60, 0.18); audThump(now + 0.12, 0.5 * k, 130, 55, 0.2); audNoiseHit(now, SND.g.white, 'bandpass', 2400, 0.12 * k, 0.002, 0.3, 6); }, // docking latches
};
const AUD_EVENT = { staging: 'bang', sep: 'bang', jettison: 'bang', skycrane: 'bang', ignition: 'whoomp', burn: 'whoomp', powered: 'whoomp', chute: 'fwump', touchdown: 'thud', landing: 'thud', dock: 'clunk', trim: 'clunk' };
function audioEvent(e) {
  const ctx = SND.ctx; if (!ctx || !SND.on || ctx.state !== 'running' || !STATE.playing || STATE.rate > 150) return;
  let fx = AUD_EVENT[e.kind];
  if (e.kind === 'launch') fx = e.ign ? 'whoomp' : 'boom';
  if (/^Sonic booms?/.test(e.name || '')) fx = 'sonic';
  if (!fx) return;
  const c = e.obj ? craftById(e.obj) : null; let k = 1;
  if (c && c.s && c.node && c.node.visible) {
    const d = R.camera.position.distanceTo(c.node.position);
    const alt = vnorm(c.s.r) - surfaceRadius(c.s.ref), rho = c.s.ref === 'earth' || c.s.ref === 'mars' ? atmosOf(c.s.ref, Math.max(0, alt)).rho : 0;
    if (rho < 1e-5 && SND.silentVacuum) return; // nothing carries the sound in vacuum
    k = Math.max(1 / (1 + Math.pow(d / 0.6, 1.2)), CAM.target === 'obj:' + c.o.id ? 0.3 : 0.12) * (rho < 1e-5 ? 0.6 : 1);
  }
  AUD_FX[fx](ctx.currentTime + 0.01, k);
}
