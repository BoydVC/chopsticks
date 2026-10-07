#!/usr/bin/env bash
cd "$(dirname "$0")"; HERE="$PWD"
for p in $(pgrep -x python3); do [ "$(readlink /proc/$p/cwd)" = "$HERE" ] && tr '\0' ' ' < /proc/$p/cmdline | grep -q server.py && kill "$p" && echo "stopped $p"; done; true
