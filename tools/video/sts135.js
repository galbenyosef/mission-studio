// STS-135 (Atlantis, the last Space Shuttle flight, to the International Space Station), 8–21 July 2011, as a five-minute
// highlight film. Same format as scenes.js: time: [[τ, MET (s from liftoff)] …]; cameras: see vidlib.js; captions in
// Korean (text) and English (en); chapter / chapterEn start the file's chapters.
const M = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
const XF = 1.5; // s of crossfade between scenes: quicker than the sleep film's
module.exports = {
  mission: 'sts135', xfade: XF, film: true, grain: false, // the app's film look (bloom, highlight roll-off, vignette), without grain
  title: 'STS-135 아틀란티스 · 우주왕복선의 마지막 비행', titleEn: 'STS-135 Atlantis · The last flight of the Space Shuttle',
  music: 'original score, CC0',
  timeline: {
    events: [['s02_liftoff', 0], ['s03_ascent', 122], ['s04_etsep', M(0, 8, 42)], ['s06_rpm', M(46, 36, 16)], ['s07_dock', M(47, 38, 11)],
      ['s09b_mplm', M(68, 0, 56)], ['s10_undock', M(254, 56, 41)], ['s12_deorbit', M(305, 20, 59)], ['s14_landing', M(306, 29, 39)]],
    phases: [['s01_pad', '발사', 'Launch'], ['s05_doors', '랑데부', 'Rendezvous'], ['s07_dock', '국제우주정거장', 'At the station'], ['s12_deorbit', '귀환', 'Return']],
  },
  scenes: [
    { id: 's01_pad', chapter: '발사대', chapterEn: 'On the pad', dur: 22, fps: 24, aa: true, time: [[0, -60], [22, -12]],
      cam: { type: 'chase', az: [[0, -40], [22, -14]], el: [[0, 4], [22, 8]], dist: [[0, 330], [22, 270]], aimUp: 32, lens: 35 },
      captions: [{ at: 2.5, dur: 8.5, text: 'STS-135 · 아틀란티스호\\N2011년 7월 8일, 케네디 우주센터 39A 발사대', en: 'STS-135 · Space Shuttle Atlantis\\NJuly 8, 2011 · Launch Pad 39A, Kennedy Space Center' },
        { at: 12.5, dur: 7.5, text: '우주왕복선의 135번째, 마지막 비행', en: 'The 135th and last flight of the Space Shuttle' }] },
    { id: 's02_liftoff', chapter: '발사', chapterEn: 'Liftoff', dur: 24, fps: 24, aa: true, time: [[0, -8], [24, 16]],
      cam: { type: 'ground', site: 'launch', e: 1.2, n: -3.4, lookUp: [[0, 28], [9, 28], [24, -60]], fitSize: [[0, 62], [9, 62], [24, 160]], fitFrac: 0.3, lensMax: 1200 },
      captions: [{ at: 8.5, dur: 5, text: '발사', en: 'Liftoff' }] },
    { id: 's03_ascent', chapter: '상승', chapterEn: 'Ascent', dur: 20, fps: 24, aa: true, time: [[0, 40], [16, 122], [20, 134]],
      cam: { type: 'chase', az: [[0, 195], [20, 215]], el: [[0, 8], [20, 12]], dist: [[0, 220], [20, 170]], aimFwd: 18, lens: 35 },
      captions: [{ at: 14.5, dur: 4, text: '고체 로켓 부스터 분리', en: 'Solid rocket booster separation' }] },
    { id: 's04_etsep', dur: 20, fps: 24, time: [[0, M(0, 8, 36)], [20, M(0, 9, 34)]],
      cam: { type: 'lvlh', aimDrawn: true, off: [[0, [-50, 70, 12]], [20, [-75, 105, 26]]], at: [[0, [0, 0, 8]], [20, [0, 0, 24]]], up: [0, 0, 1], lens: 32 },
      captions: [{ at: 3, dur: 6, text: '외부 연료탱크 분리', en: 'External tank separation' }] },
    { id: 's05_doors', chapter: '궤도', chapterEn: 'In orbit', dur: 16, fps: 24, time: [[0, M(1, 24, 40)], [16, M(1, 28, 40)]],
      cam: { type: 'body', off: [[0, [3, 27, 15]], [16, [4, 25, 16]]], at: [[0, [0, 4, 0]], [16, [0, 3, 0]]], up: [0, 0, 1], lens: 24 },
      captions: [{ at: 3.5, dur: 9, text: '화물칸 문이 열리고, 안에는 보급 모듈 라파엘로', en: 'The bay doors open on the Raffaello supply module' }] },
    { id: 's06_rpm', chapter: '랑데부', chapterEn: 'Rendezvous', dur: 24, fps: 24, time: [[0, M(46, 34)], [24, M(46, 40, 20)]], // ends before the station goes into Earth's shadow
      cam: { type: 'lvlh', off: [[0, [-150, 200, -30]], [24, [-135, 205, -28]]], at: [[0, [0, 0, 80]], [24, [0, 0, 80]]], up: [0, 0, 1], lens: 28 },
      captions: [{ at: 3, dur: 8, text: '정거장 아래 180 m에서 뒤로 한 바퀴', en: 'A backflip 180 m below the station' },
        { at: 12.5, dur: 8.5, text: '정거장 승무원이 배 아래 열 차폐 타일을 촬영한다', en: 'so the station crew can photograph its heat-shield tiles' }] },
    { id: 's07_dock', chapter: '도킹', chapterEn: 'Docking', dur: 26, fps: 24, time: [[0, M(47, 33)], [19, M(47, 38, 11)], [26, M(47, 38, 55)]],
      cam: { type: 'lvlh', target: 'iss', off: [[0, [70, 80, 20]], [26, [59, 69, 18]]], at: [[0, [30, 0, 0]], [26, [28, 0, 0]]], up: [0, 0, 1], lens: 28 },
      captions: [{ at: 18.6, dur: 5.9, text: '도킹 — 7월 10일', en: 'Docking — July 10' }] },
    { id: 's08_station', dur: 18, fps: 24, time: [[0, M(47, 50)], [18, M(47, 50, 36)]],
      cam: { type: 'lvlh', target: 'iss', off: [[0, [-70, 105, 45]], [18, [-47, 111, 40]]], at: [[0, [5, 0, -6]], [20, [5, 0, -6]]], up: [0, 0, 1], lens: 24 },
      captions: [{ at: 3, dur: 9, text: '아틀란티스와 국제우주정거장, 고도 약 390 km', en: 'Atlantis and the International Space Station, 390 km up' }] },
    { id: 's09a_bay', chapter: '라파엘로', chapterEn: 'Raffaello', dur: 12, fps: 24, time: [[0, M(68, 0, 56) - 900], [12, M(68, 0, 56) - 840]],
      cam: { type: 'body', off: [[0, [9, -9, 13]], [12, [8, -7, 13]]], at: [[0, [0, 6, 1]], [12, [0, 7, 1]]], up: [0, 0, 1], lens: 24 },
      captions: [{ at: 2, dur: 8, text: '정거장의 로봇 팔이 라파엘로를 꺼내 하모니 모듈에 붙인다', en: 'The station’s arm lifts Raffaello out and berths it to Harmony' }] },
    { id: 's09b_mplm', dur: 14, fps: 24, time: [[0, M(68, 56)], [14, M(68, 56, 40)]], // the next sunrise, the Sun low ahead lighting Harmony
      cam: { type: 'lvlh', target: 'iss', off: [[0, [60, 45, -35]], [14, [58, 50, -32]]], at: [[0, [15, 0, -5]], [14, [15, 0, -5]]], up: [0, 0, 1], lens: 28 },
      captions: [{ at: 2, dur: 9, text: '셔틀이 은퇴한 뒤의 1년을 버틸 보급품 약 4 t', en: 'About 4 t of supplies, to last a year after the Shuttle retires' }] },
    { id: 's10_undock', chapter: '분리', chapterEn: 'Undocking', dur: 18, fps: 24, time: [[0, M(255, 21, 30)], [18, M(255, 29)]], // undocked in Earth's shadow: back in sunlight, already flying round
      cam: { type: 'lvlh', target: 'iss', off: [[0, [-160, 230, 90]], [18, [-130, 240, 80]]], at: [[0, [0, 0, 0]], [18, [0, 0, 0]]], up: [0, 0, 1], lens: 24 },
      captions: [{ at: 3, dur: 6, text: '분리 — 7월 19일', en: 'Undocking — July 19' }] },
    { id: 's11_flyaround', dur: 24, fps: 24, time: [[0, M(255, 29)], [24, M(256, 16)]],
      cam: { type: 'body', off: [0, 8, 6], at: [0, 8, 60], up: [0, 1, 0], lens: 28 },
      captions: [{ at: 3, dur: 9, text: '마지막으로 정거장을 한 바퀴 돈다', en: 'One last lap around the station' }] },
    { id: 's12_deorbit', chapter: '귀환', chapterEn: 'Return', dur: 14, fps: 24, time: [[0, M(305, 20, 50)], [14, M(305, 22, 30)]],
      cam: { type: 'chase', az: [[0, 15], [14, 35]], el: [[0, 16], [14, 12]], dist: [[0, 55], [14, 48]], lens: 35 },
      captions: [{ at: 2, dur: 7, text: '궤도 이탈 분사', en: 'Deorbit burn' }] },
    { id: 's13_entry', dur: 22, fps: 24, time: [[0, M(306, 0)], [22, M(306, 8)]],
      cam: { type: 'chase', az: [[0, 150], [22, 125]], el: [[0, -6], [22, -2]], dist: [[0, 90], [22, 80]], lens: 35 },
      captions: [{ at: 3, dur: 7, text: '대기권 재진입', en: 'Reentry' }] },
    { id: 's14_landing', chapter: '착륙', chapterEn: 'Landing', dur: 26, fps: 24, aa: true, time: [[0, M(306, 29, 10)], [15.5, M(306, 29, 39)], [26, M(306, 29, 58.6)]],
      cam: { type: 'ground', site: 'runway', e: 0.314, n: -1.046, lookUp: 2, fitSize: 37, fitFrac: 0.3, lensMax: 2000 },
      captions: [{ at: 15.6, dur: 8.6, text: '착륙 — 7월 21일 새벽, 케네디 우주센터', en: 'Landing — before dawn on July 21, Kennedy Space Center' }] },
    { id: 's15_rest', chapter: '마지막 바퀴 정지', chapterEn: 'Wheel stop', dur: 22, fps: 24, aa: true, time: [[0, M(306, 30, 36)], [22, M(306, 31, 40)]],
      cam: { type: 'chase', az: [[0, 120], [22, 170]], el: [[0, 6], [22, 9]], dist: [[0, 70], [22, 90]], aimUp: -1.6, lens: 35 },
      captions: [{ at: 2, dur: 8, text: '“바퀴 정지.”', en: '“Wheel stop.”' }, { at: 11, dur: 9, text: '30년, 135번의 비행을 마치고', en: 'After 30 years and 135 flights' }] },
  ],
};
