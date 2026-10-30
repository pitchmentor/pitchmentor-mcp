#!/usr/bin/env bash
# Fails unless package.json's version equals $1 (e.g. 0.1.1 or v0.1.1).
set -euo pipefail
cd "$(dirname "$0")/.."
want="${1#v}"
[[ "$want" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+].*)?$ ]] || { echo "usage: $0 <version>" >&2; exit 2; }
have="$(node -p "require('./package.json').version")"
[[ "$have" == "$want" ]] || { echo "version mismatch: package.json is '$have', expected '$want'" >&2; exit 1; }
