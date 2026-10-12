// Stills for the thumbnails: the orbiter holding Hubble over the bay as the Sun sets, the Earth's glowing limb behind it;
// the camera turned toward the nose so the orbiter sits in the left half and the text has the right half.
const M = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
module.exports = { mission: 'sts31', xfade: 2, scenes: [
  { id: 'th_f', dur: 2, fps: 24, aa: true, time: [[0, M(24, 58, 40)], [2, M(24, 58, 50)]], cam: { type: 'body', off: [40, 26, 18], at: [0, 18, -4], up: [0, 0, 1], lens: 21 } },
  { id: 'th_g', dur: 2, fps: 24, aa: true, time: [[0, M(24, 58, 40)], [2, M(24, 58, 50)]], cam: { type: 'body', off: [40, 26, 18], at: [0, 24, -4], up: [0, 0, 1], lens: 22 } },
] };
