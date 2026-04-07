# Demo Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `demo/` folder with a realistic MFE master sheet schema, valid and invalid data files, and a shell script that exercises all four major CLI features end-to-end.

**Architecture:** Pure data + shell script — no new source files. The demo uses the existing `bun run dev --` CLI invocation and the existing schema/converter/validator pipeline unchanged. Each step in `run.sh` is independently runnable and prints its own header and exit code.

**Tech Stack:** Bash, YAML, existing yaml-converter CLI (Bun + TypeScript)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `demo/schema.yaml` | MFE master sheet schema (9 columns, 3 groups) |
| Create | `demo/data.yaml` | 5 valid MFE rows |
| Create | `demo/data.invalid.yaml` | 3 rows with deliberate validation errors |
| Create | `demo/run.sh` | Shell script with 4 labeled demo steps |
| Modify | `package.json` | Add `"demo"` script |

---

### Task 1: MFE Schema

**Files:**
- Create: `demo/schema.yaml`

- [ ] **Step 1: Create `demo/schema.yaml`**

```yaml
columns:
  # App Info group
  - field: app_name
    header: App Name
    group: App Info
    type: string
    required: true

  - field: remote_name
    header: Remote Name
    group: App Info
    type: string
    required: true

  - field: team
    header: Team
    group: App Info
    type: string
    required: true

  # Technical group
  - field: framework
    header: Framework
    group: Technical
    type: options
    options: [React, Vue, Angular, Svelte]
    required: true

  - field: host_url
    header: Host URL
    group: Technical
    type: string

  - field: port
    header: Dev Port
    group: Technical
    type: number

  # Lifecycle group
  - field: status
    header: Status
    group: Lifecycle
    type: options
    options: [Active, Deprecated, Beta, Planned]
    required: true

  - field: deploy_date
    header: Deploy Date
    group: Lifecycle
    type: date
    format: YYYY-MM-DD

  - field: version
    header: Version
    group: Lifecycle
    type: string
```

- [ ] **Step 2: Validate schema loads without error**

```bash
bun run dev -- -i demo/data.yaml --schema demo/schema.yaml --validate
```

Expected: `fatal` error about missing input file — that's fine, it proves the schema path works (schema error would appear first).

- [ ] **Step 3: Commit**

```bash
git add demo/schema.yaml
git commit -m "demo: add MFE master sheet schema"
```

---

### Task 2: Valid Demo Data

**Files:**
- Create: `demo/data.yaml`

- [ ] **Step 1: Create `demo/data.yaml`**

```yaml
- app_name: Shell
  remote_name: shell
  team: Platform
  framework: React
  host_url: https://shell.example.com
  port: 3000
  status: Active
  deploy_date: "2024-03-01"
  version: "2.1.0"

- app_name: Auth MFE
  remote_name: auth
  team: Identity
  framework: React
  host_url: https://auth.example.com
  port: 3001
  status: Active
  deploy_date: "2024-02-15"
  version: "1.4.2"

- app_name: Dashboard MFE
  remote_name: dashboard
  team: Analytics
  framework: Vue
  port: 3002
  status: Beta
  version: "0.9.0"

- app_name: Legacy Nav
  remote_name: legacy_nav
  team: Platform
  framework: Angular
  status: Deprecated

- app_name: Settings MFE
  remote_name: settings
  team: Core
  framework: Svelte
  port: 3004
  status: Planned
```

- [ ] **Step 2: Run validate to confirm data is valid**

```bash
bun run dev -- -i demo/data.yaml --schema demo/schema.yaml --validate
```

Expected output: `Done` (green), exit code 0.

- [ ] **Step 3: Commit**

```bash
git add demo/data.yaml
git commit -m "demo: add valid MFE data"
```

---

### Task 3: Invalid Demo Data

**Files:**
- Create: `demo/data.invalid.yaml`

- [ ] **Step 1: Create `demo/data.invalid.yaml`**

Three rows, each with a different type of error:
- Row 1: `status` is `"Unknown"` — not in options list
- Row 2: `deploy_date` is `"15/01/2024"` — wrong format (should be YYYY-MM-DD)
- Row 3: `framework` field is absent — required field missing

```yaml
- app_name: Broken MFE A
  remote_name: broken_a
  team: Platform
  framework: React
  status: Unknown

- app_name: Broken MFE B
  remote_name: broken_b
  team: Analytics
  framework: Vue
  deploy_date: "15/01/2024"
  status: Active

- app_name: Broken MFE C
  remote_name: broken_c
  team: Core
  status: Beta
```

- [ ] **Step 2: Run validate to confirm errors are detected**

```bash
bun run dev -- -i demo/data.invalid.yaml --schema demo/schema.yaml --validate
```

Expected: red error output listing rows 1–3, exit code 1. An errors file `demo/data.invalid.errors.json` is written.

- [ ] **Step 3: Inspect the errors file**

```bash
cat demo/data.invalid.errors.json
```

Expected: JSON with `summary.total: 3` (or more if Zod emits multiple issues per row) and an `errors` array listing each field and message.

- [ ] **Step 4: Commit**

```bash
git add demo/data.invalid.yaml
git commit -m "demo: add invalid MFE data for error demo"
```

---

### Task 4: Demo Shell Script

**Files:**
- Create: `demo/run.sh`

- [ ] **Step 1: Create `demo/run.sh`**

```bash
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
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x demo/run.sh
```

- [ ] **Step 3: Run the full demo**

```bash
bun run demo
```

Expected:
- Step 1 exits 0, `demo/output.xlsx` created
- Step 2 exits 0, `demo/roundtrip.yaml` created
- Step 3 exits 0, no files written
- Step 4 exits 1, JSON summary printed to stdout, `demo/data.invalid.errors.json` printed

- [ ] **Step 4: Commit**

```bash
git add demo/run.sh
git commit -m "demo: add end-to-end demo shell script"
```

---

### Task 5: Wire `bun run demo` Script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the demo script to `package.json`**

In the `"scripts"` block, add after `"test"`:

```json
"demo": "bash demo/run.sh",
```

- [ ] **Step 2: Run it to confirm**

```bash
bun run demo
```

Expected: same output as Task 4 Step 3.

- [ ] **Step 2b: Add generated demo artifacts to `.gitignore`**

Open `.gitignore` (create if not present) and add:

```
demo/*.xlsx
demo/*.yaml.errors.json
demo/roundtrip.yaml
```

This keeps generated demo output files out of `git status` noise.

- [ ] **Step 3: Run biome check to ensure no formatting issues**

```bash
bunx biome check .
```

Expected: no errors.

- [ ] **Step 4: Commit and push**

```bash
git add package.json
git commit -m "chore: add bun run demo script"
git push
```
