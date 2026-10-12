#!/bin/bash
# frames where the picture changes abruptly (scene score above a threshold): pops, flicker, jumps
f=$1; th=${2:-0.03}
ffmpeg -hide_banner -nostats -i "$f" -vf "scale=480:-1,select='gt(scene,$th)',metadata=print:key=lavfi.scene_score" -an -f null - 2>&1 | grep -oE "pts_time:[0-9.]+|scene_score=[0-9.]+" | paste - - | awk '{printf "%s %s\n", $1, $2}' | head -20
