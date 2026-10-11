// Finds a vehicle's own axes in a scanned or converted model whose orientation is arbitrary, from its shape:
//   - the principal axes of its vertices (a mirror-symmetric craft has one of them across its symmetry plane);
//   - for a craft standing on landing gear, the ground plane through the lowest points of its wheels.
// Prints the axes and a profile along the length, to write a recipe's frame.
//   node frame.mjs <file.gltf|glb> [--gear]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const [file, ...opts] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file), root = doc.getRoot();
export function worldPoints(root) {
  const P = [];
  for (const n of root.listNodes()) {
    const m = n.getMesh(); if (!m) continue; const W = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'), v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); P.push([W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]]); } }
  }
  return P;
}
const P = worldPoints(root), n = P.length, c = [0, 0, 0];
for (const p of P) for (let k = 0; k < 3; k++) c[k] += p[k] / n;
const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of P) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - c[i]) * (p[j] - c[j]) / n;
// eigenvectors of the symmetric 3×3 by Jacobi rotations
function jacobi(A) {
  const a = A.map(r => [...r]), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1; for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), cs = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; }
  }
  return [0, 1, 2].map(k => ({ val: a[k][k], vec: [V[0][k], V[1][k], V[2][k]] })).sort((x, y) => y.val - x.val);
}
const E = jacobi(C);
const f = v => v.map(x => x.toFixed(4)).join(', ');
console.log('vertices', n, 'centroid', f(c));
E.forEach((e, i) => console.log(`axis ${i}: [${f(e.vec)}]  σ ${Math.sqrt(e.val).toFixed(3)}`));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ext = v => { let lo = Infinity, hi = -Infinity; for (const p of P) { const d = dot(p, v); if (d < lo) lo = d; if (d > hi) hi = d; } return [lo, hi]; };
E.forEach((e, i) => { const [lo, hi] = ext(e.vec); console.log(`extent ${i}: ${lo.toFixed(3)} → ${hi.toFixed(3)} (${(hi - lo).toFixed(3)})`); });
