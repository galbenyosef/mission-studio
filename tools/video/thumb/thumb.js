// Renders the two thumbnails (1280×720) from thumb.html with the text for each language.
const { launch } = require('../browser.js');
const path = require('path');
const T = {
  ko: { kicker: 'STS-31 · 디스커버리호 · 1990', head: '우주왕복선과<br>함께 잠들기', sub: '허블 우주망원경 배치 임무 시뮬레이션', badges: ['30분', '저주파 배경음악', '수면 유도', '말소리 없음'] },
  en: { kicker: 'STS-31 · Discovery · 1990', head: 'Fall asleep<br>with the<br>Space Shuttle', sub: 'Hubble Space Telescope deploy · mission simulation', badges: ['30 min', 'Low-frequency music', 'Sleep aid', 'No talking'] },
};
(async () => {
  const b = await launch();
  for (const lang of ['ko', 'en']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.join(__dirname, 'thumb.html') + '?lang=' + lang);
    await p.evaluate(t => window.fill(t), T[lang]);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, `thumb_${lang}@2x.png`) });
    await p.close();
  }
  await b.close();
})();
