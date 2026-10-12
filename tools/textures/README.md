# Planet maps

`build.py` makes the Earth, Moon and Mars maps in `assets/` from the sources below. Download them by hand (the sites need a browser), put them in one folder under their original names, and run:

```bash
python3 tools/textures/build.py ~/Downloads/planet-sources
```

It needs Python 3 with Pillow and NumPy, and about 6 GB of memory for the 21600 px sources.

| Source file | From | Becomes |
|---|---|---|
| `world.200404.3x21600x10800.jpg` | NASA Earth Observatory, [Blue Marble: Next Generation, base map](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/), April 2004 | `earth_day.jpg` (4096 px), `earth_day_8k.jpg` |
| `gebco_08_rev_elev_21600x10800.jpg`, `gebco_08_rev_bath_21600x10800.jpg` | NASA Earth Observatory, [Blue Marble: Next Generation topography and bathymetry](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/) (GEBCO_08) | `earth_aux.jpg`: R the sea, G and B the slopes |
| `BlackMarble_2016_3km.jpg` | NASA Earth Observatory, [Black Marble 2016](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg) (Suomi NPP VIIRS) | `earth_night.jpg`, `earth_night_8k.jpg` (grey) |
| `8k_earth_clouds.jpg` | [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) | `earth_clouds.jpg`, `earth_clouds_8k.jpg` (grey) |
| `lroc_color_poles_8k.tif`, `ldem_16_uint.tif` | NASA Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (LRO LROC and LOLA) | `moon.jpg` (1024 px), `moon_4k.jpg`, `moon_8k.jpg`, `moon_aux.jpg` |
| `8k_mars.jpg` | [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) | `mars.jpg` (1024 px), `mars_4k.jpg`, `mars_8k.jpg` |
| `megt90n000eb.img` | NASA PDS Geosciences Node, [MGS MOLA MEGDR, 16 pixels per degree](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/) | `mars_aux.jpg` |

What the script does to them:

- **Relief (`*_aux.jpg`).** It takes the slopes of the height map, east and north, in kilometres per kilometre, averages them to 4096 × 2048 and stores them as 128 + slope × K in G and B (K = 1000 for Earth, 400 for the Moon and Mars). The app tilts the surface normal by them, so the terrain is lit by the real Sun angle. It fades the relief out close to the ground, where a map texel would show as a facet.
- **Earth's sea (R of `earth_aux.jpg`).** The ocean of the GEBCO bathymetry, plus the lakes, which the Blue Marble paints one flat colour.
- **Night lights.** The Black Marble shows the land faintly lit in blue (its R is about half its B). The script keeps only the warm and white light above that: ((R + G) / 2 − 0.62 B) / 0.38.
- **Mars.** The Solar System Scope colours, 15 % less saturated and a little more tan.

The app loads the 4096 px Earth maps at the start, and the 1024 px Moon and Mars maps. It loads the 4096 px Moon and Mars maps and their relief when the camera heads for them. On a desktop GPU it loads the 8192 px maps while the camera is within 25 radii of the body, and releases them beyond 60. `?tex=4k` or `?tex=8k` in the page address forces the choice.
