#!/usr/bin/env python3
"""Builds the planet maps in assets/ from public sources (see README.md for where each comes from).

    python3 tools/textures/build.py <downloads> [assets]

<downloads> holds the source files under their original names; assets defaults to the repository's assets/. Needs
Pillow and NumPy. The 21600 px sources need ~6 GB of memory.
"""
import os, sys
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'assets')
src = lambda n: os.path.join(SRC, n)
out = lambda n: os.path.join(OUT, n)


def slopes(h, R):
    """Slopes east and north (km per km) of a height map h (km; rows north to south, columns eastward over 360°)."""
    H, W = h.shape
    lat = (90 - (np.arange(H) + 0.5) * 180 / H) * np.pi / 180
    dx = 2 * np.pi * R * np.cos(lat)[:, None] / W
    se = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * np.maximum(dx, 1e-3))
    hn = np.vstack([h[:1], h, h[-1:]])
    sn = (hn[:-2] - hn[2:]) / (2 * np.pi * R / H)
    return se, sn


def save_aux(name, r, se, sn, K, q):
    """An aux map: R as given (Earth's sea) or 0, G and B the slopes east and north as 128 + slope·K, 4096 × 2048."""
    size = (4096, 2048)
    avg = lambda a: np.asarray(Image.fromarray(a.astype(np.float32), mode='F').resize(size, Image.BOX))
    enc = lambda a: Image.fromarray(np.clip(np.round(128 + avg(a) * K), 1, 255).astype(np.uint8))
    R = r.resize(size, Image.BOX) if r is not None else Image.new('L', size, 0)
    Image.merge('RGB', (R, enc(se), enc(sn))).save(out(name), quality=q, subsampling=0, optimize=True)


def colour(name, im, q8=88, q4=90, small=None):
    """A colour map at 8192, 4096 and (small) 1024 px."""
    im.resize((8192, 4096), Image.LANCZOS).save(out(name + '_8k.jpg'), quality=q8, optimize=True)
    im.resize((4096, 2048), Image.LANCZOS).save(out(small and name + '_4k.jpg' or name + '.jpg'), quality=q4, optimize=True)
    if small: im.resize((1024, 512), Image.LANCZOS).save(out(name + '.jpg'), quality=90, optimize=True)


# ---- Earth
day = Image.open(src('world.200404.3x21600x10800.jpg')).convert('RGB')
colour('earth_day', day)
d = np.asarray(day).astype(np.int16)  # the Blue Marble paints water one flat colour: lakes
navy = (np.abs(d[..., 0] - 2) <= 6) & (np.abs(d[..., 1] - 5) <= 7) & (np.abs(d[..., 2] - 20) <= 10)
del d, day
bath = np.asarray(Image.open(src('gebco_08_rev_bath_21600x10800.jpg')).convert('L'))  # land is white
sea = Image.fromarray((((bath < 250) | navy) * 255).astype(np.uint8))
del bath, navy
# GEBCO elevation: one grey level per 25 m (saturating at 6.4 km); averaged to 8K before taking slopes
elev = np.asarray(Image.open(src('gebco_08_rev_elev_21600x10800.jpg')).convert('L').resize((8192, 4096), Image.BOX)).astype(np.float32) * 0.025
se, sn = slopes(elev, 6378.137)
save_aux('earth_aux.jpg', sea, se, sn, 1000, 85)
del elev, se, sn, sea
clouds = Image.open(src('8k_earth_clouds.jpg')).convert('L')
clouds.save(out('earth_clouds_8k.jpg'), quality=80, optimize=True)
clouds.resize((4096, 2048), Image.LANCZOS).save(out('earth_clouds.jpg'), quality=78, optimize=True)
# towns' lights: the Black Marble without its moonlit-land backdrop (bluish, R ≈ 0.5 B); lights are warm or white
n = np.asarray(Image.open(src('BlackMarble_2016_3km.jpg')).convert('RGB')).astype(np.float32)
lights = Image.fromarray(np.clip(((n[..., 0] + n[..., 1]) / 2 - 0.62 * n[..., 2]) / 0.38, 0, 255).astype(np.uint8))
del n
lights.resize((4096, 2048), Image.BOX).save(out('earth_night.jpg'), quality=90, optimize=True)
lights.resize((8192, 4096), Image.LANCZOS).save(out('earth_night_8k.jpg'), quality=90, optimize=True)

# ---- Moon: LRO colour; LOLA heights, v / 2000 − 10 km
colour('moon', Image.open(src('lroc_color_poles_8k.tif')).convert('RGB'), small=True)
h = np.asarray(Image.open(src('ldem_16_uint.tif'))).astype(np.float32) / 2000 - 10
se, sn = slopes(h, 1737.4)
save_aux('moon_aux.jpg', None, se, sn, 400, 80)
del h, se, sn

# ---- Mars: Solar System Scope colour, 15 % less saturated and a touch more tan; MOLA heights (int16 m, big-endian)
a = np.asarray(Image.open(src('8k_mars.jpg')).convert('RGB')).astype(np.float32) / 255
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
lum = (lin * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
lin = (lum + (lin - lum) * 0.85) * [1.0, 1.0, 0.96]
a = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, 1) ** (1 / 2.4) - 0.055)
colour('mars', Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)), small=True)
m = np.fromfile(src('megt90n000eb.img'), dtype='>i2').reshape(2880, 5760).astype(np.float32) / 1000
se, sn = slopes(m, 3389.5)
save_aux('mars_aux.jpg', None, se, sn, 400, 85)
print('done')
