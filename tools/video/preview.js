// A short preview of the storyboard: a few moments of the film, cut from the full scenes (same cameras and captions).
const S = require('./scenes.js');
const cut = (id, a, b, nid) => Object.assign({}, S.scenes.find(s => s.id === id), { id: nid, range: [a, b] });
module.exports = {
  mission: S.mission, xfade: 2,
  scenes: [cut('s01_pad', 2, 17, 'p1_title'), cut('s02_liftoff', 36, 56, 'p2_liftoff'), cut('s07_doors', 142, 162, 'p3_sunrise'),
    cut('s13_release', 18, 36, 'p4_release'), cut('s16_landing', 94, 114, 'p5_landing')],
};
