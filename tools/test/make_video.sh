#!/bin/bash
# Stitch the demo video (1280x720, H.264, captions for muted autoplay):
#   node tools/test/record_zoom.js /tmp/me/zoom && python3 tools/test/compose_zoom.py   -> /tmp/me/video/map
#   node tools/test/record_video.js 3d /tmp/me/video 24                                  -> /tmp/me/video/3d
#   tools/test/make_video.sh [frameDir=/tmp/me/video] [out=/tmp/me/middle-earth-demo.mp4]
set -euo pipefail
D=${1:-/tmp/me/video}; OUT=${2:-/tmp/me/middle-earth-demo.mp4}
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf; FR=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
FPS=24; MAPFPS=24; FPS3D=${FPS3D:-24}
cap() {  # caption $1 shown from $2 to $3 seconds, with fades
  echo "drawtext=fontfile=$F:text='$1':fontsize=34:fontcolor=white:borderw=0:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=h-110:alpha='if(lt(t,$2),0,if(lt(t,$2+0.4),(t-$2)/0.4,if(lt(t,$3-0.4),1,if(lt(t,$3),($3-t)/0.4,0))))'"
}
# 1. the map: map mode, satellite, the zoom into Minas Tirith, then a short hold on the last frame
ffmpeg -y -loglevel error -framerate $MAPFPS -i "$D/map/%05d.png" \
  -vf "fps=$FPS,format=yuv420p" -c:v libx264 -crf 14 -preset fast /tmp/me/seg1raw.mp4
L1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/me/seg1raw.mp4)
ffmpeg -y -loglevel error -i /tmp/me/seg1raw.mp4 \
  -vf "$(cap 'A Google Maps of Middle-earth' 0.3 3.0),$(cap 'Satellite imagery generated from the terrain' 3.4 7.6),$(cap 'Zoom all the way into Minas Tirith' 8.0 $(awk "BEGIN{print $L1-0.3}")),format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -r $FPS /tmp/me/seg1.mp4
# 2. the 3D view: low-fps frames, motion-interpolated to 24 fps
ffmpeg -y -loglevel error -framerate $FPS3D -i "$D/3d/%05d.png" \
  -vf "$( [ "$FPS3D" = "$FPS" ] && echo "fps=$FPS" || echo "minterpolate=fps=$FPS:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"),$(cap '3D landmarks on the real terrain' 0.5 4.5),$(cap 'Free and open source - runs in your browser' 5.5 10.0),format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -r $FPS /tmp/me/seg2.mp4
# 3. end card
ffmpeg -y -loglevel error -f lavfi -i "color=c=0x14181c:s=1280x720:d=3:r=$FPS" \
  -vf "drawtext=fontfile=$F:text='Middle-earth Maps':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=h/2-90,drawtext=fontfile=$FR:text='peymvn.github.io/middle-earth-interactive-map':fontsize=32:fontcolor=0xd8c27a:x=(w-text_w)/2:y=h/2+10,drawtext=fontfile=$FR:text='Free, open source, no login':fontsize=26:fontcolor=0xb0b6bc:x=(w-text_w)/2:y=h/2+70,fade=t=in:st=0:d=0.5,format=yuv420p" \
  -c:v libx264 -crf 18 /tmp/me/seg3.mp4
# crossfades between the parts
L2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/me/seg2.mp4)
O1=$(awk "BEGIN{print $L1-0.6}"); O2=$(awk "BEGIN{print $O1+$L2-0.6}")
ffmpeg -y -loglevel error -i /tmp/me/seg1.mp4 -i /tmp/me/seg2.mp4 -i /tmp/me/seg3.mp4 \
  -filter_complex "[0][1]xfade=transition=fade:duration=0.6:offset=$O1[a];[a][2]xfade=transition=fade:duration=0.6:offset=$O2,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 20 -preset slow -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
