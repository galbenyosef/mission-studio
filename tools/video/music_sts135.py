# The score of the STS-135 highlight film (sts135.js), synthesised from scratch (no samples, no third-party material) and
# released under CC0. D major, 96 beats a minute, its bars laid so that liftoff (28.5 s into the film) and touchdown
# (268.5 s) fall on downbeats. A quiet build on the pad with a ticking clock; at liftoff a deep hit, a driving bass, a
# kick, hats and a plucked arpeggio through the ascent; in orbit the drums fall away and bells come in; a broad half-time
# section for the docking and the station; for the undocking only pads and bells; the deorbit and entry over a pedal A,
# the pulse coming back and rising; at touchdown the home chord, a plagal close, and a long fade.
#   python3 -I music_sts135.py out.wav [seconds]
import os, sys, numpy as np
from scipy import signal

SR = 44100
OUT = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 302.0
N = int(DUR * SR)
rng = np.random.default_rng(135)
f32 = np.float32
ONLY = os.environ.get('ONLY')  # render one part alone to check it: pad, bass, kick, hats, arp, bells, fx
want = lambda part: ONLY is None or ONLY == part

BEAT = 60 / 96; BAR = 4 * BEAT; G0 = 28.5  # the downbeat of liftoff; bars at G0 + k·BAR
bar = lambda k: G0 + k * BAR
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# ---------------- building blocks (as in music.py) ----------------
TAB = 4096; ph = np.arange(TAB) / TAB; wave = np.zeros(TAB)
for n in range(1, 11): wave += (0.75 if n % 2 == 0 else 1.0) * np.sin(2 * np.pi * n * ph) / n ** 1.9
wave = (wave / np.abs(wave).max()).astype(f32)
def osc(freq, n, phase0=0.0):
    p = (phase0 + np.arange(n, dtype=np.float64) * (freq / SR)) % 1.0
    i = p * TAB; i0 = i.astype(np.int64); fr = (i - i0).astype(f32)
    return wave[i0 % TAB] * (1 - fr) + wave[(i0 + 1) % TAB] * fr
def env(n, att, rel):
    e = np.ones(n, dtype=f32); a = min(int(att * SR), n // 2); r = min(int(rel * SR), n // 2)
    if a: e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a, dtype=f32))
    if r: e[-r:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r, dtype=f32))
    return e
L = np.zeros(N, dtype=f32); Rr = np.zeros(N, dtype=f32); sL = np.zeros(N, dtype=f32); sR = np.zeros(N, dtype=f32)
def add(sig, start, pan, gain, send, dest=None):
    a = int(round(start * SR)); b = min(a + len(sig), N)
    if b <= a or a < 0: return
    s = sig[:b - a] * gain; gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    dl, dr = dest if dest else (L, Rr)
    dl[a:b] += s * gl; dr[a:b] += s * gr; sL[a:b] += s * gl * send; sR[a:b] += s * gr * send
# a level that changes over the film: keys [(t, level)], linear between them
def ramp(keys):
    ts = np.array([k[0] for k in keys]); vs = np.array([k[1] for k in keys])
    return lambda t: float(np.interp(t, ts, vs))

# ---------------- the harmony ----------------
# name: (pitch classes, bass pitch class); C = 0
CH = {
    'Dsus2': ([2, 4, 9], 2), 'D': ([2, 6, 9], 2), 'Dadd9': ([2, 6, 9, 4], 2), 'Dmaj9': ([2, 6, 9, 1, 4], 2), 'D/F#': ([2, 6, 9], 6),
    'Bm': ([11, 2, 6], 11), 'Bm7': ([11, 2, 6, 9], 11), 'Bm/A': ([11, 2, 6], 9),
    'G': ([7, 11, 2], 7), 'Gmaj7': ([7, 11, 2, 6], 7), 'G/A': ([7, 11, 2], 9), 'Gmaj7/A': ([7, 11, 2, 6], 9), 'Gmaj7/D': ([7, 11, 2, 6], 2),
    'A': ([9, 1, 4], 9), 'Asus4': ([9, 2, 4], 9), 'A/C#': ([9, 1, 4], 1),
    'Em': ([4, 7, 11], 4), 'Em7': ([4, 7, 11, 2], 4), 'Em7/A': ([4, 7, 11, 2], 9),
}
def run(k0, names_bars):  # chords from bar k0, each for its number of bars
    out = []; k = k0
    for name, nb in names_bars: out.append((bar(k), name)); k += nb
    return out, k
SEQ = [(0.0, 'Dsus2'), (bar(-8), 'Bm7'), (bar(-5), 'Gmaj7'), (bar(-3), 'Asus4'), (bar(-1), 'A')]
B, k = run(0, [('D', 2), ('Bm', 2), ('G', 2), ('A', 2), ('D', 2), ('Bm', 2), ('G', 2), ('A', 2), ('G', 2), ('A', 2)])                  # ascent: 28.5–78.5
C, k = run(k, [('Gmaj7', 2), ('D/F#', 2), ('Em7', 2), ('A', 2), ('Gmaj7', 2), ('Bm', 2), ('Em7', 2), ('Asus4', 2), ('Gmaj7', 2), ('Asus4', 2), ('A', 3)])  # orbit: –136
D, k = run(k, [('D', 2), ('A/C#', 2), ('Bm', 2), ('G', 2), ('D', 2), ('A', 2), ('G', 2), ('A', 2), ('D', 2)])                         # the station: –181
E, k = run(k, [('Bm', 2), ('G', 2), ('D', 2), ('A', 2), ('Bm', 2), ('G', 2), ('Em', 2), ('Asus4', 2)])                                 # undocking: –221
F, k = run(k, [('G/A', 2), ('Bm/A', 2), ('G/A', 2), ('Em7/A', 2), ('G/A', 2), ('Bm/A', 2), ('Gmaj7/A', 2), ('Asus4', 2), ('A', 3)])  # deorbit, entry: –268.5
G, k = run(k, [('Dmaj9', 4), ('Gmaj7/D', 3), ('Dadd9', 8)])                                                                             # home
SEQ += B + C + D + E + F + G
T_B, T_C, T_D, T_E, T_F, T_G = B[0][0], C[0][0], D[0][0], E[0][0], F[0][0], G[0][0]
def chord_at(t):
    name = SEQ[0][1]
    for t0, nm in SEQ:
        if t0 <= t: name = nm
    return CH[name]
print('sections', [round(x, 1) for x in (T_B, T_C, T_D, T_E, T_F, T_G)])

# ---------------- pad: five voices led smoothly from chord to chord, three detuned saws each ----------------
PAD = 0.05
pad_lvl = ramp([(0, 0.7), (T_B - 4, 0.85), (T_B, 1.0), (T_C, 0.85), (T_D - 2, 0.9), (T_D, 1.3), (T_E - 3, 1.2), (T_E, 0.75), (T_F, 0.7), (T_G - 6, 1.0), (T_G, 1.25), (DUR, 1.1)])
LO, HI = 50, 74
def voice(prev, pcs, k=5):
    cands = [m for m in range(LO, HI + 1) if m % 12 in pcs]
    if prev is None: return sorted(rng.choice(cands, size=k, replace=False).tolist())
    out = []
    for m in prev:
        best = min((c for c in cands if c not in out), key=lambda c: (abs(c - m), rng.random())); out.append(best)
    for p in pcs:
        if p not in [m % 12 for m in out]:
            i = min(range(len(out)), key=lambda i: min(abs(c - out[i]) for c in cands if c % 12 == p))
            out[i] = min((c for c in cands if c % 12 == p), key=lambda c: abs(c - out[i]))
    return sorted(out)
prev = None
for i, (t0, name) in enumerate(SEQ):
    pcs, bpc = CH[name]; t1 = SEQ[i + 1][0] if i + 1 < len(SEQ) else DUR; last = i + 1 == len(SEQ)
    att = 4.0 if t0 < T_B else 1.2; rel = 3.0
    dur = (DUR - t0) if last else (t1 - t0) + rel; n = int(dur * SR)
    vo = voice(prev, pcs); prev = vo; e = env(n, att, 14.0 if last else rel)
    if want('pad'):
        for m in vo:
            for d, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
                lfo = (1 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.05, 0.13) * np.arange(n, dtype=f32) / SR + rng.uniform(0, 6.3))).astype(f32)
                add(osc(hz(m) * 2 ** (d / 1200), n, rng.random()) * e * lfo, t0, pan * 0.8, PAD * pad_lvl(t0) * (0.8 if m > 66 else 1.0), 0.5)

# ---------------- shimmer: the chord's tones high up (C6 to C7), plain sines swelling with each chord, for air ----------------
if want('pad'):
    for i, (t0, name) in enumerate(SEQ):
        if not (T_B <= t0 < T_C or T_D <= t0 < T_E or t0 >= T_G): continue
        pcs, _ = CH[name]; t1 = SEQ[i + 1][0] if i + 1 < len(SEQ) else DUR; n = int((t1 - t0 + 2.0) * SR); tt = np.arange(n) / SR
        for m in sorted(m for m in range(84, 97) if m % 12 in pcs)[:3]:
            sh = (np.sin(2 * np.pi * hz(m) * tt + rng.uniform(0, 6.3)) * (1 + 0.3 * np.sin(2 * np.pi * 0.21 * tt))).astype(f32) * env(n, 1.5, 2.0)
            add(sh, t0, rng.uniform(-0.7, 0.7), 0.012, 0.8)

# ---------------- bass: a drone in the intro, then the pulse (eighths), whole notes, the pedal ----------------
BASSb = np.zeros(N, dtype=f32)
def bass_note(m, t, dur, gain, pump=False):
    n = int(dur * SR); tt = np.arange(n, dtype=np.float64) / SR; f = hz(m)
    s = (np.sin(2 * np.pi * f * tt) + 0.35 * osc(f, n, rng.random())).astype(f32)
    e = env(n, 0.006 if pump else 0.4, min(0.08 if pump else 1.2, dur / 3))
    if pump: e *= (0.55 + 0.45 * np.exp(-tt / 0.18)).astype(f32)
    a = int(t * SR); b = min(a + n, N)
    if b > a: BASSb[a:b] += (s * e * gain)[:b - a]
bm = lambda pc: 26 + (pc - 26) % 12  # the bass register: D1 … C#2
if want('bass'):
    bass_note(38, 0.0, T_B - 0.2, 0.33)  # the intro's drone, D2
    for t0, name in SEQ:
        pcs, bpc = CH[name]; t1 = next((x for x, _ in SEQ if x > t0), DUR); m = bm(bpc)
        if T_B <= t0 < T_C or T_D <= t0 < T_E:  # eighths in the ascent, quarter notes at the station
            step = BEAT / 2 if t0 < T_C else BEAT
            for j in range(int(round((t1 - t0) / step))):
                tj = t0 + j * step; oct12 = 12 if (t0 < T_C and j % 8 == 7) else 0
                bass_note(m + oct12, tj, step * 0.95, 0.42 if t0 < T_C else 0.5, pump=True)
        elif T_F <= t0 < T_G:  # the pedal A, pulsing in eighths, louder towards touchdown
            for j in range(int(round((t1 - t0) / (BEAT / 2)))):
                tj = t0 + j * BEAT / 2; bass_note(bm(9), tj, BEAT / 2 * 0.9, 0.22 + 0.25 * (tj - T_F) / (T_G - T_F), pump=True)
        elif t0 >= T_B:
            bass_note(m, t0, (t1 - t0) + 0.3, 0.32 if T_E <= t0 < T_F else (0.45 if t0 < T_G else 0.55))
    BASSb = signal.lfilter(*signal.butter(2, 420 / (SR / 2)), BASSb).astype(f32)
    add(BASSb, 0.0, 0.0, 0.5, 0.06)
del BASSb

# ---------------- drums: a soft kick, hats of filtered noise, a deep hit at liftoff and at touchdown ----------------
def kick(gain):
    n = int(0.6 * SR); tt = np.arange(n) / SR; f = 46 + 80 * np.exp(-tt / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.28)
    c = rng.standard_normal(int(0.004 * SR)) * np.linspace(1, 0, int(0.004 * SR)) * 0.25; s[:len(c)] += c
    return (s * gain).astype(f32)
KIT = np.zeros(N, dtype=f32)
def put(sig, t):
    a = int(t * SR); b = min(a + len(sig), N)
    if b > a: KIT[a:b] += sig[:b - a]
if want('kick'):
    for j in range(int(round((T_C - T_B) / BEAT))): put(kick(0.9 if j % 4 == 0 else 0.7), T_B + j * BEAT)                 # ascent: every beat
    for j in range(int(round((T_E - T_D) / BEAT))):                                                                     # the station: half time
        if j % 4 in (0, 2): put(kick(0.75 if j % 4 == 0 else 0.55), T_D + j * BEAT)
    t = bar(int(np.ceil((246 - G0) / BAR)))
    while t < T_G - 1e-6: put(kick(0.45 + 0.4 * (t - 246) / (T_G - 246)), t); t += BEAT                                   # entry: building
    add(KIT, 0.0, 0.0, 0.55, 0.08)
def hit(t, gain, length=3.5):  # a deep boom with a burst of dark noise
    n = int(length * SR); tt = np.arange(n) / SR; f = 34 + 50 * np.exp(-tt / 0.08)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.9)
    nz = signal.lfilter(*signal.butter(2, 900 / (SR / 2)), rng.standard_normal(n)) * np.exp(-tt / 0.45) * 0.6
    add(((s + nz) * gain).astype(f32), t, 0.0, 1.0, 0.35)
if want('fx'): hit(T_B, 0.55); hit(63.57, 0.22, 2.5); hit(T_G, 0.32)
HAT = np.zeros(N, dtype=f32)
def hat(t, gain, dec=0.035):
    n = int(0.25 * SR); tt = np.arange(n) / SR; s = (rng.standard_normal(n) * np.exp(-tt / dec) * gain).astype(f32)
    a = int(t * SR); b = min(a + n, N)
    if b > a: HAT[a:b] += s[:b - a]
if want('hats'):
    t = bar(-6)
    while t < T_B - 1e-6: hat(t, 0.18 + 0.32 * (t - bar(-6)) / (T_B - bar(-6)), 0.02); t += BEAT / 2   # the intro's clock
    for j in range(int(round((T_C - T_B) / (BEAT / 4)))): hat(T_B + j * BEAT / 4, (0.55 if j % 4 == 2 else 0.26) * (1 if j % 2 == 0 else 0.6))
    for j in range(int(round((T_E - T_D) / (BEAT / 2)))): hat(T_D + j * BEAT / 2, 0.22 if j % 2 else 0.12)
    t = T_F
    while t < T_G - 1e-6: hat(t, 0.12 + 0.3 * (t - T_F) / (T_G - T_F)); t += BEAT / 2 if t < 258 else BEAT / 4
    HAT = signal.lfilter(*signal.butter(2, 7000 / (SR / 2), btype='high'), HAT).astype(f32)
    add(HAT, 0.0, 0.25, 0.32, 0.15)
del KIT, HAT

# ---------------- the arpeggio: plucked chord tones in sixteenths (in orbit softer, through an echo) ----------------
ARPL = np.zeros(N, dtype=f32); ARPR = np.zeros(N, dtype=f32)
def pluck(m, dur=0.6):
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for h in range(1, 9): s += np.exp(-tt / (0.32 / h ** 0.75)) * np.sin(2 * np.pi * f * h * tt + rng.uniform(0, 6.3)) / h
    a = int(0.003 * SR); s[:a] *= np.linspace(0, 1, a)
    return s.astype(f32)
PATTERN = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3]  # indices into the chord's tones, low to high
def arp_span(t0, t1, gain, step, lo=62):
    j = 0; t = t0
    while t < t1 - 1e-6:
        pcs, _ = chord_at(t); tones = sorted(m for m in range(lo, lo + 24) if m % 12 in pcs)
        m = tones[min(PATTERN[j % 16], len(tones) - 1)]; g = gain * (1.0 if j % 4 == 0 else 0.72)
        s = pluck(m); a = int(t * SR); b = min(a + len(s), N); pan = 0.35 * np.sin(j * 0.7)
        if b > a: ARPL[a:b] += s[:b - a] * g * np.cos((pan + 1) * np.pi / 4); ARPR[a:b] += s[:b - a] * g * np.sin((pan + 1) * np.pi / 4)
        j += 1; t += step
if want('arp'):
    arp_span(T_B, T_C, 0.3, BEAT / 4)
    arp_span(T_C, T_D - BAR, 0.16, BEAT / 4, 66)
    arp_span(T_D, T_E, 0.2, BEAT / 2)
    arp_span(246.0, T_G, 0.22, BEAT / 4, 64)
    d = int(BEAT * 0.75 * SR)  # a ping-pong echo, three-sixteenths
    for k in range(1, 5):
        g = 0.38 ** k; src_l, src_r = (ARPR, ARPL) if k % 2 else (ARPL, ARPR)
        L[d * k:] += src_l[:-d * k] * g * 0.6; Rr[d * k:] += src_r[:-d * k] * g * 0.6
    L += ARPL; Rr += ARPR; sL += ARPL * 0.3; sR += ARPR * 0.3
del ARPL, ARPR

# ---------------- bells: soft mallets on chord tones in orbit, at the docking, after undocking and at the end ----------------
def bell(m, t, vel, pan):
    n = int(6.0 * SR); tt = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for ratio, amp, dec in ((1.0, 1.0, 2.8), (2.0, 0.3, 1.4), (3.0, 0.08, 0.8), (4.07, 0.05, 0.5)): s += amp * np.exp(-tt / dec) * np.sin(2 * np.pi * f * ratio * tt)
    a = int(0.03 * SR); s[:a] *= np.linspace(0, 1, a) ** 2
    add(s.astype(f32), t, pan, 0.16 * vel, 0.65)
if want('bells'):
    for t0, t1, gap, vel in ((T_C + 2, T_D - 2, (3.0, 6.0), 0.8), (T_E, T_F - 2, (2.5, 5.0), 0.9), (T_G + 3, DUR - 12, (3.5, 7.0), 0.7)):
        t = t0
        while t < t1:
            pcs, _ = chord_at(t); pool = [m for m in range(74, 91) if m % 12 in pcs]
            bell(int(rng.choice(pool)), t, vel * rng.uniform(0.6, 1.0), rng.uniform(-0.6, 0.6)); t += rng.uniform(*gap)
    for i, m in enumerate((74, 78, 81, 86)): bell(m, T_D + i * BEAT / 2, 0.9, -0.4 + 0.27 * i)  # the docking: a rising D major
    for i, m in enumerate((86, 81, 78, 74)): bell(m, T_G + 0.02 + i * BEAT, 0.75, 0.4 - 0.27 * i)  # touchdown: and back down

# ---------------- swells of noise before liftoff, before the tank goes, before touchdown ----------------
def riser(t0, t1, gain, f0=300, f1=3000):
    n = int((t1 - t0) * SR); x = rng.standard_normal(n); out = np.zeros(n); blk = 2048
    for i in range(0, n, blk):
        fr = i / n; fc = f0 * (f1 / f0) ** fr; b, a = signal.butter(2, [fc * 0.7 / (SR / 2), min(fc * 1.4, SR / 2 - 100) / (SR / 2)], btype='band')
        out[i:i + blk] = signal.lfilter(b, a, x[i:i + blk])
    e = np.linspace(0, 1, n) ** 2.2
    add((out * e * gain).astype(f32), t0, 0.0, 1.0, 0.45)
if want('fx'): riser(T_B - 7.0, T_B, 0.22); riser(58.5, 63.57, 0.1); riser(T_G - 7.5, T_G, 0.16)

# ---------------- hall (as in music.py, a little shorter) ----------------
irn = int(4.5 * SR); ti = np.arange(irn) / SR
def ir_ch(seed):
    r = np.random.default_rng(seed); x = r.standard_normal(irn)
    lo = signal.lfilter(*signal.butter(2, 1800 / (SR / 2)), x) * np.exp(-ti / 0.75)
    hi = signal.lfilter(*signal.butter(2, 6000 / (SR / 2)), x) * np.exp(-ti / 0.25)
    ir = 0.8 * lo + 0.35 * hi; ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    return (ir / np.sqrt((ir ** 2).sum())).astype(f32)
L += 0.8 * signal.oaconvolve(sL, ir_ch(1))[:N].astype(f32); Rr += 0.8 * signal.oaconvolve(sR, ir_ch(2))[:N].astype(f32)
del sL, sR

# ---------------- master ----------------
hp = signal.butter(2, 28 / (SR / 2), btype='high'); lp = signal.butter(2, 15000 / (SR / 2))
for ch in (L, Rr): ch[:] = signal.lfilter(*lp, signal.lfilter(*hp, ch)).astype(f32)
fade = env(N, 1.5, 14.0); L *= fade; Rr *= fade
if ONLY is None:
    pk = max(np.abs(L).max(), np.abs(Rr).max()); L /= pk / 0.8; Rr /= pk / 0.8
    L[:] = np.tanh(L * 1.1) / np.tanh(1.1); Rr[:] = np.tanh(Rr * 1.1) / np.tanh(1.1)  # a gentle soft clip for the peaks
from scipy.io import wavfile
wavfile.write(OUT, SR, np.stack([L, Rr], axis=1).astype(f32))
print('wrote', OUT, f'{DUR:.0f} s, {len(SEQ)} chords')
