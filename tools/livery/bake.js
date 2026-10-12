// The livery tool's page (livery.js drives it): the orbiter scan seen from its sides, top and bottom with the raw colours of
// its map, and the repainted views baked back into the map.
import * as THREE from '/lib/three.js';
import { GLTFLoader } from '/lib/GLTFLoader.js';
import { MeshoptDecoder } from '/lib/meshopt.js';

const R = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
R.outputColorSpace = THREE.LinearSRGBColorSpace; R.setPixelRatio(1); R.setClearColor(0x000000, 0); // colours in = colours out
document.body.appendChild(R.domElement);
const ld = new GLTFLoader(); ld.setMeshoptDecoder(MeshoptDecoder);
const gl = await ld.loadAsync('/orbiter.glb');
gl.scene.updateMatrixWorld(true);
const meshes = []; gl.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
const scanMat = meshes.find(m => m.material.name === 'default').material;
const raw = scanMat.map.clone(); raw.colorSpace = THREE.NoColorSpace; raw.needsUpdate = true; // the map's own values, not decoded
const inGear = o => { for (let p = o; p; p = p.parent) if (p.name === 'gear') return true; return false; };
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const rawMat = new THREE.ShaderMaterial({ uniforms: { map: { value: raw } }, side: THREE.DoubleSide, vertexShader: VS, fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }' });
const greyMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: VS, fragmentShader: 'void main(){ gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0); }' });
const depthMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: VS, fragmentShader: 'void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }' });
// the views see the body and the closed payload bay doors; the landing gear (down in the scan) is left out
const scene = new THREE.Scene();
const shown = meshes.filter(m => !inGear(m)).map(m => { const c = new THREE.Mesh(m.geometry, rawMat); c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); c.userData.scan = m.material === scanMat; scene.add(c); return c; });
scene.updateMatrixWorld(true);
const box = new THREE.Box3(); for (const c of shown) box.expandByObject(c);
// a view: the direction toward the camera and the screen's up; screen right is up × direction
const VIEWS = { left: [[-1, 0, 0], [0, 0, 1]], right: [[1, 0, 0], [0, 0, 1]], top: [[0, 0, 1], [0, 1, 0]], bottom: [[0, 0, -1], [0, 1, 0]] };
function viewCam(name, pxPerM) {
  const d = new THREE.Vector3(...VIEWS[name][0]), up = new THREE.Vector3(...VIEWS[name][1]), right = new THREE.Vector3().crossVectors(up, d);
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, d0 = Infinity, d1 = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z), a = p.dot(right), b = p.dot(up), e = p.dot(d);
    r0 = Math.min(r0, a); r1 = Math.max(r1, a); u0 = Math.min(u0, b); u1 = Math.max(u1, b); d0 = Math.min(d0, e); d1 = Math.max(d1, e);
  }
  const w = Math.round((r1 - r0) * pxPerM), h = Math.round((u1 - u0) * pxPerM), far = d1 - d0 + 2;
  // looking at the origin along −d, the camera's x and y are a point's p·right and p·up: the frustum is the box on screen
  const cam = new THREE.OrthographicCamera(r0, r0 + w / pxPerM, u0 + h / pxPerM, u0, 0.01, far);
  cam.up.copy(up); cam.position.copy(d).multiplyScalar(d1 + 1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  return { cam, w, h, right: right.toArray(), up: up.toArray(), dir: d.toArray(), r0, u0, pxPerM, near: 0.01, far };
}
// (with another colour map: url, for checking a repainted one)
window.viewWith = async (url, name, pxPerM) => {
  const t = await loadTex(url); t.flipY = false; t.needsUpdate = true; rawMat.uniforms.map.value = t;
  const r = window.view(name, pxPerM); rawMat.uniforms.map.value = raw; t.dispose(); return r;
};
window.view = (name, pxPerM) => {
  const V = viewCam(name, pxPerM);
  R.setSize(V.w, V.h, false); for (const c of shown) c.material = c.userData.scan ? rawMat : greyMat;
  R.render(scene, V.cam);
  const { cam, ...meta } = V;
  return { png: R.domElement.toDataURL('image/png'), meta };
};
function depthOf(name, pxPerM) {
  const V = viewCam(name, pxPerM);
  const rt = new THREE.WebGLRenderTarget(V.w, V.h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  for (const c of shown) c.material = depthMat;
  R.setRenderTarget(rt); R.setClearColor(0xffffff, 1); R.clear(); R.render(scene, V.cam); R.setRenderTarget(null); R.setClearColor(0x000000, 0);
  return { ...V, rt };
}
// The bake. Each texel of the map is drawn at its place in UV space and looks itself up in the repainted views: where its
// surface point faces a view, is the nearest surface there (not hidden behind another) and the view's paint covers it,
// it takes the view's colour (the view that faces it most squarely wins). Texels no view repaints keep their colour.
const texLoader = new THREE.TextureLoader();
const loadTex = url => new Promise((ok, no) => texLoader.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; ok(t); }, undefined, no));
const MAXV = 4, idx = f => Array.from({ length: MAXV }, (_, k) => f(k)).join(' ');
const bakeMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { map: { value: raw }, uN: { value: 0 }, uVP: { value: Array.from({ length: MAXV }, () => new THREE.Matrix4()) }, uDir: { value: Array.from({ length: MAXV }, () => new THREE.Vector3()) },
    uDepth: { value: Array(MAXV).fill(null) }, uEdit: { value: Array(MAXV).fill(null) }, uEps: { value: Array(MAXV).fill(0) }, uFace: { value: 0.12 } },
  vertexShader: `varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;
void main(){ vUv = uv; vPos = (modelMatrix * vec4(position, 1.0)).xyz; vNrm = normalize(mat3(modelMatrix) * normal); gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D map; uniform int uN; uniform mat4 uVP[${MAXV}]; uniform vec3 uDir[${MAXV}]; uniform sampler2D uDepth[${MAXV}]; uniform sampler2D uEdit[${MAXV}]; uniform float uEps[${MAXV}]; uniform float uFace;
varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;
vec4 dep(int k, vec2 s){ ${idx(k => `if (k == ${k}) return texture2D(uDepth[${k}], s);`)} return vec4(1.0); }
vec4 edt(int k, vec2 s){ ${idx(k => `if (k == ${k}) return texture2D(uEdit[${k}], s);`)} return vec4(0.0); }
void main(){
  vec3 base = texture2D(map, vUv).rgb, col = base, n = normalize(vNrm); float best = 0.0;
  for (int k = 0; k < ${MAXV}; k++) { if (k >= uN) break;
    vec4 c = uVP[k] * vec4(vPos, 1.0); vec2 s = c.xy * 0.5 + 0.5; float z = c.z * 0.5 + 0.5;
    if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) continue;
    float f = dot(n, uDir[k]); if (f < uFace || z > dep(k, s).r + uEps[k]) continue;
    vec4 e = edt(k, s); if (e.a <= 0.0 || f <= best) continue;
    best = f; col = mix(base, e.rgb, e.a);
  }
  gl_FragColor = vec4(col, 1.0);
}` });
const bakeScene = new THREE.Scene(), bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
for (const m of meshes.filter(m => m.material === scanMat && !inGear(m))) { const c = new THREE.Mesh(m.geometry, bakeMat); c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); c.frustumCulled = false; bakeScene.add(c); }
bakeScene.updateMatrixWorld(true);
// edits: [{ view, pxPerM, url }], each an RGBA image of that view: the new colours, and in alpha where they apply. (The
// landing gear, which no view sees, is not drawn: its texels keep their colour.)
window.bake = async edits => {
  const U = bakeMat.uniforms, rts = []; U.uN.value = edits.length;
  for (let k = 0; k < edits.length; k++) {
    const e = edits[k], D = depthOf(e.view, e.pxPerM); rts.push(D.rt);
    U.uVP.value[k].multiplyMatrices(D.cam.projectionMatrix, D.cam.matrixWorldInverse); U.uDir.value[k].set(...D.dir);
    U.uDepth.value[k] = D.rt.texture; U.uEdit.value[k] = await loadTex(e.url); U.uEps.value[k] = 0.04 / (D.far - D.near); // 4 cm
  }
  for (let k = edits.length; k < MAXV; k++) { U.uDepth.value[k] = U.uDepth.value[0]; U.uEdit.value[k] = U.uEdit.value[0]; }
  const { width: w, height: h } = scanMat.map.image; R.setSize(w, h, false); R.setClearColor(0x000000, 0); R.clear();
  R.render(bakeScene, bakeCam); // alpha marks the texels a triangle covers
  for (const rt of rts) rt.dispose(); for (const t of U.uEdit.value) if (t) t.dispose();
  return R.domElement.toDataURL('image/png');
};
// The NASA logotype ("worm", 1975–1992), from Simple Icons (CC0; drawn after NASA's public-domain artwork).
const WORM = 'M4.344 13.598c.075.281.195.39.407.39.22 0 .335-.132.335-.39V8.804h1.379v4.794c0 .675-.088.968-.43 1.31-.247.248-.703.439-1.278.439-.464 0-.909-.154-1.192-.438-.249-.25-.386-.505-.599-1.311l-.846-3.196c-.074-.281-.194-.39-.406-.39-.22 0-.336.132-.336.39v4.794H0v-4.794c0-.675.088-.968.43-1.31.247-.248.703-.439 1.278-.439.464 0 .909.154 1.192.438.249.25.385.505.599 1.311zM22.575 15.196l-1.591-4.98a.415.415 0 00-.06-.132.226.226 0 00-.186-.082.226.226 0 00-.185.082.414.414 0 00-.06.132l-1.591 4.98h-1.425l1.739-5.44c.09-.283.22-.524.384-.684.282-.275.614-.419 1.138-.419.525 0 .857.144 1.139.42.164.16.294.4.384.683L24 15.196h-1.425zM15.531 15.196c.903 0 1.344-.192 1.692-.538.385-.383.569-.802.569-1.427 0-.553-.202-1.064-.51-1.37-.403-.4-.903-.527-1.719-.527h-1.142c-.436 0-.61-.053-.748-.188-.094-.093-.139-.23-.139-.393 0-.168.04-.334.156-.448.103-.1.243-.147.511-.147h3.301V8.804h-3.049c-.903 0-1.343.192-1.691.538-.385.383-.57.802-.57 1.427 0 .553.203 1.064.51 1.37.404.4.904.527 1.72.527h1.141c.437 0 .61.053.748.188.095.093.14.23.14.393 0 .169-.041.335-.157.448-.102.1-.242.147-.51.147h-3.405l-1.306-4.086c-.09-.283-.22-.524-.384-.684-.282-.275-.615-.419-1.139-.419s-.857.144-1.138.42c-.165.16-.294.4-.385.683l-1.738 5.44h1.424l1.592-4.98a.415.415 0 01.06-.132.226.226 0 01.185-.082c.082 0 .142.028.186.082a.413.413 0 01.06.132l1.591 4.98h4.144z';
const WORM_BOX = [0, 8.804, 24, 15.196]; // its extent in the path's units
window.worm = px => {
  const s = px / (WORM_BOX[3] - WORM_BOX[1]), pad = 4, c = document.createElement('canvas');
  c.width = Math.ceil((WORM_BOX[2] - WORM_BOX[0]) * s) + 2 * pad; c.height = Math.ceil(px) + 2 * pad;
  const g = c.getContext('2d'); g.translate(pad - WORM_BOX[0] * s, pad - WORM_BOX[1] * s); g.scale(s, s); g.fillStyle = '#000'; g.fill(new Path2D(WORM));
  return c.toDataURL('image/png');
};
window.ready = { box: [box.min.toArray(), box.max.toArray()], map: [scanMat.map.image.width, scanMat.map.image.height] };
