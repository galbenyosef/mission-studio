#!/bin/sh
# The sleep score: 30 minutes synthesised by music.py, then brought to −20 LUFS (true peak −3 dB) by a two-pass loudnorm,
# 48 kHz 24-bit, as mus/music.wav for assemble.js.   sh make_music.sh [seconds]
set -e
cd "$(dirname "$0")"; mkdir -p mus
python3 music.py mus/music_raw.wav "${1:-1800}"
J=$(ffmpeg -hide_banner -nostats -i mus/music_raw.wav -af loudnorm=I=-20:TP=-3:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -c "import json, sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i mus/music_raw.wav -af "loudnorm=I=-20:TP=-3:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" -c:a pcm_s24le mus/music.wav
ffmpeg -hide_banner -nostats -i mus/music.wav -af ebur128=peak=true -f null - 2>&1 | grep -A20 Summary | grep -E "I:|Peak:"
