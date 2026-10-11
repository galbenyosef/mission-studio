// Radius profile of a glTF model along y (world space): for each y-slice, the largest distance from the axis (x0, z0),
// and which materials occur there. node profile.mjs <file.glb> <x0> <z0> [step] [nodeNameFilter]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
await MeshoptDecoder.ready;
const [file, x0s, z0s, steps = '0.1', filt = ''] = process.argv.slice(2), x0 = +x0s, z0 = +z0s, step = +steps;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file); const bins = new Map();
const mulv = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
for (const n of doc.getRoot().listNodes()) {
  const mesh = n.getMesh(); if (!mesh || (filt && !n.getName().includes(filt))) continue; const W = n.getWorldMatrix();
  for (const p of mesh.listPrimitives()) { const pos = p.getAttribute('POSITION'), mat = p.getMaterial() ? p.getMaterial().getName() : '-', v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = mulv(W, v); const k = Math.floor(w[1] / step); const r = Math.hypot(w[0] - x0, w[2] - z0);
      const b = bins.get(k) || { r: 0, mats: new Set() }; b.r = Math.max(b.r, r); b.mats.add(mat); bins.set(k, b); } } }
for (const k of [...bins.keys()].sort((a, b) => a - b)) { const b = bins.get(k); console.log((k * step).toFixed(2).padStart(7), b.r.toFixed(3).padStart(7), [...b.mats].join(',')); }
