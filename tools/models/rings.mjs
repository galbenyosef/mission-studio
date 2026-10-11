// unique vertex heights of a mesh (world y), with the ring radius and material at each: node rings.mjs file.glb x0 z0 nodeFilter
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
await MeshoptDecoder.ready;
const [file, x0s, z0s, filt = ''] = process.argv.slice(2), x0 = +x0s, z0 = +z0s;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file); const ys = new Map();
const mulv = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
for (const n of doc.getRoot().listNodes()) { const mesh = n.getMesh(); if (!mesh || (filt && !n.getName().includes(filt))) continue; const W = n.getWorldMatrix();
  for (const p of mesh.listPrimitives()) { const pos = p.getAttribute('POSITION'), mat = p.getMaterial() ? p.getMaterial().getName() : '-', v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = mulv(W, v); const k = w[1].toFixed(3); const r = Math.hypot(w[0] - x0, w[2] - z0); const e = ys.get(k) || { rmin: 1e9, rmax: 0, mats: new Set() }; e.rmin = Math.min(e.rmin, r); e.rmax = Math.max(e.rmax, r); e.mats.add(mat); ys.set(k, e); } } }
for (const k of [...ys.keys()].sort((a, b) => a - b)) { const e = ys.get(k); console.log(k.padStart(8), e.rmin.toFixed(3), e.rmax.toFixed(3), [...e.mats].join(',')); }
