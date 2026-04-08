#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "======================================"
echo " yaml-converter MFE Master Sheet Demo"
echo "======================================"
echo ""

# ── Step 1: YAML → Excel ──────────────────────────────────────────────────────
echo "▶ Step 1: YAML → Excel"
echo "  Input:  demo/data.yaml"
echo "  Output: demo/output.xlsx"
echo ""
bun run dev -- \
  -i demo/data.yaml \
  --schema demo/schema.yaml \
  -o demo/output.xlsx
echo "  Exit code: $?"
echo ""

# ── Step 2: Excel → YAML (round-trip) ────────────────────────────────────────
echo "▶ Step 2: Excel → YAML (round-trip)"
echo "  Input:  demo/output.xlsx"
echo "  Output: demo/roundtrip.yaml"
echo ""
bun run dev -- \
  -i demo/output.xlsx \
  --schema demo/schema.yaml \
  -o demo/roundtrip.yaml
echo "  Exit code: $?"
echo ""

# ── Step 3: Validate only — pass ─────────────────────────────────────────────
echo "▶ Step 3: Validate only (should pass)"
echo "  Input:  demo/data.yaml"
echo ""
bun run dev -- \
  -i demo/data.yaml \
  --schema demo/schema.yaml \
  --validate
echo "  Exit code: $?"
echo ""

# ── Step 4: Validate only — fail ─────────────────────────────────────────────
echo "▶ Step 4: Validate only (should fail — shows errors)"
echo "  Input:  demo/data.invalid.yaml"
echo "  Errors: demo/data.invalid.errors.json"
echo ""
set +e   # allow non-zero exit without aborting script
bun run dev -- \
  -i demo/data.invalid.yaml \
  --schema demo/schema.yaml \
  --validate \
  --json
EXIT_CODE=$?
set -e
echo ""
echo "  Exit code: $EXIT_CODE  (expected: 1)"
echo ""
echo "  Errors file contents:"
cat demo/data.invalid.errors.json
echo ""

echo "======================================"
echo " Demo complete"
echo "======================================"
