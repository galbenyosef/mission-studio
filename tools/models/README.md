# Detailed vehicle models

`build.mjs` turns models from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) into the app's `assets/*.glb`. NASA publishes these models free and without copyright; see its [usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media).

Each recipe in `build.mjs` does the following:

- It splits the model into the parts the app moves separately. For example, a lunar module has an ascent stage and a descent stage.
- It scales the model to metres. It puts each part's origin where the app's built-in model of that part has it, so the parts fit every configuration: docked, landed or lifting off.
- It drops parts too small to see. It merges meshes by material, so each part takes only a few draw calls, and simplifies the geometry within a few millimetres.
- It sets metalness and roughness for the app's image-based lighting.
- It compresses the geometry with meshopt. The app decodes it with three.js's `MeshoptDecoder`.

The app loads a model the first time a mission needs it. Until the model arrives, or if it fails to load, the craft keeps its built-in model.

```bash
git clone --filter=blob:none https://github.com/nasa/NASA-3D-Resources ../nasa-3d
git -C ../nasa-3d checkout 11ebb4ee043715aefbba6aeec8a61746fad67fa7
npm install
node build.mjs --nasa ../nasa-3d             # every recipe → ../../assets/<name>.glb
node build.mjs --nasa ../nasa-3d apollo_lm   # one recipe
node inspect.mjs <file.glb> [scale]          # each mesh with its bounds and materials, for writing a recipe
node profile.mjs <file.glb> <x0> <z0> [step] # radius along the length (a rocket's stages and tapers)
node rings.mjs <file.glb> <x0> <z0> [node]   # the heights of a mesh's vertex rings: where to cut it into parts
```

| Asset | Source | Parts |
|---|---|---|
| `apollo_lm.glb` | `3D Models/Apollo Lunar Module` | `descent`: feet at y = −1.8 m. `ascent`: origin at the top of the descent stage. |
| `perseverance.glb` | `3D Models/Mars 2020 Perseverance Rover` | `body`: wheels on the ground at y = 0, +Z forward. `wheel0`–`wheel5`: pivots on the axles, `extras.wheel` = radius. `mast`: pivot at the shoulder hinge, `extras.deploy` = axis and angle that raise it. |
