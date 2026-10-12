// Joins the rendered clips of a storyboard into the finished film: crossfades between scenes, a fade from and to black,
// the captions burned in, and the music underneath.
//   node assemble.js [--board scenes.js] [--clips clips] [--subs captions.ass] [--music mus/music.wav] [--music-from 0]
//                    [--out sts31.mp4] [--crf 20] [--preset slow] [--fade-in 3] [--fade-out 5] [--chapters] [--lang ko|en]
// --chapters: chapters in the file from the scenes' `chapter` names (each starts where its scene's crossfade is half done).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SB = require(path.resolve(arg('board', path.join(__dirname, 'scenes.js'))));
const CLIPS = arg('clips', path.join(__dirname, 'clips')), SUBS = path.resolve(arg('subs', path.join(__dirname, 'captions.ass')));
const MUSIC = arg('music', path.join(__dirname, 'mus/music.wav')), MFROM = +arg('music-from', 0), OUT = arg('out', path.join(__dirname, 'sts31.mp4')); // the board's title, titleEn and music name the file's metadata
const CRF = arg('crf', '20'), PRESET = arg('preset', 'slow'), FIN = +arg('fade-in', 3), FOUT = +arg('fade-out', 5), XF = SB.xfade || 0;
const len = sc => sc.range ? sc.range[1] - sc.range[0] : sc.dur, LANG = arg('lang', 'ko');

const sc = SB.scenes, n = sc.length, inputs = [], fg = [];
// holdStart: n replaces a scene's first n frames with its n-th (a camera that settles in its first frames)
sc.forEach((s, i) => { const f = path.join(CLIPS, s.id + '.mp4'); if (!fs.existsSync(f)) throw new Error('missing clip ' + f); inputs.push('-i', f);
  const hold = s.holdStart ? `trim=start_frame=${s.holdStart},setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=${(s.holdStart / s.fps).toFixed(4)},` : '';
  fg.push(`[${i}:v]${hold}settb=AVTB,setpts=PTS-STARTPTS[c${i}]`); });
let prev = 'c0', T = len(sc[0]);
for (let i = 1; i < n; i++) { // each crossfade starts XF before the end of what has been joined so far
  const o = T - XF; fg.push(`[${prev}][c${i}]xfade=transition=fade:duration=${XF}:offset=${o.toFixed(3)}[x${i}]`); prev = `x${i}`; T = o + len(sc[i]);
}
fg.push(`[${prev}]fade=t=in:st=0:d=${FIN},fade=t=out:st=${(T - FOUT).toFixed(3)}:d=${FOUT},ass=${SUBS}[vout]`);
inputs.push('-ss', String(MFROM), '-i', MUSIC);
let chap = [];
if (process.argv.includes('--chapters')) { // FFMETADATA chapters, from the scene starts on the joined timeline
  let s0 = 0; const starts = sc.map((s, i) => { const a = s0; s0 += len(s) - XF; return a; });
  sc.forEach((s, i) => { if (s.chapter) chap.push({ t: i ? starts[i] + XF / 2 : 0, title: LANG === 'en' ? s.chapterEn : s.chapter }); });
  const meta = [';FFMETADATA1', ...chap.map((c, k) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.t * 1000)}\nEND=${Math.round((k + 1 < chap.length ? chap[k + 1].t : T) * 1000)}\ntitle=${c.title}`)].join('\n') + '\n';
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT + '.chapters.txt', meta); inputs.push('-i', OUT + '.chapters.txt');
  chap.forEach(c => console.log(`  ${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')} ${c.title}`));
}
fg.push(`[${n}:a]atrim=0:${T.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${MFROM ? 2 : 0.01},afade=t=out:st=${(T - FOUT - 1).toFixed(3)}:d=${FOUT + 1}[aout]`);
const args = ['-y', '-hide_banner', '-loglevel', 'error', '-stats', ...inputs, '-filter_complex', fg.join(';'), '-map', '[vout]', '-map', '[aout]',
  ...(chap.length ? ['-map_metadata', String(n + 1), '-map_chapters', String(n + 1)] : []),
  '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-tune', 'film', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p', '-r', '24',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', T.toFixed(3), '-movflags', '+faststart',
  '-metadata', 'title=' + (LANG === 'en' ? SB.titleEn || 'STS-31 Discovery · Deploying the Hubble Space Telescope' : SB.title || 'STS-31 디스커버리호 · 허블 우주망원경 배치'),
  '-metadata', `comment=Rendered with Mission Studio. Music: ${SB.music || 'original ambient score, CC0'}.`, '-metadata:s:a:0', `language=${LANG === 'en' ? 'eng' : 'kor'}`,
  OUT + '.part.mp4'];
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
console.log(`${n} scenes, ${T.toFixed(1)} s → ${OUT}`);
const t0 = Date.now(), r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status) process.exit(r.status);
fs.renameSync(OUT + '.part.mp4', OUT);
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
