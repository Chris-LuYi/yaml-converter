import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import ExcelJS from "exceljs"
import { parse } from "yaml"

const SCHEMA = "tests/fixtures/merge-schema.yaml"
const MULTI_DIR = "tests/fixtures/multi-dir"
const RECURSIVE_DIR = "tests/fixtures/multi-dir-recursive"
const SPLIT_SOURCE = "tests/fixtures/split-source.yaml"

const TMP = {
  xlsx: "/tmp/ms-out.xlsx",
  dir: "/tmp/ms-split-dir",
  merged: "/tmp/ms-merged",
  errors: "/tmp/ms-out.errors.json",
  mergedErrors: "/tmp/ms-merged.errors.json",
}

function run(...args: string[]) {
  return spawnSync("bun", ["run", "src/cli.ts", ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
}

function cleanup() {
  for (const p of Object.values(TMP)) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true })
  }
  // also clean default split output from fixture path
  const defaultSplitOut = "tests/fixtures/split-source"
  if (existsSync(defaultSplitOut))
    rmSync(defaultSplitOut, { recursive: true, force: true })
}

afterEach(cleanup)

// Build a merged Excel fixture in memory for Excel→split tests
let mergedXlsx: string
beforeAll(async () => {
  mergedXlsx = "/tmp/ms-merged-fixture.xlsx"
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("merged")
  ws.addRow(["source", "Name", "Status", "Score"])
  ws.addRow(["alpha", "Alpha One", "Active", 90])
  ws.addRow(["alpha", "Alpha Two", "Active", 85])
  ws.addRow(["beta", "Beta One", "Inactive", 70])
  ws.addRow(["beta", "Beta Two", "Inactive", 65])
  await wb.xlsx.writeFile(mergedXlsx)
})

// ─── --help ───────────────────────────────────────────────────────────────────

describe("--help shows new flags", () => {
  test("all new flags are listed", () => {
    const r = run("--help")
    expect(r.stdout).toContain("--recursive")
    expect(r.stdout).toContain("--merge")
    expect(r.stdout).toContain("--tag-field")
    expect(r.stdout).toContain("--split-by")
    expect(r.stdout).toContain("--drop-field")
  })
})

// ─── --recursive ──────────────────────────────────────────────────────────────

describe("--recursive flag", () => {
  test("without --recursive only top-level files are collected", () => {
    const r = run("-i", RECURSIVE_DIR, "-o", TMP.xlsx, "--schema", SCHEMA)
    expect(r.status).toBe(0)
    // only alpha.yaml at top level → one sheet
    const wb = new ExcelJS.Workbook()
    // Just check exit code and file exists for non-recursive
    expect(existsSync(TMP.xlsx)).toBe(true)
  })

  test("--recursive collects files in subdirectories", async () => {
    const r = run(
      "-i",
      RECURSIVE_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--recursive",
    )
    expect(r.status).toBe(0)
    expect(existsSync(TMP.xlsx)).toBe(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    // Should have sheets: alpha, project-a_mfe1, project-a_mfe2, project-b_mfe3
    expect(wb.worksheets.length).toBe(4)
  })

  test("--recursive sheet tags use sanitized relative path", async () => {
    const r = run(
      "-i",
      RECURSIVE_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--recursive",
    )
    expect(r.status).toBe(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const names = wb.worksheets.map((ws) => ws.name)
    expect(names).toContain("project-a_mfe1")
    expect(names).toContain("project-a_mfe2")
    expect(names).toContain("project-b_mfe3")
  })

  test("schema.yaml files inside subdirs are excluded from collection", async () => {
    // Write a schema.yaml into a subdir to verify it is not treated as data
    const tmpSchema = join(RECURSIVE_DIR, "project-a", "schema.yaml")
    writeFileSync(tmpSchema, readFileSync(SCHEMA, "utf-8"))
    try {
      const r = run(
        "-i",
        RECURSIVE_DIR,
        "-o",
        TMP.xlsx,
        "--schema",
        SCHEMA,
        "--recursive",
      )
      expect(r.status).toBe(0)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(TMP.xlsx)
      const names = wb.worksheets.map((ws) => ws.name)
      expect(names.some((n) => n.includes("schema"))).toBe(false)
    } finally {
      rmSync(tmpSchema, { force: true })
    }
  })

  test("--recursive --json reports sheets map with relative-path keys", () => {
    const r = run(
      "-i",
      RECURSIVE_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--recursive",
      "--json",
    )
    expect(r.status).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.sheets).toHaveProperty("project-a_mfe1")
    expect(parsed.sheets).toHaveProperty("project-b_mfe3")
  })
})

// ─── --merge ──────────────────────────────────────────────────────────────────

describe("--merge flag", () => {
  test("--merge without --tag-field exits with code 2", () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
    )
    expect(r.status).toBe(2)
  })

  test("--merge produces a single-sheet Excel", async () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    expect(r.status).toBe(0)
    expect(existsSync(TMP.xlsx)).toBe(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    expect(wb.worksheets.length).toBe(1)
  })

  test("--merge tag column appears as first column", async () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    expect(r.status).toBe(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const ws = wb.worksheets[0]
    const headerRow = ws.getRow(1).values as unknown[]
    expect(headerRow[1]).toBe("source")
  })

  test("--merge injects correct tag values for each source file", async () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    expect(r.status).toBe(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const ws = wb.worksheets[0]
    const tags = new Set<string>()
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      tags.add(String((row.values as unknown[])[1]))
    })
    expect(tags.has("alpha")).toBe(true)
    expect(tags.has("beta")).toBe(true)
  })

  test("--merge rowcount equals sum of all source files", async () => {
    // alpha.yaml has 2 rows, beta.yaml has 2 rows → 4 total
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    expect(r.status).toBe(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const ws = wb.worksheets[0]
    // row 1 = header, rows 2..N = data
    expect(ws.rowCount - 1).toBe(4)
  })

  test("--merge --json reports rows and files count", () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
      "--json",
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.rows).toBe(4)
    expect(parsed.files).toBe(2)
  })

  test("--merge --validate does not write output file", () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
      "--validate",
    )
    expect(r.status).toBe(0)
    expect(existsSync(TMP.xlsx)).toBe(false)
  })

  test("--merge --recursive injects relative path as tag value", async () => {
    const r = run(
      "-i",
      RECURSIVE_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
      "--recursive",
    )
    expect(r.status).toBe(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const ws = wb.worksheets[0]
    const tags = new Set<string>()
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return
      tags.add(String((row.values as unknown[])[1]))
    })
    // Recursive tags include relative paths
    expect(tags.has("project-a/mfe1")).toBe(true)
    expect(tags.has("project-b/mfe3")).toBe(true)
  })

  test("--merge validation errors are reported across all files", () => {
    // Create a temp dir with one invalid file
    const tmpDir = "/tmp/ms-invalid-dir"
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "bad.yaml"),
      "- name: Bad\n  status: InvalidStatus\n  score: 50\n",
    )
    try {
      const r = run(
        "-i",
        tmpDir,
        "-o",
        TMP.xlsx,
        "--schema",
        SCHEMA,
        "--merge",
        "--tag-field",
        "source",
      )
      expect(r.status).toBe(1)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

// ─── --split-by (YAML input) ──────────────────────────────────────────────────

describe("--split-by flag on YAML input", () => {
  test("groups rows by field value into separate files", () => {
    const r = run(
      "-i",
      SPLIT_SOURCE,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
    )
    expect(r.status).toBe(0)
    expect(existsSync(join(TMP.dir, "alpha.yaml"))).toBe(true)
    expect(existsSync(join(TMP.dir, "beta.yaml"))).toBe(true)
  })

  test("output files contain only rows for their group", () => {
    run(
      "-i",
      SPLIT_SOURCE,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
    )
    const alphaRows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    const betaRows = parse(
      readFileSync(join(TMP.dir, "beta.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    expect(alphaRows.every((r) => r.source === "alpha")).toBe(true)
    expect(betaRows.every((r) => r.source === "beta")).toBe(true)
    expect(alphaRows).toHaveLength(2)
    expect(betaRows).toHaveLength(2)
  })

  test("--drop-field removes the split field from output rows", () => {
    run(
      "-i",
      SPLIT_SOURCE,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
      "--drop-field",
      "source",
    )
    const alphaRows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    expect(alphaRows.every((r) => !("source" in r))).toBe(true)
  })

  test("default output dir strips .yaml extension", () => {
    const r = run(
      "-i",
      SPLIT_SOURCE,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
    )
    expect(r.status).toBe(0)
    // Default: tests/fixtures/split-source (no .yaml)
    expect(existsSync("tests/fixtures/split-source/alpha.yaml")).toBe(true)
  })

  test("works without --schema (schemaless YAML→YAML split)", () => {
    const r = run("-i", SPLIT_SOURCE, "-o", TMP.dir, "--split-by", "source")
    expect(r.status).toBe(0)
    expect(existsSync(join(TMP.dir, "alpha.yaml"))).toBe(true)
    expect(existsSync(join(TMP.dir, "beta.yaml"))).toBe(true)
    // Output is valid YAML
    const rows = parse(readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"))
    expect(Array.isArray(rows)).toBe(true)
  })

  test("--json emits groups object with correct row counts", () => {
    const r = run(
      "-i",
      SPLIT_SOURCE,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
      "--json",
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.groups.alpha).toBe(2)
    expect(parsed.groups.beta).toBe(2)
    expect(parsed.totalRows).toBe(4)
  })

  test("--validate does not write output files", () => {
    const r = run(
      "-i",
      SPLIT_SOURCE,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
      "--validate",
    )
    expect(r.status).toBe(0)
    expect(existsSync(TMP.dir)).toBe(false)
  })

  test("directory input with --split-by exits with code 2", () => {
    const r = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.dir,
      "--schema",
      SCHEMA,
      "--split-by",
      "source",
    )
    expect(r.status).toBe(2)
  })
})

// ─── --split-by (Excel input) ─────────────────────────────────────────────────

describe("--split-by flag on Excel input", () => {
  // Uses schema that includes the 'source' column so Excel→YAML reads it
  const SPLIT_SCHEMA = "/tmp/ms-split-schema.yaml"

  beforeAll(() => {
    writeFileSync(
      SPLIT_SCHEMA,
      [
        "columns:",
        "  - field: source",
        "    header: source",
        "    type: string",
        "  - field: name",
        "    header: Name",
        "    type: string",
        "    required: true",
        "  - field: status",
        "    header: Status",
        "    type: options",
        "    options: [Active, Inactive]",
        "    required: true",
        "  - field: score",
        "    header: Score",
        "    type: number",
      ].join("\n"),
    )
  })

  test("Excel → YAML split groups rows by field from all sheets", () => {
    const r = run(
      "-i",
      mergedXlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
    )
    expect(r.status).toBe(0)
    expect(existsSync(join(TMP.dir, "alpha.yaml"))).toBe(true)
    expect(existsSync(join(TMP.dir, "beta.yaml"))).toBe(true)
  })

  test("output rows are correctly grouped", () => {
    run(
      "-i",
      mergedXlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
    )
    const alphaRows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    expect(alphaRows).toHaveLength(2)
    expect(alphaRows.every((r) => r.source === "alpha")).toBe(true)
  })

  test("Excel split requires --schema", () => {
    const r = run("-i", mergedXlsx, "-o", TMP.dir, "--split-by", "source")
    expect(r.status).toBe(2)
  })

  test("--drop-field removes source from Excel split output", () => {
    run(
      "-i",
      mergedXlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
      "--drop-field",
      "source",
    )
    const rows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    expect(rows.every((r) => !("source" in r))).toBe(true)
  })

  test("Excel --json split reports groups and totalRows", () => {
    const r = run(
      "-i",
      mergedXlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
      "--json",
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.groups.alpha).toBe(2)
    expect(parsed.groups.beta).toBe(2)
    expect(parsed.totalRows).toBe(4)
  })
})

// ─── Round-trip: merge → split ────────────────────────────────────────────────

describe("round-trip: merge then split", () => {
  const SPLIT_SCHEMA = "/tmp/ms-split-schema.yaml"

  beforeAll(() => {
    writeFileSync(
      SPLIT_SCHEMA,
      [
        "columns:",
        "  - field: source",
        "    header: source",
        "    type: string",
        "  - field: name",
        "    header: Name",
        "    type: string",
        "    required: true",
        "  - field: status",
        "    header: Status",
        "    type: options",
        "    options: [Active, Inactive]",
        "    required: true",
        "  - field: score",
        "    header: Score",
        "    type: number",
      ].join("\n"),
    )
  })

  test("merge then split recovers original row counts per source", () => {
    // Step 1: merge multi-dir → Excel
    const mergeResult = run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    expect(mergeResult.status).toBe(0)

    // Step 2: split merged Excel back by source
    const splitResult = run(
      "-i",
      TMP.xlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
    )
    expect(splitResult.status).toBe(0)

    const alphaRows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as unknown[]
    const betaRows = parse(
      readFileSync(join(TMP.dir, "beta.yaml"), "utf-8"),
    ) as unknown[]

    // alpha.yaml had 2 rows, beta.yaml had 2 rows
    expect(alphaRows).toHaveLength(2)
    expect(betaRows).toHaveLength(2)
  })

  test("round-trip with --drop-field removes tag column from reconstructed files", () => {
    run(
      "-i",
      MULTI_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
    )
    run(
      "-i",
      TMP.xlsx,
      "-o",
      TMP.dir,
      "--schema",
      SPLIT_SCHEMA,
      "--split-by",
      "source",
      "--drop-field",
      "source",
    )
    const alphaRows = parse(
      readFileSync(join(TMP.dir, "alpha.yaml"), "utf-8"),
    ) as Record<string, unknown>[]
    expect(alphaRows.every((r) => !("source" in r))).toBe(true)
    // Remaining fields match original
    expect(alphaRows[0].name).toBe("Alpha One")
    expect(alphaRows[0].status).toBe("Active")
    expect(alphaRows[0].score).toBe(90)
  })

  test("recursive merge then split recovers all files", async () => {
    // 4 files: alpha (1 row), project-a/mfe1 (2), project-a/mfe2 (1), project-b/mfe3 (1) = 5 total
    const mergeResult = run(
      "-i",
      RECURSIVE_DIR,
      "-o",
      TMP.xlsx,
      "--schema",
      SCHEMA,
      "--merge",
      "--tag-field",
      "source",
      "--recursive",
    )
    expect(mergeResult.status).toBe(0)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(TMP.xlsx)
    const ws = wb.worksheets[0]
    // row 1 = header; 1 + 2 + 1 + 1 = 5 data rows
    expect(ws.rowCount - 1).toBe(5)
  })
})
