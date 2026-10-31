#!/usr/bin/env bash
# Stamps a build into static/ before deploy (run by CI; never needed locally).
#   1. writes static/version.js  (shown in the footer)
#   2. appends ?v=<sha> to every local .js/.css reference in index.html so the
#      files can be cached "immutable" (see static/_headers): a new deploy means
#      new URLs, so browsers never mix a new index.html with an old app.js.
# Usage: scripts/stamp-version.sh <sha> [static-dir]
set -euo pipefail
sha="${1:?usage: stamp-version.sh <sha> [static-dir]}"
dir="${2:-static}"
sha="${sha:0:7}"
printf 'window.APP_VERSION = { sha: "%s", date: "%s" };\n' "$sha" "$(date -u +%F)" > "$dir/version.js"
# Idempotent: the pattern excludes '?', so already-stamped references are skipped.
V="$sha" perl -pi -e 's{(src|href)="([A-Za-z0-9_./-]+\.(?:js|css))"}{$1="$2?v=$ENV{V}"}g' "$dir/index.html"
echo "stamped build $sha"
