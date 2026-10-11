// Builds the app's detailed vehicle models (assets/*.glb) from NASA 3D Resources glTF models, which NASA publishes
// free and without copyright (https://github.com/nasa/NASA-3D-Resources, see its usage guidelines).
//
// Each recipe below
//   - splits a model into the parts the app moves on their own (a lunar module's ascent and descent stages, a rover's
//     wheels, …): one node per part, holding a child node with the part's mesh, so the part's own transform stays free
//     for the app (a wheel turns about its pivot) while the mesh node carries meshopt's dequantisation;
//   - scales it to metres and puts each part's origin where the app's own model of that part has it, so the parts
//     drop into every configuration (docked, landed, lifting off) unchanged;
//   - drops parts too small to ever see, merges meshes by material (a few draw calls per part) and simplifies them;
//   - sets metalness and roughness where the source materials are converted Blinn, strips material extensions the app
//     does not need (transmission would cost three.js a second render pass), shrinks textures to WebP;
//   - quantises and compresses the geometry with meshopt (EXT_meshopt_compression, decoded by three.js's MeshoptDecoder).
//
//   git clone --filter=blob:none https://github.com/nasa/NASA-3D-Resources <dir> && git -C <dir> checkout 11ebb4ee
//   npm install
//   node build.mjs --nasa <dir> [recipe …]        → ../../assets/<recipe>.glb
//   node inspect.mjs <file.glb> [scale]           → every mesh with its bounds, to write a recipe
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh, prune, dedup, joinPrimitives, weld, meshopt, simplifyPrimitive, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
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
    defaultMaterial: SKIN,
  },
  // Mars 2020 Perseverance. The model is in metres, +Z forward (the arm and its turret), wheels on the ground at y = 0, like
  // the app's rover. Its six wheels are one mesh: split into one part each with its pivot on the axle, so they can turn
  // (the app reads the radius from the node's extras). The source's materials are physically based already.
  perseverance: {
    src: '3D Models/Mars 2020 Perseverance Rover/Mars 2020 Perseverance Rover.glb',
    scale: 1,
    parts: { body: { from: 0, to: 0 } },
    part: () => 'body',
    dropMaterials: ['transparent'], // invisible helper shapes (the rig's skinned pieces are dropped as well)
    // the remote sensing mast (rigged in the source: its root node is the shoulder hinge) as a part of its own, so the app
    // can raise it on the surface; extras.deploy: the axis and angle that stand it up, from the head's direction
    subtree: { node: 'Cylinder', part: 'mast', tip: 'head' },
    split: { node: 'Wheels_objs', seeds: [[-1.1, -1.15], [1.1, -1.15], [-1.1, 0], [1.1, 0], [-1.1, 1.1], [1.1, 1.1]], part: i => 'wheel' + i, extras: { wheel: 0.2625 } },
    minSize: 0.012,
    simplify: { default: 0.003, wheel: 0.012 },
    strip: ['KHR_materials_transmission', 'KHR_materials_clearcoat', 'KHR_materials_ior', 'KHR_materials_specular'],
    textures: 512,
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
  // drop the source's compression (the output is compressed again with meshopt) and the material extensions not wanted
  for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression' || (R.strip || []).includes(e.extensionName)) e.dispose();
  for (const a of root.listAnimations()) a.dispose(); // the app poses parts itself; rigs and their animations go
  for (const k of root.listSkins()) k.dispose();
  const S = R.scale, groups = {}, holders = {};
  const group = (p, pivot = null, extras = null) => {
    const g = doc.createNode(p); if (pivot) g.setTranslation(pivot); if (extras) g.setExtras(extras); scene.addChild(g);
    groups[p] = g; holders[p] = []; return g;
  };
  for (const p of Object.keys(R.parts)) group(p);
  let dropped = 0;
  // a mesh split into parts of its own (a rover's wheels), each with its pivot at the centre of its bounds
  if (R.split) {
    const src = root.listNodes().find(n => n.getName() === R.split.node); if (!src) throw new Error('no node ' + R.split.node);
    const pieces = splitByClusters(doc, src, R.split.seeds);
    pieces.forEach((nd, i) => {
      const b = getBounds(nd), c = [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2 * S);
      const p = R.split.part(i); group(p, c, R.split.extras);
      const M = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, -c[0], -c[1], -c[2], 1];
      transformMesh(nd.getMesh(), mul(M, nd.getWorldMatrix())); holders[p].push(nd.getMesh()); nd.dispose();
    });
    src.dispose();
  }
  if (R.subtree) { // a node and its descendants as one part, pivoting about the node's origin
    const top = root.listNodes().find(n => n.getName() === R.subtree.node); if (!top) throw new Error('no node ' + R.subtree.node);
    const piv = mulv(top.getWorldMatrix(), [0, 0, 0]).map(x => x * S), tip = root.listNodes().find(n => n.getName() === R.subtree.tip);
    const tb = getBounds(tip), tc = [0, 1, 2].map(k => (tb.min[k] + tb.max[k]) / 2 * S), d = [tc[0] - piv[0], tc[1] - piv[1], tc[2] - piv[2]], dl = Math.hypot(...d), u = d.map(x => x / dl);
    const ax = [-u[2], 0, u[0]], al = Math.hypot(...ax); // u × up, normalised: turning about it brings u up to vertical
    const p = R.subtree.part; group(p, piv, { deploy: [ax[0] / al, 0, ax[2] / al, Math.acos(Math.max(-1, Math.min(1, u[1])))] });
    const sub = []; const walk = n => { if (n.getMesh()) sub.push(n); n.listChildren().forEach(walk); }; walk(top);
    for (const n of sub) {
      if (n.getSkin()) continue;
      const M = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, -piv[0], -piv[1], -piv[2], 1];
      const mesh = n.getMesh(); if (mesh.listParents().filter(x => x !== root).length > 1) n.setMesh(mesh.clone());
      transformMesh(n.getMesh(), mul(M, n.getWorldMatrix())); holders[p].push(n.getMesh()); n.setMesh(null);
    }
  }
  for (const n of root.listNodes().filter(n => n.getMesh() && !Object.values(groups).includes(n))) {
    if (n.getSkin()) { n.dispose(); dropped++; continue; }
    const b = getBounds(n), size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    if (size < (R.minSize || 0)) { n.dispose(); dropped++; continue; }
    const p = R.part(n.getName(), b); if (!p) { n.dispose(); dropped++; continue; }
    // bake the node's world transform and the part's scale and offset into the vertices
    const o = R.parts[p], M = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, 0, o.to - o.from * S, 0, 1];
    const mesh = n.getMesh(); if (mesh.listParents().filter(x => x !== root).length > 1) n.setMesh(mesh.clone());
    transformMesh(n.getMesh(), mul(M, n.getWorldMatrix())); holders[p].push(n.getMesh());
  }
  // the source's hierarchy goes; only the parts stay in the scene
  for (const n of scene.listChildren()) if (!Object.values(groups).includes(n)) { scene.removeChild(n); }
  for (const m of root.listMaterials()) {
    if (R.materials || R.defaultMaterial) { const t = (R.materials || {})[m.getName()] || R.defaultMaterial; if (t) m.setMetallicFactor(t.metal).setRoughnessFactor(t.rough); }
    m.setDoubleSided(true);
  }
  // one mesh per part, one primitive per material: a few draw calls instead of one per source mesh
  await doc.transform(weld());
  for (const [p, g] of Object.entries(groups)) {
    const byMat = new Map();
    for (const m of holders[p]) for (const prim of m.listPrimitives()) {
      const mat = prim.getMaterial(), textured = mat && (mat.getBaseColorTexture() || mat.getNormalTexture() || mat.getMetallicRoughnessTexture() || mat.getEmissiveTexture() || mat.getOcclusionTexture());
      if (mat && (R.dropMaterials || []).includes(mat.getName())) continue;
      for (const s of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(s) || (s === 'TEXCOORD_0' && !textured)) prim.setAttribute(s, null);
      if (!prim.getAttribute('NORMAL')) continue;
      if (textured && !prim.getAttribute('TEXCOORD_0')) continue;
      const k = mat ? mat : 'none'; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(prim);
    }
    const mesh = doc.createMesh(p);
    for (const [mat, prims] of byMat) { const j = joinPrimitives(prims); if (mat !== 'none') j.setMaterial(mat); mesh.addPrimitive(j); }
    const holder = doc.createNode(p + '-mesh').setMesh(mesh); g.addChild(holder);
  }
  const keep = new Set(Object.values(groups).flatMap(g => [g, ...g.listChildren()]));
  for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
  await doc.transform(prune({ keepLeaves: false }), weld());
  // fewer triangles where it cannot be seen: error relative to each part's size (a few millimetres on a lunar module)
  if (R.simplify) for (const [p, g] of Object.entries(groups)) { // a number, or errors by part-name prefix ({ default, wheel, … })
    const err = typeof R.simplify === 'number' ? R.simplify : (Object.entries(R.simplify).find(([k]) => k !== 'default' && p.startsWith(k)) || [0, R.simplify.default])[1];
    for (const h of g.listChildren()) for (const prim of h.getMesh().listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error: err, lockBorder: true });
  }
  if (R.textures) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [R.textures, R.textures], quality: 82 }));
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  const tri = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  const prims = root.listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0);
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, parts ${Object.keys(groups).join(' ')}, ${prims} draw calls, ${tri} triangles, ${root.listTextures().length} textures, ${dropped} parts dropped → ${path.relative(process.cwd(), out)}`);
}

// Splits a node's mesh by triangle into clusters around the seeds ([x, z] in world space, refined by k-means): one new
// node per cluster with only the vertices its triangles use, carrying the source node's world transform.
function splitByClusters(doc, node, seeds) {
  const W = node.getWorldMatrix(), tris = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = idx ? idx.getCount() : pos.getCount(), v = [0, 0, 0];
    const at = i => { pos.getElement(i, v); return mulv(W, v); };
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getScalar(t) : t, b = idx ? idx.getScalar(t + 1) : t + 1, c = idx ? idx.getScalar(t + 2) : t + 2;
      const pa = at(a), pb = at(b), pc = at(c);
      tris.push({ prim, a, b, c, x: (pa[0] + pb[0] + pc[0]) / 3, z: (pa[2] + pb[2] + pc[2]) / 3, k: 0 });
    }
  }
  const S = seeds.map(s => [...s]);
  for (let it = 0; it < 8; it++) {
    for (const t of tris) { let best = 0, bd = Infinity; S.forEach((s, k) => { const d = (t.x - s[0]) ** 2 + (t.z - s[1]) ** 2; if (d < bd) { bd = d; best = k; } }); t.k = best; }
    S.forEach((s, k) => { const m = tris.filter(t => t.k === k); if (m.length) { s[0] = m.reduce((a, t) => a + t.x, 0) / m.length; s[1] = m.reduce((a, t) => a + t.z, 0) / m.length; } });
  }
  return S.map((s, k) => {
    const mesh = doc.createMesh(node.getName() + '-' + k);
    for (const prim of node.getMesh().listPrimitives()) {
      const sel = tris.filter(t => t.k === k && t.prim === prim); if (!sel.length) continue;
      mesh.addPrimitive(subPrimitive(doc, prim, sel));
    }
    const nd = doc.createNode(node.getName() + '-' + k).setMesh(mesh).setMatrix(W);
    doc.getRoot().listScenes()[0].addChild(nd); return nd;
  });
}
// a primitive with only the given triangles and the vertices they use
function subPrimitive(doc, prim, sel) {
  const map = new Map(), order = [];
  const idx = sel.flatMap(t => [t.a, t.b, t.c]).map(i => { if (!map.has(i)) { map.set(i, order.length); order.push(i); } return map.get(i); });
  const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode());
  for (const s of prim.listSemantics()) {
    const src = prim.getAttribute(s), es = src.getElementSize(), arr = src.getArray(), dst = new arr.constructor(order.length * es);
    order.forEach((i, j) => { for (let e = 0; e < es; e++) dst[j * es + e] = arr[i * es + e]; });
    out.setAttribute(s, doc.createAccessor().setType(src.getType()).setArray(dst).setNormalized(src.getNormalized()));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)));
  return out;
}
function mul(a, b) { // column-major 4×4 product a·b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function mulv(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }
