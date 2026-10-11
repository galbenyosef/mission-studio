// Builds the app's detailed vehicle models (assets/*.glb) from published 3D models that may be used freely:
//   - NASA 3D Resources (https://github.com/nasa/NASA-3D-Resources), free and without copyright (see NASA's usage
//     guidelines);
//   - models on Sketchfab under CC0 (public domain) or CC BY 4.0 (credit the author: README.md and the app's credits).
//     Sketchfab asks for a sign-in to download, so these are fetched by hand: each recipe names the model's page; download
//     the glTF version and unzip it into a folder of its own under the --dl directory.
//
// Each recipe below
//   - splits a model into the parts the app moves on their own (a lunar module's ascent and descent stages, a rover's
//     wheels, an orbiter's payload bay doors …): one node per part, holding a child node with the part's mesh, so the
//     part's own transform stays free for the app (a wheel turns about its pivot) while the mesh node carries meshopt's
//     dequantisation;
//   - scales it to metres and puts each part's origin where the app's own model of that part has it, so the parts
//     drop into every configuration (docked, landed, lifting off) unchanged;
//   - drops parts too small to ever see, merges meshes by material (a few draw calls per part) and simplifies them;
//   - sets metalness and roughness where the source materials are converted Blinn, strips material extensions the app
//     does not need (transmission would cost three.js a second render pass), shrinks textures to WebP;
//   - quantises and compresses the geometry with meshopt (EXT_meshopt_compression, decoded by three.js's MeshoptDecoder).
//
//   git clone --filter=blob:none https://github.com/nasa/NASA-3D-Resources <dir> && git -C <dir> checkout 11ebb4ee
//   npm install
//   node build.mjs --nasa <dir> --dl <dir> [recipe …]   → ../../assets/<recipe>.glb (recipes whose source is missing are skipped)
//   node inspect.mjs <file.glb> [scale]                  → every mesh with its bounds, to write a recipe
//   node frame.mjs <file.gltf>                           → a model's principal axes, to find a scan's own frame
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh, prune, dedup, joinPrimitives, weld, meshopt, simplifyPrimitive, textureCompress, compactPrimitive } from '@gltf-transform/functions';
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
    nasa: '3D Models/Apollo Lunar Module/Apollo Lunar Module.glb',
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
    nasa: '3D Models/Mars 2020 Perseverance Rover/Mars 2020 Perseverance Rover.glb',
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
  // Space Shuttle orbiter: the Smithsonian's 3D scan of Discovery (OV-103) at the Steven F. Udvar-Hazy Center, CC0
  // (https://sketchfab.com/3d-models/orbiter-space-shuttle-ov-103-discovery-5f7176a2ae284d6b99fc970c9d265c04, unzipped into
  // discovery/). The scan stands on its landing gear, payload bay doors closed, in an arbitrary orientation; frame (world →
  // the app's orbiter axes, metres): +Y nose, +Z up, +X starboard, Y = 0 at the aft end of the fuselage (Xo 1528), Z = 0 at
  // the payload bay centreline (Zo 400). Found from the scan's shape (frame.mjs and a few profiles): the crown of the bay
  // doors is a straight line parallel to Xo, the wing tips are level, the nose tip is at Xo 238 and the crown 2.4 m above
  // Zo 400. In this frame the wings span 23.80 m (23.79 m published), the tail stands 17.24 m above the ground (17.25 m), the
  // main wheels touch at Y 8.8, 6.01 m below Zo 400, and the nose wheels at Y 29.0, 4.46 m below: on its gear the orbiter
  // sits 4.4° nose down.
  orbiter: {
    dl: 'discovery/scene.gltf',
    frame: [-0.999884, -0.00391, 0.014697, 0, 0.014988, -0.08955, 0.995865, 0, -0.002578, 0.99597, 0.089598, 0, 0.018859, 14.111534, 1.609725, 1],
    // The payload bay doors (Xo 576–1307), cut along their hinge line on the sills (Z 0.6) so the app can swing them open;
    // the landing gear, with its open doors, below the wheel wells (the app shows it only when the gear is down and closes
    // the wells otherwise). By triangle centre.
    triPart: ([x, y, z]) => {
      if (y > 5.61 && y < 24.18 && z > 0.6 && z < 2.6) return x < 0 ? 'doorL' : 'doorR';
      if (Math.abs(x) > 1.9 && Math.abs(x) < 5.0 && y > 7.4 && y < 12.8 && z < -3.72) return 'gear';
      if (Math.abs(x) < 1.3 && y > 27.8 && y < 31.6 && z < -3.45) return 'gear';
      return 'body';
    },
    pivots: { doorL: [-2.70, 0, 0.6], doorR: [2.70, 0, 0.6] },
    inner: { parts: ['doorL', 'doorR'], color: [0.86, 0.88, 0.9], metal: 0.35, rough: 0.4 }, // the doors' inner faces: radiator panels
    simplify: 0.001, // 3.7 cm on the body
    textures: { baseColor: 2048, other: 1024 }, // the colour map at 2048 px; the normal and occlusion-roughness-metalness maps at 1024
  },
  // International Space Station: NASA's model by the IGOAL lab at Johnson Space Center (NASA 3D Resources), as it flies
  // today, set back to July 2011 (STS-135): without Nauka, Prichal, the iROSA arrays, BEAM, the Bishop airlock, the two
  // docking adapters and Bartolomeo, and with PMA-3 removed (in 2011 it sat on Tranquility, not on Harmony).
  // The file's root scales by −0.003, a point reflection: undone, its axes are +x forward, +y nadir, −z starboard.
  // Frame (the app's station axes, metres): +Y forward (the direction of flight), +Z zenith, +X starboard, at 10.85 m per
  // unit of the file's scene (the truss from tip to tip 109 m), then shifted so that PMA-2's docking face is at
  // (0, 21.5, 0), the app's docking port.
  iss: {
    nasa: '3D Models/International Space Station (ISS) (D) (IGOAL)/International Space Station (ISS).glb',
    assembly: true,
    drop: [/^MLM$/, /^Russian_RSNode_DockingModule$/, /^BEAM$/, /^Bishop_Airlock$/, /^PMA3$/, /IROSA/i, /^IDA[23]/, /BARTOLOMEO/i, /GITAI/i, /ColKa/i, /STP-H/i, /SAGE/i],
    frame: (S => [0, -S, 0, 0, 0, 0, S, 0, S, 0, 0, 0, 0, 0, 0, 1])(10.85),
    anchor: { node: 'PMA2', at: [0, 21.5, 0] }, // the forward face of PMA-2 (its centre)
    minSize: 0.3, // m: handrails, bolts and other pieces too small to see
    simplify: 0.15, // m
    simplifyNear: [/^(Node2|PMA2|USLab|Node1|Columbus|JEM_PM|JEM_PS|Cupola|Node3|PMM)$/, 0.03], // the modules a docking orbiter sees from close by
    spare: /^[SP][46]_(\d[AB]_Array|Array_\d[AB])$|Radiator$/, // the solar array blankets (S6_1B_Array, P4_Array_4A …) and the radiators: flat textured panels the simplifier would smear
    // the source's materials come from Unity (metallic-smoothness maps read as glTF's metallic-roughness turn the arrays into
    // mirrors, and most are alpha-blended): painted metal and blankets, no metallic maps, alpha as a cut-out
    pbr: { metal: 0.15, rough: 0.62, dropMetalRough: true, alpha: 'MASK', cutoff: 0.95 }, // translucent glare layers (over the array cells) go; solid stays
    keepSides: true, // the blankets' two faces are separate surfaces: drawn double-sided they fight
    textures: { baseColor: 512, other: 256, named: { Truss_Diffuse: 2048 } }, // the truss atlas holds the arrays' cells
  },
};

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SRC = { nasa: opt('--nasa'), dl: opt('--dl') };
const names = args.filter((a, i) => !a.startsWith('--') && !['--nasa', '--dl'].includes(args[i - 1]));
if (!SRC.nasa && !SRC.dl) { console.error('usage: node build.mjs [--nasa <NASA-3D-Resources clone>] [--dl <downloads>] [recipe …]'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;

for (const name of names.length ? names : Object.keys(RECIPES)) {
  const R = RECIPES[name]; if (!R) throw new Error('no recipe ' + name);
  const kind = R.nasa ? 'nasa' : 'dl', dir = SRC[kind];
  if (!dir) { if (names.length) throw new Error(`${name}: needs --${kind}`); console.log(`${name}: skipped (no --${kind})`); continue; }
  const doc = await io.read(path.join(dir, R.nasa || R.dl)), root = doc.getRoot(), scene = root.listScenes()[0];
  if (R.assembly) { await buildAssembly(name, R, doc); continue; }
  if (R.frame) { await buildScan(name, R, doc); continue; }
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
  await shrinkTextures(doc, R.textures);
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  const tri = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  const prims = root.listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0);
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, parts ${Object.keys(groups).join(' ')}, ${prims} draw calls, ${tri} triangles, ${root.listTextures().length} textures, ${dropped} parts dropped → ${path.relative(process.cwd(), out)}`);
}

// A large assembly kept whole (one part, one primitive per material): drop the subtrees R.drop names, bake the rest into the
// vehicle's frame (R.frame, column-major, from the file's world frame), shift it so that R.anchor.node's forward (+Y) face
// lands on R.anchor.at, join by material, simplify, shrink the textures, compress.
async function buildAssembly(name, R, doc) {
  const root = doc.getRoot(), scene = root.listScenes()[0];
  for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose(); // compressed again with meshopt
  for (const a of root.listAnimations()) a.dispose();
  for (const k of root.listSkins()) k.dispose();
  let dropped = 0;
  for (const n of root.listNodes()) if (n.getName() && R.drop.some(re => re.test(n.getName()))) { const kill = x => { x.listChildren().forEach(kill); x.dispose(); dropped++; }; kill(n); }
  const isUnder = (n, nm) => { for (let x = n; x; x = x.getParentNode()) if (x.getName() === nm) return true; return false; };
  const meshes = root.listNodes().filter(n => n.getMesh());
  const P = [0, 0, 0];
  let fy = -Infinity; const face = [];
  for (const n of meshes) {
    ownMesh(n, root);
    transformMesh(n.getMesh(), mul(R.frame, n.getWorldMatrix()));
    if (R.anchor && isUnder(n, R.anchor.node)) for (const p of n.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, P); face.push([...P]); if (P[1] > fy) fy = P[1]; } }
  }
  let shift = [0, 0, 0];
  if (R.anchor) { const ring = face.filter(q => q[1] > fy - 0.05); const c = [0, 2].map(k => (ring.reduce((a, q) => Math.min(a, q[k]), 1e9) + ring.reduce((a, q) => Math.max(a, q[k]), -1e9)) / 2);
    shift = [R.anchor.at[0] - c[0], R.anchor.at[1] - fy, R.anchor.at[2] - c[1]]; console.log(`${name}: ${R.anchor.node}'s face at x ${c[0].toFixed(2)} y ${fy.toFixed(2)} z ${c[1].toFixed(2)} → shift ${shift.map(v => v.toFixed(2)).join(' ')}`); }
  const byMat = new Map(); let small = 0, before = 0, after = 0;
  for (const n of meshes) for (const p of n.getMesh().listPrimitives()) {
    if (R.minSize) { const a = p.getAttribute('POSITION'), lo = a.getMin([]), hi = a.getMax([]); if (Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) < R.minSize) { small++; continue; } }
    for (const s of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(s)) p.setAttribute(s, null);
    const m = p.getMaterial(), textured = m && (m.getBaseColorTexture() || m.getNormalTexture() || m.getMetallicRoughnessTexture() || m.getOcclusionTexture() || m.getEmissiveTexture());
    if (!p.getAttribute('NORMAL') || (textured && !p.getAttribute('TEXCOORD_0'))) continue;
    if (!textured) p.setAttribute('TEXCOORD_0', null);
    const spared = R.spare && R.spare.test(n.getName());
    const err = (R.simplifyNear && (() => { for (let x = n; x; x = x.getParentNode()) if (R.simplifyNear[0].test(x.getName())) return R.simplifyNear[1]; })()) || R.simplify;
    if (R.simplify && !spared) { before += p.getIndices().getCount() / 3; simplifyLoose(p, err); after += p.getIndices().getCount() / 3; if (!p.getIndices().getCount()) continue; } // pruned away whole
    const k = m || 'none'; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(p);
  }
  if (R.simplify) console.log(`${name}: simplified ${before} → ${after} triangles (meshes named ${R.spare} kept whole)`);
  const mesh = doc.createMesh(name);
  for (const [m, prims] of byMat) { const j = joinPrimitives(prims); if (m !== 'none') j.setMaterial(m); mesh.addPrimitive(j); }
  transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...shift, 1]);
  for (const c of scene.listChildren()) scene.removeChild(c);
  const g = doc.createNode(name); g.addChild(doc.createNode(name + '-mesh').setMesh(mesh)); scene.addChild(g);
  for (const n of root.listNodes()) if (n !== g && n.getParentNode() !== g) n.dispose();
  await doc.transform(prune({ keepLeaves: false })); // (no weld: on tiled texture coordinates its tolerance merges distinct ones)

  for (const m of root.listMaterials()) {
    if (!R.keepSides) m.setDoubleSided(true);
    if (R.pbr) { m.setMetallicFactor(R.pbr.metal).setRoughnessFactor(R.pbr.rough); if (R.pbr.dropMetalRough) m.setMetallicRoughnessTexture(null);
      if (R.pbr.alpha && m.getAlphaMode() === 'BLEND') m.setAlphaMode(R.pbr.alpha).setAlphaCutoff(R.pbr.cutoff ?? 0.5); }
  }
  for (const t of root.listTextures()) if (t.getMimeType() === 'image/png' && root.listTextures().some(u => u !== t && u.getName() === t.getName() && u.getMimeType() === 'image/webp')) t.dispose(); // the PNG copies kept for viewers without WebP
  await shrinkTextures(doc, R.textures);
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: R.compress || 'medium' }));
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  const tri = mesh.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  const b = getBounds(scene);
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${tri} triangles, ${mesh.listPrimitives().length} draw calls, ${root.listTextures().length} textures, ${dropped} nodes dropped, ${small} small pieces dropped, bounds ${b.min.map(v => v.toFixed(1)).join(' ')} → ${b.max.map(v => v.toFixed(1)).join(' ')} → ${path.relative(process.cwd(), out)}`);
}

// Give a node a mesh of its own, down to the vertex data: an instanced model (eight identical solar array wings) shares
// meshes, primitives and accessors between nodes, and baking each node's transform into shared data would apply them all
// on top of one another.
function ownMesh(n, root) {
  const shared = x => x.listParents().filter(p => p !== root).length > 1;
  let mesh = n.getMesh(); if (shared(mesh)) { mesh = mesh.clone(); n.setMesh(mesh); }
  for (const p0 of mesh.listPrimitives()) {
    const p = shared(p0) ? p0.clone() : p0; if (p !== p0) mesh.removePrimitive(p0).addPrimitive(p);
    for (const s of p.listSemantics()) { const a = p.getAttribute(s); if (shared(a)) p.setAttribute(s, a.clone()); }
    const ix = p.getIndices(); if (ix && shared(ix)) p.setIndices(ix.clone());
  }
}
// Simplify a primitive to an absolute error (m), across attribute seams, dropping loose pieces smaller than the error. CAD-style
// meshes are mostly separate faces (hard edges, a UV island each), which the simplifier otherwise cannot touch.
function simplifyLoose(prim, err) {
  const pos = prim.getAttribute('POSITION'), P = pos.getArray(), idx = prim.getIndices(); if (!idx || idx.getCount() < 3) return;
  const F = P instanceof Float32Array ? P : Float32Array.from(P), I = Uint32Array.from(idx.getArray());
  const [out] = MeshoptSimplifier.simplify(I, F, 3, 0, err, ['Permissive', 'Prune', 'ErrorAbsolute']);
  idx.setArray(out.length > 65535 * 3 || pos.getCount() > 65535 ? out : new Uint32Array(out)); compactPrimitive(prim);
}
// A scan or any single-mesh model: bake it into the vehicle's frame (R.frame, world → vehicle, column-major), cut its
// triangles into parts by where they lie (R.triPart), put each part's origin at its pivot (R.pivots), give listed parts an
// inner face of their own (R.inner: a thin shell such as a door seen from inside), simplify, shrink the textures, compress.
async function buildScan(name, R, doc) {
  const root = doc.getRoot(), scene = root.listScenes()[0];
  for (const a of root.listAnimations()) a.dispose();
  for (const k of root.listSkins()) k.dispose();
  for (const m of root.listMaterials()) { // one set of texture coordinates (a scan's texture sets are often copies of one)
    for (const ti of [m.getBaseColorTextureInfo(), m.getNormalTextureInfo(), m.getOcclusionTextureInfo(), m.getMetallicRoughnessTextureInfo(), m.getEmissiveTextureInfo()]) if (ti) ti.setTexCoord(0);
    m.setDoubleSided(true); // the cuts open the shell
  }
  const sel = {}, A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    ownMesh(n, root);
    transformMesh(n.getMesh(), mul(R.frame, n.getWorldMatrix()));
    for (const p of n.getMesh().listPrimitives()) {
      for (const s of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(s)) p.setAttribute(s, null);
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), cnt = idx ? idx.getCount() : pos.getCount();
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx.getScalar(t) : t, b = idx ? idx.getScalar(t + 1) : t + 1, c = idx ? idx.getScalar(t + 2) : t + 2;
        pos.getElement(a, A); pos.getElement(b, B); pos.getElement(c, C);
        const part = R.triPart([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]); if (!part) continue;
        ((sel[part] ||= new Map()).get(p) || sel[part].set(p, []).get(p)).push({ a, b, c });
      }
    }
  }
  const groups = {};
  for (const [part, byPrim] of Object.entries(sel)) {
    const pv = (R.pivots || {})[part] || [0, 0, 0];
    const prims = [...byPrim].map(([p, t]) => subPrimitive(doc, p, t)), j = joinPrimitives(prims); j.setMaterial(prims[0].getMaterial());
    const mesh = doc.createMesh(part).addPrimitive(j);
    transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -pv[0], -pv[1], -pv[2], 1]);
    const g = doc.createNode(part).setTranslation(pv); g.addChild(doc.createNode(part + '-mesh').setMesh(mesh)); scene.addChild(g); groups[part] = g;
  }
  for (const n of scene.listChildren()) if (!Object.values(groups).includes(n)) scene.removeChild(n);
  const keep = new Set(Object.values(groups).flatMap(g => [g, ...g.listChildren()]));
  for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
  await doc.transform(prune({ keepLeaves: false }));
  if (R.simplify) for (const g of Object.values(groups)) for (const h of g.listChildren()) for (const prim of h.getMesh().listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error: R.simplify, lockBorder: true });
  if (R.inner) { // a copy facing inward, 1.5 cm in, in a plain material of its own
    const I = R.inner, m = doc.createMaterial(name + '-inner').setBaseColorFactor([...I.color, 1]).setMetallicFactor(I.metal).setRoughnessFactor(I.rough);
    for (const part of I.parts) { const h = groups[part] && groups[part].listChildren()[0]; if (!h) continue;
      const src = h.getMesh().listPrimitives()[0], q = src.clone().setMaterial(m); q.setAttribute('TEXCOORD_0', null);
      const pos = q.getAttribute('POSITION').clone(), nor = q.getAttribute('NORMAL').clone(), ix = q.getIndices().clone(), P = [0, 0, 0], N = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, P); nor.getElement(i, N); pos.setElement(i, [P[0] - 0.015 * N[0], P[1] - 0.015 * N[1], P[2] - 0.015 * N[2]]); nor.setElement(i, [-N[0], -N[1], -N[2]]); }
      for (let t = 0; t < ix.getCount(); t += 3) { const b = ix.getScalar(t + 1); ix.setScalar(t + 1, ix.getScalar(t + 2)); ix.setScalar(t + 2, b); }
      q.setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setIndices(ix); h.getMesh().addPrimitive(q); }
  }
  await shrinkTextures(doc, R.textures);
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, name + '.glb');
  await io.write(out, doc);
  const tri = root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0), 0);
  const parts = Object.entries(groups).map(([p, g]) => p + ' ' + g.listChildren()[0].getMesh().listPrimitives().reduce((s, q) => s + q.getIndices().getCount() / 3, 0)).join(', ');
  console.log(`${name}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${tri} triangles (${parts}), ${root.listTextures().length} textures → ${path.relative(process.cwd(), out)}`);
}

// textures to WebP: size a number (every map) or { baseColor, other } (the colour maps, and the rest)
async function shrinkTextures(doc, size) {
  if (!size) return;
  const q = 82, enc = (slots, px) => textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: q, slots });
  if (typeof size === 'number') return doc.transform(enc(null, size));
  const named = Object.keys(size.named || {}), rest = named.length ? new RegExp('^(?!(' + named.join('|') + ')$)') : null;
  for (const n of named) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size.named[n], size.named[n]], quality: q, pattern: new RegExp('^' + n + '$') }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size.baseColor, size.baseColor], quality: q, slots: /baseColor/, pattern: rest }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size.other, size.other], quality: q, slots: /^(?!baseColor)/, pattern: rest }));
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
