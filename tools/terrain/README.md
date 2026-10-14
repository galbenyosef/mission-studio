# The ground round the sites

`fetch.mjs` makes `assets/terrain_<id>.json` for each American launch and landing site, from U.S. government open data (all public domain). `app/43_terrain.js` draws it: the relief, the sea and lagoons, rivers, lakes and marsh, streams, and roads, coloured by land cover. The buildings are not in any public-domain dataset and are drawn by hand in the app from published dimensions.

```bash
cd tools/terrain && npm install && cd ../..
node tools/terrain/fetch.mjs              # all five sites, a few minutes
node tools/terrain/fetch.mjs ksc          # one
```

| Site | Square | Centre |
|---|---|---|
| `ksc` Kennedy Space Center: Pads 39A/B, the VAB, the Shuttle Landing Facility | 16 km | 28.615 N, 80.655 W |
| `cape` Cape Canaveral: SLC-41, LC-12 | 12 km | 28.53 N, 80.57 W |
| `starbase` Starbase, Texas | 8 km | 25.997 N, 97.155 W |
| `edwards` Edwards AFB and Rogers Dry Lake | 24 km | 34.93 N, 117.85 W |
| `whitesands` White Sands Space Harbor | 16 km | 32.99 N, 106.425 W |

| In the file | From | Notes |
|---|---|---|
| `elev` | [USGS 3DEP](https://www.usgs.gov/3d-elevation-program) seamless 1/3 arc-second elevation, through the National Map's ImageServer | 384 × 384 heights, bilinear, as decimetres above `elev.base` (Uint16 LE, base64, rows from the south) |
| `polys` | [U.S. Census Bureau TIGERweb](https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html) areal hydrography | polygons in local metres east/north of the centre, clipped to the square, simplified to 4 m; `kind` from the MTFCC code (sea, bay, lake, reservoir, river, swamp, playa) |
| `streams` | TIGERweb linear hydrography | stream and canal centrelines, clipped, simplified to 3 m |
| `roads` | [U.S. Census Bureau TIGERweb](https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html): primary, secondary and local roads | lines, simplified to 2 m, with the MTFCC code and name |
| `cover` | [MRLC NLCD](https://www.mrlc.gov/) land cover, latest CONUS release, through the MRLC WMS | 384 × 384 NLCD class codes (Uint8, base64): 11 water, 21–24 developed, 31 barren, 41–43 forest, 52 shrub, 71 grass, 81–82 farmland, 90 woody wetland, 95 herbaceous wetland |

Each site is a square cut in plain latitude and longitude, its sides scaled so a cell is as wide as it is tall at the centre. The square is a little larger than what the app shows, so its edges can fade into the globe.

The servers are sometimes slow or briefly down; the script retries each request four times and says what it is waiting for. If one source fails the whole site fails, so run it again later. The files are 0.5–2 MB each; commit them.
