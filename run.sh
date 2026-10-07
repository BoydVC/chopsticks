#!/usr/bin/env bash
# Start Chopsticks on :4242 in the background (idempotent). Rebuilds web/game.js if node is available.
cd "$(dirname "$0")"
PORT=${PORT:-4242}
if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then echo "Chopsticks already running: http://127.0.0.1:$PORT"; exit 0; fi
[ -f web/game.js ] || node build.mjs
mkdir -p data
setsid nohup python3 server.py > data/server.log 2>&1 &
for i in $(seq 1 20); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
echo "Chopsticks started: http://127.0.0.1:$PORT"
