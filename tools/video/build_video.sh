#!/bin/sh
# A build of Mission Studio for rendering video: the working tree plus hooks for a scripted camera (CAM.videoPose) and the
# internals a renderer needs, exported on window.__ms. Serve it for render.js on port 8815:
#   sh tools/video/build_video.sh && python3 -m http.server -d tools/video/build/dist 8815
set -e
HERE=$(cd "$(dirname "$0")" && pwd); R=$(cd "$HERE/../.." && pwd); D=$HERE/build
rm -rf "$D" && mkdir -p "$D" && cp -r "$R/app" "$R/src" "$R/assets" "$R/vendor" "$R/build.js" "$R/package.json" "$D/"
python3 - "$D" <<'PY'
import sys; D = sys.argv[1]
def patch(f, a, b):
    p = D + '/app/' + f; s = open(p).read(); assert s.count(a) == 1, (f, a); open(p, 'w').write(s.replace(a, b))
patch('50_camera.js', "  R.O = P;\n", "  R.O = P;\n  if (CAM.videoPose) { const pose = CAM.videoPose(P, t); if (pose) { setPose(pose); CAM.camDist = pose.camDist || vnorm(pose.pos); return; } } // [video] scripted camera\n")
patch('90_main.js', "window.__ms = { STATE,", "window.__ms = { helio, craftById, poseFor, setPose, groundSite, keepAboveGround, padStandH, EXH, updateExhaust, schedulePlan, bodyQuat, STATE,")
PY
cd "$D" && node build.js | tail -1
