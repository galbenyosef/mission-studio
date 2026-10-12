#!/usr/bin/env python3
"""Each Shuttle flight's orbiter in its own markings, painted on the Smithsonian scan of Discovery.

The scan (assets/orbiter.glb) wears Discovery's last markings (1998-2011). For each livery below this script repaints its
colour map: it renders the scan from the sides, the top and the bottom (livery.js, in a headless browser), takes out the
markings that do not belong in the views (the letters are filled from around them, larger marks with clean paint from
nearby), letters and draws the ones that do, and bakes the views back into the map (livery.js again). Texels that no
repaint touches keep their colours exactly. The maps go to assets/orbiter-<livery>.webp.

    python3 tools/livery/paint.py                 # every livery
    python3 tools/livery/paint.py columbia-1981   # one

Needs Python 3 with numpy, scipy, OpenCV and Pillow, Node with Playwright (see tools/video/README.md), and a Helvetica
cut: TeX Gyre Heros Bold, or Helvetica on a Mac (HELVETICA=<file> chooses another). Its work files, the views and the
fitted lettering among them, go to tools/livery/work/ (delete it to start over).
"""
import io, json, os, struct, subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..')); WORK = os.path.join(HERE, 'work')
PX = 100  # view pixels per metre
FONTS = [os.environ.get('HELVETICA', ''), '/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyreheros-bold.otf',
         '/usr/share/fonts/opentype/tex-gyre/texgyreheros-bold.otf', '/Library/Fonts/texgyreheros-bold.otf', '/System/Library/Fonts/Helvetica.ttc']
FONT = next((f for f in FONTS if f and os.path.exists(f)), None)
def bold_face(path):  # in a font collection (Helvetica.ttc), the upright bold face
    for i in range(16):
        try: style = ImageFont.truetype(path, 20, index=i).getname()[1]
        except OSError: break
        if style.lower() == 'bold': return i
    return 0
FONT_INDEX = bold_face(FONT) if FONT and FONT.endswith('.ttc') else 0

def node(*args): subprocess.run(['node', os.path.join(HERE, 'livery.js'), *args], check=True)

# ---- the scan's colour map and the views ---------------------------------------------------------------------------
def glb_base_color(path):
    """the base colour image of the scan's material 'default', as bytes"""
    b = open(path, 'rb').read(); off, ch = 12, {}
    while off < len(b): n, t = struct.unpack('<I4s', b[off:off + 8]); ch[t] = b[off + 8:off + 8 + n]; off += 8 + n
    js = json.loads(ch[b'JSON']); mat = next(m for m in js['materials'] if m.get('name') == 'default')
    tex = js['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]
    src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    bv = js['bufferViews'][js['images'][src]['bufferView']]; o = bv.get('byteOffset', 0)
    return ch[b'BIN\x00'][o:o + bv['byteLength']]

class View:
    def __init__(self, name):
        self.name = name; self.meta = json.load(open(os.path.join(WORK, 'views', name + '.json')))
        im = np.array(Image.open(os.path.join(WORK, 'views', name + '.png')).convert('RGBA'))
        self.orig = im[..., :3].astype(np.float32); self.surf = im[..., 3] > 0; self.h, self.w = self.surf.shape
        self.right = np.array(self.meta['right']); self.up = np.array(self.meta['up'])
    def px(self, p):  # model point (m) → view pixel (x, y)
        p = np.asarray(p, float); return ((p @ self.right - self.meta['r0']) * PX, self.h - (p @ self.up - self.meta['u0']) * PX)
    def box(self, p0, p1, pad=0):  # pixel box around two model corners
        (xa, ya), (xb, yb) = self.px(p0), self.px(p1)
        return (int(np.floor(min(xa, xb))) - pad, int(np.floor(min(ya, yb))) - pad, int(np.ceil(max(xa, xb))) + pad, int(np.ceil(max(ya, yb))) + pad)
    def dpx(self, d):  # model displacement → pixel displacement
        d = np.asarray(d, float); return (int(round(d @ self.right * PX)), int(round(-(d @ self.up) * PX)))

def lum(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def dilate(m, r): return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) > 0

# ---- lettering ----------------------------------------------------------------------------------------------------
SS = 4  # supersampling
def font(cap_px):
    f = ImageFont.truetype(FONT, 400, index=FONT_INDEX); b = f.getbbox('H'); k = cap_px * SS / (b[3] - b[1])
    return ImageFont.truetype(FONT, max(8, int(round(400 * k))), index=FONT_INDEX)
def text_width(text, cap_px, track=0.0):
    f = font(cap_px); return (sum(f.getlength(c) for c in text) + track * cap_px * SS * (len(text) - 1)) / SS
def text_image(text, cap_px, track=0.0):
    """supersampled coverage of a line of text; returns it with its origin (left end of the baseline) in its pixels"""
    f = font(cap_px); asc, desc = f.getmetrics(); widths = [f.getlength(c) for c in text]
    W = int(sum(widths) + track * cap_px * SS * (len(text) - 1)) + 4 * SS; im = Image.new('L', (W, asc + desc + 4 * SS), 0); d = ImageDraw.Draw(im); x = 2 * SS
    for c, w in zip(text, widths): d.text((x, 2 * SS), c, font=f, fill=255); x += w + track * cap_px * SS
    return np.array(im, np.float32) / 255, (2 * SS, 2 * SS + asc)
def place(view, cov_ss, origin_ss, at, shear=0.0, rot=0.0):
    """warp a supersampled coverage so its origin lands on pixel `at`, slanted (shear: top leans right) and turned (rot,
    radians, counter-clockwise); returns (coverage, x0, y0) for the pixels it covers"""
    c, s = np.cos(rot), np.sin(rot); ox, oy = origin_ss
    # text coordinates (x right, y up, from the origin) → sheared → turned → view pixels (y down)
    A = np.array([[c, -(c * shear - s)], [-s, (s * shear + c)]]) / SS  # applied to (xi, yi) of the supersampled image
    h, w = cov_ss.shape; corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], float) - [ox, oy]
    pts = corners @ A.T + at; x0, y0 = np.floor(pts.min(0)).astype(int) - 2; x1, y1 = np.ceil(pts.max(0)).astype(int) + 2
    # warp at SS× into the local box, then average down
    M = np.zeros((2, 3)); M[:, :2] = A * SS; M[:, 2] = (np.asarray(at, float) - [x0, y0]) * SS - (A * SS) @ np.array([ox, oy])
    big = cv2.warpAffine(cov_ss, M, ((x1 - x0) * SS, (y1 - y0) * SS), flags=cv2.INTER_LINEAR)
    small = big.reshape(y1 - y0, SS, x1 - x0, SS).mean(axis=(1, 3))
    return small, x0, y0

# ---- one livery's views as they are repainted -----------------------------------------------------------------------
class Paint:
    def __init__(self, views):
        self.V = views; self.rgb = {n: v.orig.copy() for n, v in views.items()}; self.a = {n: np.zeros((v.h, v.w), np.float32) for n, v in views.items()}
    def _crop(self, n, b, pad):
        v = self.V[n]; x0, y0, x1, y1 = max(0, b[0] - pad), max(0, b[1] - pad), min(v.w, b[2] + pad), min(v.h, b[3] + pad); return x0, y0, x1, y1
    def erase_letters(self, n, p0, p1, thr=110, grow=3, radius=7):
        """take out dark lettering between two model corners: the letters are filled in from around them"""
        v = self.V[n]; b = v.box(p0, p1); x0, y0, x1, y1 = self._crop(n, b, 40)
        img = self.rgb[n][y0:y1, x0:x1]; m = np.zeros(img.shape[:2], bool)
        sub = lum(img[b[1] - y0:b[3] - y0, b[0] - x0:b[2] - x0]) < thr; m[b[1] - y0:b[3] - y0, b[0] - x0:b[2] - x0] = sub
        m = dilate(m, grow) & v.surf[y0:y1, x0:x1]
        out = cv2.inpaint(img.clip(0, 255).astype(np.uint8), m.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA).astype(np.float32)
        img[m] = out[m]; self.a[n][y0:y1, x0:x1][m] = 1
    def fill(self, n, mask, radius=9):
        """take out everything under a mask (view pixels), filled in from around it"""
        v = self.V[n]; mask = dilate(mask, 3) & v.surf; ys, xs = np.nonzero(mask)
        x0, y0, x1, y1 = self._crop(n, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), 40); img = self.rgb[n][y0:y1, x0:x1]; m = mask[y0:y1, x0:x1]
        out = cv2.inpaint(img.clip(0, 255).astype(np.uint8), m.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA).astype(np.float32)
        img[m] = out[m]; self.a[n][y0:y1, x0:x1][m] = 1
    def erase_area(self, n, mask, src):
        """take out everything under a mask (view pixels): clean paint from `src` metres away, blended in over the gradient
        (its colour at the edge of the mask becomes the colour around it)"""
        v = self.V[n]; dx, dy = v.dpx(src); mask = dilate(mask, 3) & v.surf; ys, xs = np.nonzero(mask)
        x0, y0, x1, y1 = xs.min() - 12, ys.min() - 12, xs.max() + 13, ys.max() + 13
        img = self.rgb[n]; dst = img[y0:y1, x0:x1].clip(0, 255).astype(np.uint8); srcp = img[y0 + dy:y1 + dy, x0 + dx:x1 + dx].clip(0, 255).astype(np.uint8)
        mk = mask[y0:y1, x0:x1].astype(np.uint8) * 255; yy, xx = np.nonzero(mk); w, h = xx.max() + 1 - xx.min(), yy.max() + 1 - yy.min()
        out = cv2.seamlessClone(srcp, dst, mk, (int(xx.min() + w // 2), int(yy.min() + h // 2)), cv2.NORMAL_CLONE).astype(np.float32)
        m = mask[y0:y1, x0:x1]; img[y0:y1, x0:x1][m] = out[m]; self.a[n][y0:y1, x0:x1][m] = 1
    def disc(self, n, centre, r, extra_red=True):
        """a disc of radius r (m) about a model point, with any red beyond it nearby (the meatball's vector)"""
        v = self.V[n]; cx, cy = v.px(centre); R = r * PX; yy, xx = np.mgrid[0:v.h, 0:v.w]
        m = (xx - cx) ** 2 + (yy - cy) ** 2 < R * R
        if extra_red:
            near = (xx - cx) ** 2 + (yy - cy) ** 2 < (2.0 * R) ** 2; o = v.orig
            m |= dilate(near & (o[..., 0] > o[..., 2] + 18) & (o[..., 0] > o[..., 1] + 12), 5)
        return m & v.surf
    def rect(self, n, p0, p1, pad=3):
        v = self.V[n]; x0, y0, x1, y1 = v.box(p0, p1, pad); m = np.zeros((v.h, v.w), bool); m[y0:y1, x0:x1] = True; return m & v.surf
    def ink(self, n, cov, x0, y0, colour, blur=0.7):
        """lay paint of a colour over a coverage (view pixels at x0, y0)"""
        if blur: cov = cv2.GaussianBlur(cov, (0, 0), blur)
        h, w = cov.shape; v = self.V[n]; sl = (slice(y0, y0 + h), slice(x0, x0 + w)); c = (cov * v.surf[sl])[..., None]
        self.rgb[n][sl] = self.rgb[n][sl] * (1 - c) + np.asarray(colour, np.float32) * c
        self.a[n][sl] = np.maximum(self.a[n][sl], dilate(c[..., 0] > 0.004, 2).astype(np.float32))
    def text(self, n, s, cap, at, colour, align='left', shear=0.0, rot=0.0, track=0.0):
        """a line of lettering, cap height in metres, its baseline's left end (align='left'), middle or right end at a model point"""
        v = self.V[n]; cap_px = cap * PX; cov, org = text_image(s, cap_px, track); w = text_width(s, cap_px, track)
        k = {'left': 0, 'center': 0.5, 'right': 1}[align] * w; px = np.array(v.px(at)) - k * np.array([np.cos(rot), -np.sin(rot)])
        cov2, x0, y0 = place(v, cov, org, px, shear, rot); self.ink(n, cov2, x0, y0, colour)
    def stamp(self, n, mask_png, height, at, colour, align='center'):
        """a drawn mark (alpha mask, e.g. the NASA logotype) of a height in metres, its bottom middle at a model point"""
        v = self.V[n]; m = np.array(Image.open(mask_png).convert('RGBA'))[..., 3].astype(np.float32) / 255
        ys, xs = np.nonzero(m > 0.02); m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        hpx = height * PX; wpx = m.shape[1] * hpx / m.shape[0]
        big = cv2.resize(m, (int(round(wpx * SS)), int(round(hpx * SS))), interpolation=cv2.INTER_AREA)
        k = {'left': 0, 'center': 0.5, 'right': 1}[align] * big.shape[1]
        cov, x0, y0 = place(v, big, (k, big.shape[0]), v.px(at)); self.ink(n, cov, x0, y0, colour)
    def copy(self, n, src_n, p0, p1, q0, q1):
        """copy the picture between model corners p0, p1 of view src_n onto the box q0, q1 of view n, scaled to fit"""
        s, d = self.V[src_n], self.V[n]; a = s.box(p0, p1); b = d.box(q0, q1)
        patch = cv2.resize(s.orig[a[1]:a[3], a[0]:a[2]], (b[2] - b[0], b[3] - b[1]), interpolation=cv2.INTER_AREA)
        sl = (slice(b[1], b[3]), slice(b[0], b[2])); keep = d.surf[sl][..., None]
        self.rgb[n][sl] = np.where(keep, patch, self.rgb[n][sl]); self.a[n][sl] = np.maximum(self.a[n][sl], keep[..., 0])
    def save(self, key):
        d = os.path.join(WORK, key); os.makedirs(d, exist_ok=True); edits = []
        for n in self.V:
            if self.a[n].max() <= 0: continue
            out = np.dstack([self.rgb[n].clip(0, 255), self.a[n].clip(0, 1) * 255]).round().astype(np.uint8)
            Image.fromarray(out, 'RGBA').save(os.path.join(d, n + '.png')); edits.append({'view': n, 'pxPerM': PX, 'file': n + '.png'})
        json.dump(edits, open(os.path.join(d, 'edits.json'), 'w'))
        return d

# ---- where the scan's markings are, and how its names are lettered -----------------------------------------------
def fit_name(view, p0, p1, text):
    """size, slant, turn and place of the scan's lettering of `text` between two model corners: the font's letters laid
    over the dark pixels there, the best match over the whole box"""
    b = view.box(p0, p1, 24); img = view.orig[b[1]:b[3], b[0]:b[2]]
    dark = np.clip((150 - img.max(axis=2)) / 110, 0, 1).astype(np.float32)  # black paint (not the flag's red or blue)
    inner = view.box(p0, p1); xs = np.nonzero((dark[inner[1] - b[1]:inner[3] - b[1], inner[0] - b[0]:inner[2] - b[0]] > 0.5).any(0))[0]; ink_w = xs.max() - xs.min()
    cap0 = ink_w / text_width(text, 10.0) * 10.0  # the cap height that gives the ink's width
    def score(cap, shear, rot):
        cov0, org = text_image(text, cap); cov, x0, y0 = place(view, cov0, org, (0, 0), shear, rot)
        if cov.shape[0] >= dark.shape[0] or cov.shape[1] >= dark.shape[1]: return -1, None
        r = cv2.matchTemplate(dark, cov, cv2.TM_CCORR_NORMED); _, _, _, loc = cv2.minMaxLoc(r)
        full = np.zeros_like(dark); full[loc[1]:loc[1] + cov.shape[0], loc[0]:loc[0] + cov.shape[1]] = cov
        return float(np.corrcoef(full.ravel(), dark.ravel())[0, 1]), (b[0] + loc[0] - x0, b[1] + loc[1] - y0)
    best = (-2,)
    for cap in cap0 * np.arange(0.92, 1.081, 0.02):
        for shear in np.arange(-0.3, 0.31, 0.03):
            for rot in np.radians(np.arange(-3, 3.1, 0.5)):
                sc, at = score(cap, shear, rot)
                if sc > best[0]: best = (sc, cap, shear, rot, at)
    _, cap1, sh1, ro1, _ = best
    for cap in cap1 * np.arange(0.985, 1.016, 0.005):
        for sh in np.arange(sh1 - 0.03, sh1 + 0.031, 0.006):
            for ro in np.radians(np.degrees(ro1) + np.arange(-0.5, 0.51, 0.1)):
                sc, at = score(cap, sh, ro)
                if sc > best[0]: best = (sc, cap, sh, ro, at)
    sc, cap, shear, rot, at = best
    return {'score': sc, 'cap': cap / PX, 'shear': float(shear), 'rot': float(rot), 'at_px': [float(at[0]), float(at[1])], 'width_px': text_width(text, cap)}
def name_slot(view, fit, align='center'):
    """the model point on the fitted baseline at its left end, middle or right end (for a name of another length)"""
    k = {'left': 0, 'center': 0.5, 'right': 1}[align] * fit['width_px']; r = fit['rot']
    x, y = fit['at_px'][0] + k * np.cos(r), fit['at_px'][1] - k * np.sin(r)
    # back to model space: the point on the view's plane through the origin (the depth does not matter in an orthographic view)
    a = view.meta['r0'] + x / PX; b = view.meta['u0'] + (view.h - y) / PX
    return a * view.right + b * view.up

def main(keys):
    if FONT is None: sys.exit('No Helvetica cut found (TeX Gyre Heros Bold or Helvetica); set HELVETICA=<font file>.')
    os.makedirs(WORK, exist_ok=True)
    atlas_file = os.path.join(WORK, 'atlas.png')
    if not os.path.exists(atlas_file): Image.open(io.BytesIO(glb_base_color(os.path.join(ROOT, 'assets', 'orbiter.glb')))).convert('RGB').save(atlas_file)
    if not os.path.exists(os.path.join(WORK, 'views', 'bottom.json')): node('views')
    worm = os.path.join(WORK, 'worm.png')
    if not os.path.exists(worm): node('worm', '800', worm)
    V = {n: View(n) for n in ['left', 'right', 'top', 'bottom']}
    L, Rt, T, B = V['left'], V['right'], V['top'], V['bottom']
    # the scan's colours: its black lettering, its white paint
    us = L.orig[slice(*L.box((0, 11.6, -1.45), (0, 6.15, -0.65))[1::2]), slice(*L.box((0, 11.6, -1.45), (0, 6.15, -0.65))[0::2])]
    BLACK = np.median(us[lum(us) < 45], axis=0)
    wing = T.orig[slice(*T.box((3.9, 7.3, 0), (6.2, 8.6, 0))[1::2]), slice(*T.box((3.9, 7.3, 0), (6.2, 8.6, 0))[0::2])]
    WHITE = np.median(wing.reshape(-1, 3), axis=0)
    GREY = BLACK + 0.42 * (WHITE - BLACK)  # the logotype's grey (on Enterprise and Columbia's doors, on the wings to 1998)
    chin = L.orig[slice(*L.box((0, 30, -1.6), (0, 27.5, -0.6))[1::2]), slice(*L.box((0, 30, -1.6), (0, 27.5, -0.6))[0::2])].reshape(-1, 3)
    TILE = np.median(chin[lum(chin) < 90], axis=0)  # black tiles: the chin below the cockpit windows
    fits_file = os.path.join(WORK, 'fits.json')
    if os.path.exists(fits_file): F = json.load(open(fits_file))
    else:
        F = {'fwdL': fit_name(L, (0, 26.45, 0.17), (0, 24.35, 0.74), 'Discovery'), 'fwdR': fit_name(Rt, (0, 24.38, 0.19), (0, 26.45, 0.76), 'Discovery'),
             'wing': fit_name(T, (3.9, 5.3, 0), (7.7, 4.48, 0), 'Discovery')}
        json.dump(F, open(fits_file, 'w'), indent=1)
    print('scan lettering:', ', '.join(f"{k} cap {f['cap']:.3f} m slant {f['shear']:+.2f} turn {np.degrees(f['rot']):+.1f}° (match {f['score']:.2f})" for k, f in F.items()))
    print('black', BLACK.round(), 'white', WHITE.round(), 'grey', GREY.round(), 'tiles', TILE.round())

    # ---- the marks to take out --------------------------------------------------------------------------------------
    def no_fwd_names(P): P.erase_letters('left', (0, 26.45, 0.17), (0, 24.35, 0.74)); P.erase_letters('right', (0, 24.38, 0.19), (0, 26.45, 0.76))
    def no_wing_name(P): P.erase_letters('top', (3.9, 5.3, 0), (7.7, 4.48, 0))
    def no_wing_flag(P): P.erase_area('top', P.rect('top', (3.9, 6.68, 0), (6.1, 5.48, 0), 4), (0, 2.6, 0))
    def no_wing_meatball(P): P.erase_area('top', P.disc('top', (-5.73, 5.685, 0), 1.15), (0, 2.6, 0))
    def no_aft_meatballs(P):
        for n, c in [('left', (0, 5.219, -1.037)), ('right', (0, 5.165, -1.062))]:
            P.fill(n, P.disc(n, c, 0.40))  # (small: filled in from around it)
    # ---- and to letter in --------------------------------------------------------------------------------------------
    def name_fwd(P, s):
        for n, k in [('left', 'fwdL'), ('right', 'fwdR')]:
            f = F[k]; P.text(n, s, f['cap'], name_slot(V[n], f, 'center'), BLACK, 'center', f['shear'], f['rot'])
    def door_marks(P, name, worm_colour, cap=0.6, base_z=0.66):
        # the doors' forward end is at Y 23.9, their aft end at Y 5.6; the hinge line at Z 0.6 (the letters stand on the doors)
        if name:
            P.text('left', name, cap, (0, 23.35, base_z), BLACK, 'left'); P.text('right', name, cap, (0, 23.35, base_z), BLACK, 'right')
        h = cap; P.stamp('left', worm, h, (0, 6.15, base_z), worm_colour, 'right'); P.stamp('right', worm, h, (0, 6.15, base_z), worm_colour, 'left')
    def wing_flag(P, c, w=2.15):
        h = w * 1.15 / 2.15  # the scan's flag on the right wing, X 3.925–6.075, Y 5.505–6.655
        P.copy('top', 'top', (3.925, 6.655, 0), (6.075, 5.505, 0), (c[0] - w / 2, c[1] + h / 2, 0), (c[0] + w / 2, c[1] - h / 2, 0))
    def chines(P):
        """Columbia's black chines: the tops of the wing gloves, from the cockpit back along the leading edge"""
        v = T; yy, xx = np.mgrid[0:v.h, 0:v.w]; X = v.meta['r0'] + xx / PX; Y = v.meta['u0'] + (v.h - yy) / PX; ax = np.abs(X)
        eR, eL = np.full(v.h, -1.0), np.full(v.h, -1.0)  # the leading edges (the silhouette) on each row
        for r in range(v.h):
            xs = np.nonzero(v.surf[r])[0]
            if len(xs): eR[r] = v.meta['r0'] + xs.max() / PX; eL[r] = -(v.meta['r0'] + xs.min() / PX)
        E = np.where(X > 0, eR[yy], eL[yy]); m = v.surf & (ax > 2.80) & (ax < E - 0.09) & (Y < 25.0) & (Y > 16.9 - (ax - 2.80) * 1.55)
        # the fill: the belly's tiles 2.95 m further in, seen from below (the bottom view's right is −X)
        bx = np.sign(X) * (ax - 2.95); Bx = (-bx - B.meta['r0']) * PX; By = B.h - (Y - B.meta['u0']) * PX
        src_px = cv2.remap(B.orig, Bx.astype(np.float32), By.astype(np.float32), cv2.INTER_LINEAR)
        src_px *= TILE / src_px[m].mean(axis=0)  # as dark as the black tiles on the scan's sides (the belly is weathered lighter)
        P.rgb['top'][m] = src_px[m]; P.a['top'][m] = 1
        soft = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0); edgeband = (soft > 0.02) & ~m
        P.rgb['top'][edgeband] = P.rgb['top'][edgeband] * (1 - soft[edgeband, None]) + src_px[edgeband] * soft[edgeband, None]; P.a['top'][edgeband] = 1

    LIVERIES = {
        # Columbia as on STS-1 (1981): Enterprise's markings. US flag on the left wing, "USA" on the right (larger and more
        # widely spaced than Enterprise's), the name on the payload bay doors above the hinge behind the crew module, the
        # NASA logotype in grey at the doors' aft end, "United States" and a flag on the aft fuselage; the black chines.
        'columbia-1981': lambda P: (no_fwd_names(P), no_wing_name(P), no_wing_flag(P), no_wing_meatball(P), no_aft_meatballs(P),
                                    wing_flag(P, (-5.73, 5.75), 2.4),
                                    P.text('top', 'USA', 1.05, (5.79, 5.2, 0), BLACK, 'center', track=0.42),
                                    door_marks(P, 'Columbia', GREY), chines(P)),
        # Discovery as on STS-31 (1990), the scheme Challenger set in 1983: "USA" above the flag on the left wing, the grey
        # logotype centred above the name on the right wing, the name behind the cockpit windows, the logotype in black at
        # the aft end of the payload bay doors, "United States" and a flag on the aft fuselage. No NASA insignia.
        'discovery-1990': lambda P: (no_wing_flag(P), no_wing_meatball(P), no_aft_meatballs(P),
                                     wing_flag(P, (-5.73, 5.12)),
                                     P.text('top', 'USA', 0.66, (-5.73, 6.05, 0), BLACK, 'center', track=0.06),
                                     P.stamp('top', worm, 0.62, (5.79, 5.6, 0), GREY, 'center'),
                                     door_marks(P, None, BLACK)),
        # Atlantis as on STS-135 (2011): the scan's own scheme (1998 on), with Atlantis's name.
        'atlantis-2011': lambda P: (no_fwd_names(P), no_wing_name(P), name_fwd(P, 'Atlantis'),
                                    P.text('top', 'Atlantis', F['wing']['cap'], name_slot(T, F['wing'], 'left'), BLACK, 'left', F['wing']['shear'], F['wing']['rot'])),
    }
    atlas = np.array(Image.open(atlas_file).convert('RGB'))
    for key in keys or LIVERIES:
        P = Paint(V); LIVERIES[key](P); d = P.save(key)
        node('bake', d)
        baked = np.array(Image.open(os.path.join(d, 'baked.png')).convert('RGBA')); cov = baked[..., 3] > 0
        out = atlas.copy(); out[cov] = baked[..., :3][cov]
        changed = cov & (np.abs(out.astype(int) - atlas).sum(-1) > 0)
        # the texels around a repainted island that no triangle covers (they blend into it when the map is filtered) take
        # the colour of the nearest covered texel
        near = dilate(changed, 6) & ~cov; _, (iy, ix) = ndimage.distance_transform_edt(~cov, return_indices=True)
        out[near] = out[iy[near], ix[near]]
        Image.fromarray(out).save(os.path.join(d, 'atlas.png'))
        dst = os.path.join(ROOT, 'assets', f'orbiter-{key}.webp'); Image.fromarray(out).save(dst, 'WEBP', quality=90, method=6)
        print(f'{key}: {int(changed.sum())} texels repainted → {os.path.relpath(dst, ROOT)} ({os.path.getsize(dst) // 1024} KB)')

if __name__ == '__main__': main(sys.argv[1:])
