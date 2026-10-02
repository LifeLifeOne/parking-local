#!/usr/bin/env bash
set -euo pipefail
export XDG_DATA_HOME
XDG_DATA_HOME=$(mktemp -d)
export APPIMAGE_EXTRACT_AND_RUN=1
"$1" > "$XDG_DATA_HOME/application.log" 2>&1 &
parking_pid=$!
trap 'kill "$parking_pid" 2>/dev/null || true' EXIT
sleep 10
if ! kill -0 "$parking_pid" 2>/dev/null; then
  cat "$XDG_DATA_HOME/application.log"
  exit 1
fi
python3 scripts/check-installed-data.py "$XDG_DATA_HOME/fr.parking-local.desktop"
