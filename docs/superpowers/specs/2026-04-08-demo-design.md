# Demo Folder Design

**Date:** 2026-04-08
**Topic:** End-to-end CLI demo using a Module Federation MFE master sheet

## Goal

Add a `demo/` folder that exercises every major CLI feature in a single runnable script, using a realistic MFE master sheet as the domain. The demo serves as both a usage reference and a manual smoke test.

## Files

### `demo/schema.yaml`

Nine columns across three groups:

| Group | Field | Header | Type | Notes |
|---|---|---|---|---|
| App Info | app_name | App Name | string | required |
| App Info | remote_name | Remote Name | string | required |
| App Info | team | Team | string | required |
| Technical | framework | Framework | options | required; React/Vue/Angular/Svelte |
| Technical | host_url | Host URL | string | |
| Technical | port | Dev Port | number | |
| Lifecycle | status | Status | options | required; Active/Deprecated/Beta/Planned |
| Lifecycle | deploy_date | Deploy Date | date | format: YYYY-MM-DD |
| Lifecycle | version | Version | string | |

### `demo/data.yaml`

Five valid MFE rows. Mix of frameworks and statuses; some optional fields (host_url, port, deploy_date, version) omitted on some rows to demonstrate optional handling.

### `demo/data.invalid.yaml`

Three rows with deliberate validation errors:
- Row 1: `status` set to an invalid value not in the options list
- Row 2: `deploy_date` in wrong format (e.g. `15/01/2024` instead of `YYYY-MM-DD`)
- Row 3: `framework` field missing entirely (required field absent)

### `demo/run.sh`

The script is run from the project root via `bun run demo` (which calls `bash demo/run.sh`). All commands inside use `bun run dev --` to invoke the CLI in dev mode, e.g.:

```bash
bun run dev -- -i demo/data.yaml --schema demo/schema.yaml -o demo/output.xlsx
```

The script prints a labeled header before each step and `echo`s the exit code after.

Four labeled steps:

```
Step 1 — YAML → Excel
  Command: bun run dev -- -i demo/data.yaml --schema demo/schema.yaml -o demo/output.xlsx
  Verifies: grouped headers, typed cells, dropdown validation, frozen rows; exit 0

Step 2 — Excel → YAML (round-trip)
  Command: bun run dev -- -i demo/output.xlsx --schema demo/schema.yaml -o demo/roundtrip.yaml
  Verifies: .xlsx extension triggers Excel→YAML direction; dates and types coerced
             correctly; implicit validation pass (no errors file written); exit 0

Step 3 — Validate only (pass)
  Command: bun run dev -- -i demo/data.yaml --schema demo/schema.yaml --validate
  Note:    -o is intentionally omitted; --validate allows this and skips file output
  Verifies: exit 0, no output file written, no errors file written

Step 4 — Validate only (fail)
  Command: bun run dev -- -i demo/data.invalid.yaml --schema demo/schema.yaml --validate --json
  Note:    -o is intentionally omitted (validate-only mode); --json emits structured
           output to stdout for easy inspection
  Verifies: exit 1; errors file written to demo/data.invalid.errors.json (derived from
             input path: strip extension → append .errors.json); JSON summary on stdout
```

## `package.json` change

Add `"demo": "bash demo/run.sh"` to `scripts`.

## What is NOT included

- No automated assertion of Excel cell internals (that is covered by the existing unit tests)
- No new source code changes — demo only exercises the existing CLI
