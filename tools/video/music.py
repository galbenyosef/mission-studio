# An original ambient piece for falling asleep to, synthesised from scratch (no samples, no third-party material): slow pad
# chords in D-flat major, a low drone, sparse soft bell notes and a faint breath of filtered noise, in a large hall.
# No beat; the harmony changes about every half minute. Written for this video and released under CC0.
#   python3 -I music.py out.wav [seconds]
import os, sys, numpy as np
from scipy import signal

SR = 44100
OUT = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 1800.0
N = int(DUR * SR)
rng = np.random.default_rng(31)
f32 = np.float32
ONLY = os.environ.get('ONLY')  # for checking levels: render one part alone (pad, drone, colour, bells, breath)
want = lambda part: ONLY is None or ONLY == part

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
PAD, DRONE, COLOUR, BELL, BREATH = 0.055, 0.14, 0.038, 0.4, 0.06  # part levels: drone -10 LU, colour -20, bells -9, breath -26 below the pad

# one cycle of a soft, band-limited "warm saw": 10 harmonics falling off as 1/n^1.9, even ones a little weaker
TAB = 4096
ph = np.arange(TAB) / TAB
wave = np.zeros(TAB)
for n in range(1, 11):
    wave += (0.75 if n % 2 == 0 else 1.0) * np.sin(2 * np.pi * n * ph) / n ** 1.9
wave = (wave / np.abs(wave).max()).astype(f32)

def osc(freq, n, phase0=0.0):
    p = (phase0 + np.arange(n, dtype=np.float64) * (freq / SR)) % 1.0
    i = p * TAB
    i0 = i.astype(np.int64); fr = (i - i0).astype(f32)
    return wave[i0 % TAB] * (1 - fr) + wave[(i0 + 1) % TAB] * fr

def env(n, att, rel):
    e = np.ones(n, dtype=f32)
    a = min(int(att * SR), n // 2); r = min(int(rel * SR), n // 2)
    if a: e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a, dtype=f32))
    if r: e[-r:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r, dtype=f32))
    return e

L = np.zeros(N, dtype=f32); Rr = np.zeros(N, dtype=f32)        # dry mix
sL = np.zeros(N, dtype=f32); sR = np.zeros(N, dtype=f32)       # reverb send

def add(sig, start, pan, gain, send):
    a = int(start * SR); b = min(a + len(sig), N)
    if b <= a: return
    s = sig[:b - a] * gain
    gl = np.cos((pan + 1) * np.pi / 4); gr = np.sin((pan + 1) * np.pi / 4)
    L[a:b] += s * gl; Rr[a:b] += s * gr
    sL[a:b] += s * gl * send; sR[a:b] += s * gr * send

# ---------------- harmony ----------------
# pitch classes (C = 0): D-flat major colours
CH = {
    'Dbmaj9': (1, [1, 5, 8, 0, 3]), 'Bbm9': (10, [10, 1, 5, 8, 0]), 'Gbmaj7#11': (6, [6, 10, 1, 5, 0]), 'Absus2': (8, [8, 10, 3, 5]),
    'Fm7': (5, [5, 8, 0, 3]), 'Gbmaj9': (6, [6, 10, 1, 5, 8]), 'Ebm9': (3, [3, 6, 10, 1, 5]), 'Absus4': (8, [8, 1, 3, 10]),
}
CYCLES = [['Dbmaj9', 'Bbm9', 'Gbmaj7#11', 'Absus2'], ['Dbmaj9', 'Fm7', 'Gbmaj9', 'Ebm9', 'Absus4']]
CHORD = 32.0  # s per chord
seq = []; t = 0.0; ci = 0
while t + len(CYCLES[ci % 2]) * CHORD <= DUR - 40: # whole cycles, each ending on the dominant
    for name in CYCLES[ci % 2]: seq.append((t, name)); t += CHORD
    ci += 1
k = int((DUR - 40 - t) // CHORD)
if k >= 2: # room for more: the end of the next cycle, so the piece still comes home from the dominant
    for name in CYCLES[ci % 2][-k:]: seq.append((t, name)); t += CHORD
seq.append((t, 'Dbmaj9'))  # the last chord holds to the end
LO, HI = 49, 70  # the pad's register: C#3 … A#4

def voice(prev, pcs, k=5):
    cands = [m for m in range(LO, HI + 1) if m % 12 in pcs]
    if prev is None: return sorted(rng.choice(cands, size=k, replace=False).tolist())
    out = []
    for m in prev: # each voice moves to the nearest chord tone not already taken
        best = min((c for c in cands if c not in out), key=lambda c: (abs(c - m), rng.random()))
        out.append(best)
    missing = [p for p in pcs if p not in [m % 12 for m in out]]
    if missing: # keep every chord tone: the voice that moves least to take a missing one does
        p = missing[0]; i = min(range(len(out)), key=lambda i: min(abs(c - out[i]) for c in cands if c % 12 == p))
        out[i] = min((c for c in cands if c % 12 == p), key=lambda c: abs(c - out[i]))
    return sorted(out)

prev = None
for i, (t0, name) in enumerate(seq):
    root, pcs = CH[name]
    t1 = seq[i + 1][0] if i + 1 < len(seq) else DUR
    last = i + 1 == len(seq)
    att, rel = 9.0, (24.0 if last else 12.0)
    dur = (t1 - t0) + (rel if not last else 0) + 1.0
    if last: dur = DUR - t0
    n = int(dur * SR)
    vo = voice(prev, pcs); prev = vo
    e = env(n, att, rel)
    for j, m in enumerate(vo if want('pad') else []):
        f = hz(m)
        for d, pan in ((-6, -0.55), (0, 0.0), (6, 0.55)): # three slightly detuned voices, spread across the stereo field
            fr = f * 2 ** (d / 1200)
            lfo = (1 + 0.18 * np.sin(2 * np.pi * rng.uniform(0.04, 0.11) * np.arange(n, dtype=f32) / SR + rng.uniform(0, 6.3))).astype(f32)
            s = osc(fr, n, rng.random()) * e * lfo
            add(s, t0, pan * 0.8, PAD * (0.8 if m > 64 else 1.0), 0.55)
    # the drone: the root an octave or two down, a plain sine with a touch of its octave
    dm = 36 + (root - 36) % 12
    tt = np.arange(n, dtype=np.float64) / SR
    s = (np.sin(2 * np.pi * hz(dm) * tt) + 0.25 * np.sin(2 * np.pi * hz(dm + 12) * tt + 1.1)).astype(f32) * env(n, 12.0, rel + 4)
    if want('drone'): add(s, t0, 0.0, DRONE, 0.12)
    # a high colour tone now and then: the ninth or the major seventh, very quiet, a long swell
    if rng.random() < 0.55 and not last:
        cm = 72 + [p for p in pcs if p in (0, 3)][0] if any(p in (0, 3) for p in pcs) else 72 + pcs[-1]
        sn = int(min(dur, 26) * SR); s = osc(hz(cm), sn) * env(sn, 10.0, 12.0)
        if want('colour'): add(s, t0 + rng.uniform(3, 8), rng.uniform(-0.5, 0.5), COLOUR, 0.7)

# ---------------- bells ----------------
PENTA = [1, 3, 5, 8, 10]
def chord_at(t):
    name = seq[0][1]
    for t0, nm in seq:
        if t0 <= t: name = nm
    return CH[name][1]
t = 22.0
while t < DUR - 30:
    pcs = chord_at(t)
    pool = [m for m in range(61, 81) if m % 12 in PENTA]
    w = np.array([3.0 if m % 12 in pcs else 1.0 for m in pool]); w /= w.sum()
    m = rng.choice(pool, p=w)
    vel = rng.uniform(0.25, 0.6) * (1 - 0.5 * max(0, (t - (DUR - 180)) / 180)) # fewer and softer towards the end
    n = int(7.0 * SR); tt = np.arange(n, dtype=np.float64) / SR; f = hz(m)
    s = np.zeros(n)
    for ratio, amp, dec in ((1.0, 1.0, 3.2), (2.0, 0.28, 1.6), (3.0, 0.08, 0.9), (4.07, 0.05, 0.6)):
        s += amp * np.exp(-tt / dec) * np.sin(2 * np.pi * f * ratio * tt + rng.uniform(0, 6.3))
    a = int(0.035 * SR); s[:a] *= np.linspace(0, 1, a) ** 2 # a soft mallet: no click
    if want('bells'): add(s.astype(f32), t, rng.uniform(-0.6, 0.6), BELL * vel, 0.7)
    if rng.random() < 0.18: # now and then an answering note, a fourth or fifth below
        m2 = m - (5 if rng.random() < 0.5 else 7); s2 = (np.exp(-tt / 3.0) * np.sin(2 * np.pi * hz(m2) * tt)).astype(f32); s2[:a] *= np.linspace(0, 1, a) ** 2
        if want('bells'): add(s2, t + rng.uniform(1.2, 2.2), rng.uniform(-0.6, 0.6), 0.7 * BELL * vel, 0.7)
    t += rng.uniform(4.5, 10.0)

# ---------------- breath: noise through a band-pass, swelling and fading slowly ----------------
wn = rng.standard_normal(N).astype(f32)
b, a_ = signal.butter(2, [180 / (SR / 2), 900 / (SR / 2)], btype='band')
br = signal.lfilter(b, a_, wn).astype(f32)
tt = np.arange(N, dtype=f32) / SR
br *= (0.55 + 0.45 * np.sin(2 * np.pi * tt / 47.0)) * (0.7 + 0.3 * np.sin(2 * np.pi * tt / 113.0 + 1.0))
br /= np.abs(br).max()
if want('breath'):
    add(br * env(N, 15.0, 30.0), 0.0, -0.1, BREATH, 0.3)
    add(np.roll(br, SR * 7) * env(N, 15.0, 30.0), 0.0, 0.1, BREATH, 0.3)
del wn, br

# ---------------- hall: a synthetic stereo impulse response, its high frequencies dying away first ----------------
irn = int(6.5 * SR); ti = np.arange(irn) / SR
def ir_ch(seed):
    r = np.random.default_rng(seed); x = r.standard_normal(irn)
    lo = signal.lfilter(*signal.butter(2, 1600 / (SR / 2)), x) * np.exp(-ti / 1.05)   # warm body, RT60 ≈ 7 s
    hi = signal.lfilter(*signal.butter(2, 5000 / (SR / 2)), x) * np.exp(-ti / 0.32)  # brighter early part
    ir = 0.8 * lo + 0.35 * hi
    ir[: int(0.025 * SR)] *= np.linspace(0, 1, int(0.025 * SR))  # pre-delay feel
    return (ir / np.sqrt((ir ** 2).sum())).astype(f32)
wl = signal.oaconvolve(sL, ir_ch(1))[:N].astype(f32); wr = signal.oaconvolve(sR, ir_ch(2))[:N].astype(f32)
del sL, sR
L += 0.9 * wl; Rr += 0.9 * wr
del wl, wr

# ---------------- master: rumble and hiss out, fades ----------------
hp = signal.butter(2, 30 / (SR / 2), btype='high'); lp = signal.butter(2, 7000 / (SR / 2))
for ch in (L, Rr):
    ch[:] = signal.lfilter(*lp, signal.lfilter(*hp, ch)).astype(f32)
fade = env(N, 6.0, 25.0); L *= fade; Rr *= fade
if ONLY is None:  # a part rendered alone keeps its raw level, to compare the parts
    peak = max(np.abs(L).max(), np.abs(Rr).max()); L /= peak / 0.7; Rr /= peak / 0.7
from scipy.io import wavfile
wavfile.write(OUT, SR, np.stack([L, Rr], axis=1).astype(f32))
print('wrote', OUT, f'{DUR:.0f} s', 'chords', len(seq))
