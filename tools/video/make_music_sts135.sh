#!/bin/sh
# The STS-135 film's score: music_sts135.py, then brought to −16 LUFS (true peak −1.5 dB) by a two-pass loudnorm,
# 48 kHz 24-bit, as mus/sts135.wav for assemble.js --music.   sh make_music_sts135.sh
set -e
cd "$(dirname "$0")"; mkdir -p mus
python3 -I music_sts135.py mus/sts135_raw.wav 302
J=$(ffmpeg -hide_banner -nostats -i mus/sts135_raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -c "import json, sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i mus/sts135_raw.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" -c:a pcm_s24le mus/sts135.wav
ffmpeg -hide_banner -nostats -i mus/sts135.wav -af ebur128=peak=true -f null - 2>&1 | grep -A20 Summary | grep -E "I:|LRA:|Peak:"
