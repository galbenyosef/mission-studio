# Site imagery

`fetch.mjs` downloads the aerial photographs of the app's American launch and landing sites from the USGS National Map
(NAIP, public domain) and writes them to `assets/site_<id>.jpg`. The app (`app/43_sites.js`) drapes each one over the
ground round its pad or runway, in place of the procedural scrub: the real coast, lagoons, roads, the crawlerway, the
buildings' roofs, the dry lake.

```bash
npm install --no-save sharp
node tools/sites/fetch.mjs            # all sites, about 15 MB in all
node tools/sites/fetch.mjs ksc        # one of: ksc cape starbase edwards whitesands
```

| Site | Centre | Square | Covers |
|---|---|---|---|
| `ksc` | 28.615 N, 80.655 W | 16 km | Pads 39A and 39B, the VAB, the crawlerway, the Shuttle Landing Facility |
| `cape` | 28.530 N, 80.570 W | 12 km | SLC-41 (Atlas V) and LC-12 (Atlas-Agena) |
| `starbase` | 25.997 N, 97.155 W | 8 km | Starbase and the beach |
| `edwards` | 34.930 N, 117.850 W | 24 km | The concrete runways and Rogers Dry Lake |
| `whitesands` | 32.990 N, 106.425 W | 16 km | White Sands Space Harbor |

The photographs are the latest NAIP coverage the server holds (2021–2023), so they show the sites as they are now, not as
they were on the launch day: Pad 39A with SpaceX's tower, Starbase with its second tower. The buildings themselves are not
modelled; their roofs are in the photographs, and the pad structures the app draws stand on top.

The imagery is public domain (U.S. Government work). Credit: U.S. Geological Survey, National Agriculture Imagery Program.
