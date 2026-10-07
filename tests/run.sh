#!/usr/bin/env bash
cd "$(dirname "$0")/.." && ./run.sh >/dev/null && node tests/smoke.mjs
