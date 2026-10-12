# Orbiter markings

The orbiter is drawn with the Smithsonian's scan of Discovery (`assets/orbiter.glb`), in the markings she wore when she
was retired. `paint.py` repaints the scan's colour map so that each flight's orbiter wears its own markings, as it flew
that flight. The app picks the map by the flight's orbiter: `ORBITER_LIVERY` in `app/32_shuttle.js`.

| Map | Flight | Markings |
|---|---|---|
| `orbiter-columbia-1981.webp` | STS-1 | Enterprise's scheme. A US flag on the left wing; "USA" on the right wing, larger and more widely spaced than Enterprise's. The name on the payload bay doors, above the hinge and behind the crew module. The NASA logotype ("worm") in grey at the doors' aft end. "United States" with a flag on the aft fuselage. Columbia's black chines on the wing gloves. No name on the forward fuselage, no NASA insignia. |
| `orbiter-discovery-1990.webp` | STS-31 | The scheme Challenger set in 1983. "USA" above a flag on the left wing; the logotype in grey centred above the name on the right wing. The name on the forward fuselage, behind the cockpit windows. The logotype in black at the doors' aft end. "United States" with a flag on the aft fuselage. No NASA insignia. |
| `orbiter-atlantis-2011.webp` | STS-135 | The scheme of 1998 on, as on the scan: the insignia on the left wing, the flag above the name on the right wing, the name on the forward fuselage, the insignia aft of "United States". Atlantis's name in place of Discovery's. |

What the markings were, and when they changed, follows the "Markings and insignia" section of Wikipedia's
[Space Shuttle orbiter](https://en.wikipedia.org/wiki/Space_Shuttle_orbiter) article. Where a marking sits and how large
it is comes from the scan wherever the scan has it: the names, the wing flag, "United States" and the flags beside it.
The rest is estimated and is easy to change in `paint.py`: the size and place of Columbia's door lettering, the logotype
on the doors and the wing, the wing "USA", and the extent of Columbia's chines (here the whole top of each wing glove, from
the cockpit back to where the leading edge turns outboard).

## How it works

1. `livery.js views` renders the scan in a headless browser, seen straight from the left, the right, the top and the
   bottom at 100 px/m, with the raw colours of its map (no light).
2. `paint.py` repaints those views. Letters come out by filling them from around them (OpenCV's inpainting); larger marks
   (the flag, the insignia) are covered with clean paint from a little way off, blended in over the gradient so its edges
   take the colour around them. New lettering is set in a Helvetica cut (TeX Gyre Heros Bold) at the cap height,
   slant and turn fitted to the scan's own lettering, in the black sampled from it. New flags are copies of the scan's
   own. The logotype is Simple Icons' drawing of it (CC0), filled at the size wanted. The chines take the belly's tiles,
   darkened to the black of the tiles beside the cockpit.
3. `livery.js bake` draws every triangle of the scan in its map's UV space. Each texel looks itself up in the repainted
   views: where its surface point faces a view, is the nearest surface there and the view's paint covers it, it takes the
   view's colour. Every other texel keeps its colour exactly.
4. `paint.py` fills the gutters around the repainted UV islands (the texels no triangle covers, which blend into an island
   when the map is filtered) from the nearest covered texel and writes the map as WebP.

`livery.js check <work dir>` renders the scan with a repainted map, to look at it.

## Running it

From the repository root:

```bash
python3 tools/livery/paint.py                 # every map
python3 tools/livery/paint.py columbia-1981   # one
```

It needs Python 3 with numpy, scipy, OpenCV and Pillow; Node 22 with Playwright, as for the video tools (see
`tools/video/README.md`); and TeX Gyre Heros (it looks for it where TeX Live puts it, then for Helvetica on a Mac;
`HELVETICA=<font file>` chooses another). The work files go to `tools/livery/work/`.
