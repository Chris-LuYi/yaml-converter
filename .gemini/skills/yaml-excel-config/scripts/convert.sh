#!/usr/bin/env bash
# Run yaml-converter with all arguments passed through.
# Prefers a globally installed binary; falls back to npx.
# Override the command with YAML_CONVERTER_CMD (e.g. "bun run /path/to/src/cli.ts").
set -uo pipefail

if [[ -n "${YAML_CONVERTER_CMD:-}" ]]; then
  # shellcheck disable=SC2086
  exec $YAML_CONVERTER_CMD "$@"
elif command -v yaml-converter >/dev/null 2>&1; then
  exec yaml-converter "$@"
elif command -v npx >/dev/null 2>&1; then
  exec npx -y yaml-converter "$@"
else
  echo '{"status":"fatal","error":"yaml-converter not found and npx unavailable. Install Node.js, then: npm install -g yaml-converter"}'
  exit 2
fi
