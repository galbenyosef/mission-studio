# Video tools

How the 30-minute STS-31 film (Discovery deploys the Hubble Space Telescope, a sleep video with Korean and English
versions) and the five-minute STS-135 highlight film were made from Mission Studio: a build of the app with a scripted
camera, a storyboard of scenes, a renderer that steps the simulation frame by frame and pipes JPEGs into ffmpeg, an
original score, captions with an event timeline, and the final assembly. Nothing here is part of the app; the app itself is unchanged by these tools.

| File | What it does |
|---|---|
| `build_video.sh` | Copies the app into `build/`, adds a camera hook (`CAM.videoPose`) and exports internals on `window.__ms`, builds `build/dist` |
| `vidlib.js` | Injected into the page: per-scene time map (τ → mission time), camera types (`chase`, `ground`, `body`, `lvlh`), lens fitting, one frame on demand |
| `scenes.js` | The storyboard: 17 scenes (time keys, cameras, captions in Korean and English, chapters) and the event timeline |
| `render.js` | Renders the scenes to clips (`clips/<id>.mp4`), or `--stills N` per scene to check a storyboard; resumes after an interruption |
| `preview.js`, `thumbboard.js` | Other boards: an 85-second preview cut from the scenes, the stills behind the thumbnails |
| `subs.js` | Captions as ASS on the film's timeline (crossfades accounted for); `--timeline` adds the event timeline, `--lang en` the English text |
| `music.py`, `make_music.sh` | The score, synthesised from nothing (pads in D♭ major, a drone, soft bells, breath, a hall), CC0; normalised to −20 LUFS |
| `assemble.js` | Joins the clips (2-second crossfades, fade in and out), burns in the captions, adds the music and chapters |
| `thumb/` | `thumb.html` + `thumb.js`: the 1280×720 thumbnails (text over `bg.jpg`, a still from `thumbboard.js`) |
| `events.js` | Lists a mission's events with mission times, for placing captions |
| `jumps.sh` | Finds frames where the picture changes abruptly (pops, glitches) in a clip |
| `browser.js` | How the tools launch Chromium (see "Rendering on a Mac") |

## Needs

- Node 22, Python 3 with numpy and scipy, ffmpeg built with libass (Homebrew's is)
- Playwright: `cd tools/video && npm i --no-save playwright`, then `npx playwright install chromium`, or use the installed
  Google Chrome with `MS_CHANNEL=chrome`
- The font Noto Sans CJK KR (DemiLight) for the captions and timeline, or libass falls back to another font

## Making the film

All commands from the repository root.

```sh
sh tools/video/build_video.sh
python3 -m http.server -d tools/video/build/dist 8815 &      # render.js and events.js load the build from here
node tools/video/render.js --stills 3 --out tools/video/stills  # check the storyboard: three stills per scene
node tools/video/render.js                                   # every scene to tools/video/clips/ (resumable)
sh tools/video/make_music.sh                                 # tools/video/mus/music.wav (about 3 minutes)
node tools/video/subs.js --timeline --out tools/video/captions_tl.ass
node tools/video/subs.js --timeline --lang en --out tools/video/captions_en_tl.ass
node tools/video/assemble.js --chapters --crf 20 --preset medium --lang ko --subs tools/video/captions_tl.ass --out tools/video/final/sts31-ko.mp4
node tools/video/assemble.js --chapters --crf 20 --preset medium --lang en --subs tools/video/captions_en_tl.ass --out tools/video/final/sts31-en.mp4
```

`render.js --only s05_etsep,s14_hubble` renders some scenes; scenes marked `aa: true` render with multisampling in a
session of their own. `render.js --film` (or `film: true` in a board) renders with the app's film look: bloom, highlights
that roll off, a vignette and grain. The STS-31 film was made without it. The grain changes every frame and costs a lot
of bitrate (a clip of the runway scene came out twenty times larger); `--no-grain` (or `grain: false`) leaves it out. `subs.js` prints each caption with the mission time it falls on, to check it against `events.js sts31`.

Thumbnails: `node tools/video/render.js --board tools/video/thumbboard.js --stills 1 --w 2560 --h 1440 --out tools/video/thumb/st`
for the still (copy it to `thumb/bg.jpg`), then `node tools/video/thumb/thumb.js` writes `thumb_ko@2x.png` and
`thumb_en@2x.png`; scale them to 1280×720 with `ffmpeg -i thumb_ko@2x.png -vf scale=1280:720:flags=lanczos thumb_ko.jpg`.

## The STS-135 film

A five-minute highlight film of STS-135 (Atlantis, the last Space Shuttle flight, to the International Space Station),
with Korean and English versions, made with the same tools from its own board and score:

| File | What it does |
|---|---|
| `sts135.js` | The board: 16 scenes from the pad to wheel stop, 1.5-second crossfades, the app's film look without grain, captions in Korean and English, the event timeline |
| `music_sts135.py`, `make_music_sts135.sh` | Its score, synthesised from nothing like the sleep film's, CC0: D major at 96 beats a minute, its bars laid so that liftoff and touchdown fall on downbeats; normalised to −16 LUFS (`mus/sts135.wav`) |

```sh
sh tools/video/build_video.sh
python3 -m http.server -d tools/video/build/dist 8815 &
node tools/video/render.js --board tools/video/sts135.js --stills 2 --out tools/video/stills135
node tools/video/render.js --board tools/video/sts135.js --out tools/video/clips135
sh tools/video/make_music_sts135.sh
node tools/video/subs.js --board tools/video/sts135.js --timeline --out tools/video/captions135_tl.ass
node tools/video/subs.js --board tools/video/sts135.js --timeline --lang en --out tools/video/captions135_en_tl.ass
node tools/video/assemble.js --board tools/video/sts135.js --clips tools/video/clips135 --music tools/video/mus/sts135.wav --chapters --crf 20 --preset medium --fade-in 1.5 --fade-out 4 --lang ko --subs tools/video/captions135_tl.ass --out tools/video/final/sts135-ko.mp4
node tools/video/assemble.js --board tools/video/sts135.js --clips tools/video/clips135 --music tools/video/mus/sts135.wav --chapters --crf 20 --preset medium --fade-in 1.5 --fade-out 4 --lang en --subs tools/video/captions135_en_tl.ass --out tools/video/final/sts135-en.mp4
```

Scenes are timed to the score: the docking falls on the downbeat where the score turns broad (136 s), the undocking and
the deorbit start where it changes (181 s, 221 s), the touchdown on the last section's downbeat (268.5 s). A board's
`title`, `titleEn` and `music` name the file's metadata. The station is filmed in sunlight: the backflip ends before the
station goes into Earth's shadow, Raffaello is seen on Harmony at the next sunrise, and the undocking scene starts once
Atlantis is back in sunlight, already flying round. Thumbnails: the still from `node tools/video/render.js --board
tools/video/thumbboard135.js --stills 1 --w 2560 --h 1440 --out tools/video/thumb/st135` (Atlantis docked, seen ahead of
the station) goes to `thumb/bg_sts135.jpg`, then `node tools/video/thumb/thumb.js sts135` writes `thumb_sts135_ko@2x.png`
and `thumb_sts135_en@2x.png`.

## Rendering on a Mac

The film was rendered in a cloud container with no GPU, on Mesa's llvmpipe: 0.2–1.3 s a frame at 1920×1080 (the pad and
liftoff scenes with multisampling were the slowest), about five hours for 43,968 frames on two cores. On a Mac
`browser.js` asks ANGLE for Metal so the GPU draws the frames; this has not been tried yet. A first run of
`render.js --stills 3` shows the speed in its log; `MS_CHANNEL=chrome` uses the installed Chrome instead of Playwright's
Chromium, `MS_HEADED=1` opens a window (headless browsers sometimes fall back to software rendering, which a visible
window rules out), and `MS_GL_ARGS` replaces the GL flags.

## Known

- `holdStart: n` in a scene makes `assemble.js` hold its n-th frame over the first n, for a camera that settles in its
  first frames. The film used it for `s17_rest`: at wheel stop the runway slid sideways under the orbiter and the chase
  camera dropped 5.6 m. Mission Studio v1.8.0 fixed both, and the scene no longer holds; its `aimUp` went from 4 to
  −1.6 m because the orbiter's state now stays at its reference point, 5.6 m above the runway, after wheel stop.
- Rendering with a later version of the app changes what some scenes show: from v1.8.0 the entry (`s15_entry`) glows in
  the shock layer under the orbiter's belly instead of in an orange ball and cone round it.
- Captions sit on what the picture shows, which is not always the event's own time: the payload bay doors start to move
  about a minute after the "doors open" event, and the caption follows the doors.
