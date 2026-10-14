// ============================================================================
// The real ground round the American launch and landing sites: USGS NAIP aerial photographs (public domain; fetched by
// tools/sites/fetch.mjs into assets/site_<id>.jpg), each a square of the given width centred on the site, draped over
// the sphere a hand above the ground in the planet's mesh frame, so the coast, the lagoons, the roads, the crawlerway,
// the dry lake and the buildings' roofs are there under the pad structures and the runway the app draws. Where a site's
// photograph is present the pad's procedural scrub is left out; where it is missing (or still loading) the scrub stands
// in, as before.
// ============================================================================
const SITE_IMG = {
  ksc: { lat: 28.615, lon: -80.655, km: 16, elev: 0 },
  cape: { lat: 28.53, lon: -80.57, km: 12, elev: 0 },
  starbase: { lat: 25.997, lon: -97.155, km: 8, elev: 0 },
  edwards: { lat: 34.93, lon: -117.85, km: 24, elev: 0.696 },
  whitesands: { lat: 32.99, lon: -106.425, km: 16, elev: 1.193 },
};
const SITES = { patches: [], missing: {} }; // missing[id]: the photograph was asked for and is not there
// the site whose square holds the point (a little inside its edge, so the pad's own ground is not left out when the
// photograph stops just short of it)
function siteImageFor(lat, lon) {
  for (const [id, S] of Object.entries(SITE_IMG)) {
    const dN = (lat - S.lat) * 110.574, dE = (lon - S.lon) * 111.32 * Math.cos(S.lat * DEG), h = S.km / 2 - 0.5;
    if (Math.abs(dN) < h && Math.abs(dE) < h && !SITES.missing[id]) return { id, ...S };
  }
  return null;
}
// one site's photograph on the sphere: a grid of the square at the site's elevation, in the planet's mesh frame (as the
// runway is drawn, app/42_shuttleview.js)
function buildSitePatch(id) {
  const S = SITE_IMG[id], b = R.bodies.earth, Rm = (b.R + S.elev) * 1000 + 0.15, N = 48, L = S.km * 1000;
  const C = meshDir(S.lat, S.lon), { E, N: Nn } = meshEN(S.lat, S.lon);
  const at = (x, y) => vscale(vunit(vadd(vscale(C, b.R * 1000), vadd(vscale(E, x), vscale(Nn, y)))), Rm);
  const Pc = at(0, 0), pos = [], uv = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const p = at(L * (i / N - 0.5), L * (j / N - 0.5)); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); uv.push(i / N, j / N); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, bq = a + 1, c = a + N + 1, d = c + 1; idx.push(a, bq, c, bq, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // the photograph stops at the coast (the sea beyond it is black, no data): those pixels are left out, and the globe's
  // own sea shows through
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <logdepthbuf_fragment>', LOGDEPTH_EXACT).replace('#include <map_fragment>', '#include <map_fragment>\n  if (diffuseColor.r + diffuseColor.g + diffuseColor.b < 0.02) discard;'); };
  mat.customProgramCacheKey = () => 'sitePatch';
  const m = new THREE.Mesh(g, mat);
  m.visible = false;
  R.loader.load(ASSET(`site_${id}.jpg`), t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(16, R.maxAniso || 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m.material.map = t; m.material.needsUpdate = true; m.visible = true; if (MV.pad) MV.pad.traverse(n => { if (n.userData.padGround) n.visible = false; }); }, // the pad's scrub, beach and roads give way to the photograph
    undefined, () => { SITES.missing[id] = true; }); // (no photograph of this site: the procedural ground stays)
  const grp = new THREE.Group(); grp.add(m);
  const k = 1 / (b.R * 1000); grp.position.set(Pc[0] * k, Pc[1] * k, Pc[2] * k); grp.scale.setScalar(k);
  b.mesh.add(grp); SITES.patches.push(grp); return m;
}
// the mission's sites: the launch site and, on a Shuttle flight, the landing runway
function buildSiteImages(md) {
  disposeSiteImages();
  const want = new Set(), S = LAUNCH_SITES[md.cfg.site], rw = md.cfg.runway && RUNWAYS[md.cfg.runway];
  for (const p of [S, rw]) { if (!p) continue; const s = siteImageFor(p.lat, p.lon); if (s) want.add(s.id); }
  for (const id of want) buildSitePatch(id);
}
function disposeSiteImages() {
  for (const g of SITES.patches) { g.parent && g.parent.remove(g); g.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } }); }
  SITES.patches = [];
}
