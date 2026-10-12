// Renders a film's two thumbnails (1280×720) from thumb.html with the text for each language: node thumb.js [sts31|sts135]
// (the background: bg.jpg for STS-31, bg_<film>.jpg for another film)
const { launch } = require('../browser.js');
const path = require('path');
const FILMS = {
  sts31: {
    ko: { kicker: 'STS-31 · 디스커버리호 · 1990', head: '우주왕복선과<br>함께 잠들기', sub: '허블 우주망원경 배치 임무 시뮬레이션', badges: ['30분', '저주파 배경음악', '수면 유도', '말소리 없음'] },
    en: { kicker: 'STS-31 · Discovery · 1990', head: 'Fall asleep<br>with the<br>Space Shuttle', sub: 'Hubble Space Telescope deploy · mission simulation', badges: ['30 min', 'Low-frequency music', 'Sleep aid', 'No talking'] },
  },
  sts135: {
    ko: { kicker: 'STS-135 · 아틀란티스호 · 2011', head: '우주왕복선의<br>마지막 비행', sub: '국제우주정거장 도킹 임무 하이라이트', badges: ['5분', '발사부터 착륙까지', '오리지널 음악', '시뮬레이션'] },
    en: { kicker: 'STS-135 · Atlantis · 2011', head: 'The last flight<br>of the<br>Space Shuttle', sub: 'Docking with the International Space Station', badges: ['5 min', 'Liftoff to wheel stop', 'Original score', 'Simulation'] },
  },
};
const FILM = process.argv[2] || 'sts31', T = FILMS[FILM], BG = FILM === 'sts31' ? 'bg.jpg' : `bg_${FILM}.jpg`, SUF = FILM === 'sts31' ? '' : '_' + FILM;
(async () => {
  const b = await launch();
  for (const lang of ['ko', 'en']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.join(__dirname, 'thumb.html') + '?lang=' + lang + '&bg=' + BG);
    await p.evaluate(t => window.fill(t), T[lang]);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, `thumb${SUF}_${lang}@2x.png`) });
    await p.close();
  }
  await b.close();
})();
