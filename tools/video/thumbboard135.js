// The still for the STS-135 thumbnails: Atlantis docked to the station, seen ahead of it in sunlight with the Earth's limb
// below, the orbiter in the left half so that the text has the right half.
const M = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
module.exports = { mission: 'sts135', xfade: 2, film: true, grain: false, scenes: [
  { id: 'th135', dur: 2, fps: 24, aa: true, time: [[0, M(47, 52)], [2, M(47, 52, 4)]], cam: { type: 'lvlh', target: 'iss', off: [95, 35, 8], at: [22.7, 13.7, -3], up: [0, 0, 1], lens: 30 } },
] };
