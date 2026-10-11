# Detailed vehicle models

`build.mjs` turns published 3D models into the app's `assets/*.glb`:

- models from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), which NASA publishes free and without copyright (see its [usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media));
- models on Sketchfab released under CC0 (public domain) or CC BY 4.0. A CC BY model's author is credited in the app's README. Sketchfab asks for a sign-in to download, so these are fetched by hand: open the model's page (each recipe names it), download the glTF version and unzip it into a folder of its own, named as the recipe says, under one downloads directory.

Each recipe in `build.mjs` does the following:

- It splits the model into the parts the app moves separately. For example, a lunar module has an ascent stage and a descent stage.
- It scales the model to metres. It puts each part's origin where the app's built-in model of that part has it, so the parts fit every configuration: docked, landed or lifting off.
- It drops parts too small to see. It merges meshes by material, so each part takes only a few draw calls, and simplifies the geometry within a few millimetres.
- It sets metalness and roughness for the app's image-based lighting.
- A scan, which is one mesh standing in an arbitrary orientation, is first turned into the vehicle's own frame (`frame.mjs` finds its axes) and then cut into parts by where each triangle lies.
- A model whose overall size is right but whose parts are not can be cut across at its joints and stretched piece by piece to published dimensions; its texture moves with it.
- It compresses the geometry with meshopt. The app decodes it with three.js's `MeshoptDecoder`.

The app loads a model the first time a mission needs it. Until the model arrives, or if it fails to load, the craft keeps its built-in model.

```bash
git clone --filter=blob:none https://github.com/nasa/NASA-3D-Resources ../nasa-3d
git -C ../nasa-3d checkout 11ebb4ee043715aefbba6aeec8a61746fad67fa7
npm install
node build.mjs --nasa ../nasa-3d --dl ../downloads   # every recipe → ../../assets/<name>.glb
node build.mjs --nasa ../nasa-3d apollo_lm           # one recipe (recipes whose source is not given are skipped)
node build.mjs --dl ../downloads orbiter
node inspect.mjs <file.glb> [scale]          # each mesh with its bounds and materials, for writing a recipe
node profile.mjs <file.glb> <x0> <z0> [step] # radius along the length (a rocket's stages and tapers)
node rings.mjs <file.glb> <x0> <z0> [node]   # the heights of a mesh's vertex rings: where to cut it into parts
node frame.mjs <file.gltf>                   # a model's principal axes and extents: where a scan's own axes are
```

| Asset | Source | Parts |
|---|---|---|
| `apollo_lm.glb` | `3D Models/Apollo Lunar Module` | `descent`: feet at y = −1.8 m. `ascent`: origin at the top of the descent stage. |
| `perseverance.glb` | `3D Models/Mars 2020 Perseverance Rover` | `body`: wheels on the ground at y = 0, +Z forward. `wheel0`–`wheel5`: pivots on the axles, `extras.wheel` = radius. `mast`: pivot at the shoulder hinge, `extras.deploy` = axis and angle that raise it. |
| `iss.glb` | `3D Models/International Space Station (ISS) (D) (IGOAL)` | `iss`, one part: the station as in July 2011. The station's frame: +Y forward, +Z zenith, +X starboard, metres, PMA-2's docking face at (0, 21.5, 0). |
| `saturnv.glb` | ["Saturn V"](https://sketchfab.com/3d-models/saturn-v-88f68de3b3e9435582560e02a52b325d) by BoldlyBuilding (CC BY 4.0), unzipped into `saturnv/` | One part per stage, each in the stage's own frame: +Y up, metres. `S-IC`: y = 0 at the base of its thrust structure, the F-1 nozzles 3.24 m below. `IST` (the S-II's aft interstage) and `S-II`: y = 0 at the bottom of the interstage. `S-IVB` (with the instrument unit): y = 0 at the top of the cone between it and the S-II. |
| `orbiter.glb` | Smithsonian, [Orbiter Space Shuttle OV-103 Discovery](https://sketchfab.com/3d-models/orbiter-space-shuttle-ov-103-discovery-5f7176a2ae284d6b99fc970c9d265c04) (CC0), unzipped into `discovery/` | The orbiter's frame: +Y nose, +Z up, +X starboard, Y = 0 at the aft end of the fuselage (Xo 1528), Z = 0 at the payload bay centreline (Zo 400). `body`. `doorL`, `doorR`: the payload bay doors, pivots on their hinge lines (x ±2.70, z 0.60), with radiator-coloured inner faces. `gear`: the three landing gears with their open doors. |
