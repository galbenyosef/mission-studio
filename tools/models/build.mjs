// Builds the app's detailed vehicle models (assets/*.glb) from NASA 3D Resources glTF models, which NASA publishes
// free and without copyright (https://github.com/nasa/NASA-3D-Resources, see its usage guidelines).
//
// Each recipe below
//   - splits a model into the parts the app moves on their own (a lunar module's ascent and descent stages, …);
//   - scales it to metres and puts each part's origin where the app's own model of that part has it, so the parts
//     drop into every configuration (docked, landed, lifting off) unchanged;
//   - drops parts too small to ever see, merges meshes by material (a few draw calls per part);
//   - sets metalness and roughness for the app's image-based lighting (the source materials are converted Blinn);
//   - quantises and compresses the geometry with meshopt (EXTMeshoptCompression, decoded by three.js's MeshoptDecoder).
//
//   git clone --filter=blob:none https://github.com/nasa/NASA-3D-Resources <dir> && git -C <dir> checkout 11ebb4ee
//   npm install
//   node build.mjs --nasa <dir> [recipe …]        → ../../assets/<recipe>.glb
//   node inspect.mjs <file.glb> [scale]           → every mesh with its bounds, to write a recipe
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { transformMesh, prune, dedup, joinPrimitives, weld, meshopt, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve(import.meta.dirname, '../../assets');

// metalness / roughness by source material, for the gold and black foil and the aluminium skins
const FOIL = { metal: 0.75, rough: 0.35 }, SKIN = { metal: 0.55, rough: 0.45 }, DARK = { metal: 0.35, rough: 0.5 }, BLACK = { metal: 0.1, rough: 0.6 }, PAINT = { metal: 0, rough: 0.55 }, DECAL = { metal: 0, rough: 0.7 };

const RECIPES = {
  // Apollo lunar module. 7.04 m from the footpads to the tip of the antennas (0.103 → 5.115 in model units).
  // Descent stage: feet at y = −1.8 like the app's own model. Ascent stage: origin at the interstage plane, the top of the
  // descent stage (2.42 in model units), which sits at y = 1.455 in the descent stage's frame.
  apollo_lm: {
    src: '3D Models/Apollo Lunar Module/Apollo Lunar Module.glb',
    scale: 7.04 / (5.115 - 0.103),
    parts: { descent: { from: 0.103, to: -1.8 }, ascent: { from: 2.42, to: 0 } },
    // Everything wholly above the descent stage's top deck belongs to the ascent stage, except the RCS plume deflectors and
    // the porch, which begin lower and stay behind on the Moon. The fuel tank's fairing reaches a little below the deck.
    part: (name, b) => name === 'pCylinde10' || b.min[1] >= 2.4 ? 'ascent' : 'descent',
    minSize: 0.03, // model units: navigation lights and bolt heads a few centimetres across
    simplify: 0.0006,
    materials: {
      'blinn1SG.002': FOIL, 'blinn9SG.001': FOIL, // gold and amber foil (descent stage, footpads, RCS quads)
      'blinn4SG.002': SKIN, 'initialShadingGr.001': SKIN, 'blinn3SG.001': SKIN, // ascent stage skin, struts
      'blinn2SG.002': DARK, 'blinn6SG.001': BLACK, // dark panels, black foil and paint
      'blinn7SG.002': PAINT, 'blinn10SG.001': PAINT, 'blinn5SG.002': DARK, // antennas and deflectors, lights, engine bell
      'blinn8SG.001': DECAL, 'blinn12SG.001': DECAL, // flag and plaque
    },
  },
};

const args = process.argv.slice(2), at = args.indexOf('--nasa');
if (at < 0 || !args[at + 1]) { console.error('usage: node build.mjs --nasa <NASA-3D-Resources clone> [recipe …]'); process.exit(1); }
const NASA = args[at + 1], names = args.filter((a, i) => i !== at && i !== at + 1);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;

for (const name of names.length ? names : Object.keys(RECIPES)) {
  const R = RECIPES[name]; if (!R) throw new Error('no recipe ' + name);
  const doc = await io.read(path.join(NASA, R.src)), root = doc.getRoot(), scene = root.listScenes()[0];
  // drop the source's compression; the output is compressed again with meshopt
  for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  const S = R.scale, groups = {};
  for (const [p, o] of Object.entries(R.parts)) { groups[p] = doc.createNode(p); scene.addChild(groups[p]); }
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  let dropped = 0;
  for (const n of meshNodes) {
    const b = getBounds(n), size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    if (size < (R.minSize || 0)) { n.dispose(); dropped++; continue; }
    const p = R.part(n.getName(), b); if (!p) { n.dispose(); dropped++; continue; }
    // bake the node's world transform and the part's scale and offset into the vertices, then hang it under the part
    const W = n.getWorldMatrix(), o = R.parts[p], M = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, 0, o.to - o.from * S, 0, 1];
    transformMesh(n.getMesh(), mul(M, W));
    for (const par of n.listParents()) if (par !== groups[p] && par.removeChild) par.removeChild(n);
    n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); groups[p].addChild(n);
  }
  // remove the source's now empty hierarchy
  for (const n of scene.listChildren()) if (!Object.values(groups).includes(n)) { scene.removeChild(n); n.dispose(); }
  for (const m of root.listMaterials()) {
    const t = R.materials[m.getName()] || SKIN;
    m.setMetallicFactor(t.metal).setRoughnessFactor(t.rough).setDoubleSided(true);
  }
  // one mesh per part, one primitive per material: a few draw calls instead of one per source mesh
  await doc.transform(prune(), weld());
  for (const [p, g] of Object.entries(groups)) {
    const byMat = new Map();
    for (const n of g.listChildren()) for (const prim of n.getMesh().listPrimitives()) {
      const mat = prim.getMaterial(); if (!mat.getBaseColorTexture() && prim.getAttribute('TEXCOORD_0')) prim.setAttribute('TEXCOORD_0', null);
      for (const s of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(s)) prim.setAttribute(s, null);
      if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(prim);
    }
    const mesh = doc.createMesh(p);
    for (const [mat, prims] of byMat) mesh.addPrimitive(joinPrimitives(prims).setMaterial(mat));
    for (const n of g.listChildren()) { g.removeChild(n); n.dispose(); }
    g.setMesh(mesh);
  }
  // fewer triangles where it cannot be seen: error relative to each part's size (a few millimetres on a lunar module)
  if (R.simplify) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: R.simplify, lockBorder: true }));
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  const tri = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${root.listMeshes().length} meshes, ${tri} triangles, ${dropped} small parts dropped → ${path.relative(process.cwd(), out)}`);
}

function mul(a, b) { // column-major 4×4 product a·b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
