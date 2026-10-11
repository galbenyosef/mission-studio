// Lists every mesh node of a glTF binary with its world-space bounds and materials, lowest first.
//   node inspect.mjs <file.glb> [scale]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
const [file, S = '1'] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file), root = doc.getRoot(), rows = [];
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  let tri = 0; for (const p of m.listPrimitives()) { const ix = p.getIndices(); tri += (ix ? ix.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  rows.push({ n: (n.getParentNode() ? n.getParentNode().getName() + '/' : '') + n.getName(), b: getBounds(n), mats: m.listPrimitives().map(p => (p.getMaterial() ? p.getMaterial().getName() : '-') + '[' + p.listSemantics().join(' ') + ']'), tri });
}
rows.sort((a, b) => a.b.min[1] - b.b.min[1]);
const s = +S, f = x => (x * s).toFixed(2).padStart(6);
for (const r of rows) console.log(r.n.padEnd(16), String(r.tri).padStart(6), 'x', f(r.b.min[0]), f(r.b.max[0]), ' y', f(r.b.min[1]), f(r.b.max[1]), ' z', f(r.b.min[2]), f(r.b.max[2]), ' ', r.mats.join(','));
const sb = getBounds(root.listScenes()[0]); console.log('scene', sb.min.map(x => (x * s).toFixed(3)).join(' '), '→', sb.max.map(x => (x * s).toFixed(3)).join(' '), ' meshes', rows.length, 'triangles', rows.reduce((a, r) => a + r.tri, 0));
