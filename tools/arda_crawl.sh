#!/bin/bash
# Download the Encyclopedia of Arda map entry pages into sources/arda-ref/ (reference only, ~45 MB,
# not stored in git and not redistributed). Used by tools/arda_compare.py.
# The site rate-limits: keep the delay; the script backs off on HTTP 429 and resumes where it stopped.
set -uo pipefail
cd "$(dirname "$0")/../sources" 2>/dev/null || { mkdir -p "$(dirname "$0")/../sources" && cd "$(dirname "$0")/../sources"; }
mkdir -p arda-ref/pages && cd arda-ref
UA="Mozilla/5.0 (middle-earth-interactive-map research)"
[ -s maps_index.html ] || curl -sL -A "$UA" https://www.encyclopedia-of-arda.com/maps.html -o maps_index.html
# entries under the "Maps" heading (before "Illustrations")
python3 - <<'PY'
import re
s = open('maps_index.html', encoding='latin-1').read()
seg = s[s.find('Maps and Illustrations'):]
seg = seg[:seg.find('<h1>Illustrations</h1>')]
links = list(dict.fromkeys(re.findall(r'href="(?:\.\./)?([a-z]/[^"#]+\.html)"', seg)))
open('entries.txt', 'w').write('\n'.join(links) + '\n')
print(len(links), 'entries')
PY
while read -r p; do
  [ -z "$p" ] && continue
  out="pages/${p//\//_}"
  [ -s "$out" ] && ! grep -q "429 Too Many" "$out" && continue
  for try in 1 2 3 4 5; do
    code=$(curl -sL -m 30 -A "$UA" -w "%{http_code}" "https://www.encyclopedia-of-arda.com/$p" -o "$out")
    [ "$code" = "200" ] && break
    echo "$p: HTTP $code, backing off" >&2; rm -f "$out"; sleep $((60 * try))
  done
  sleep 1.5
done < entries.txt
echo "done: $(ls pages | wc -l) pages"
