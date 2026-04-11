import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"

function run(...args: string[]) {
  return spawnSync("bun", ["run", "src/cli.ts", ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (!existsSync(p)) continue
    rmSync(p, { recursive: true, force: true })
  }
}

afterEach(() => {
  cleanup(
    "/tmp/cli-out.xlsx",
    "/tmp/cli-out-dir",
    "/tmp/cli-out.errors.json",
    "/tmp/cli-out-dir.errors.json",
    "/tmp/cli-multi-out",
    "/tmp/cli-multi-out.errors.json",
  )
})

describe("CLI", () => {
  test("--help shows all flags", () => {
    const r = run("--help")
    expect(r.stdout).toContain("--input")
    expect(r.stdout).toContain("--schema")
    expect(r.stdout).toContain("--validate")
    expect(r.stdout).toContain("--json")
    expect(r.stdout).toContain("--sheet-schemas")
  })

  test("YAML → Excel succeeds with exit code 0", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.xlsx")).toBe(true)
  })

  test("Excel → YAML writes one file per sheet into output directory", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.xlsx",
      "-o",
      "/tmp/cli-out-dir",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    // data.xlsx has one sheet named "Sheet1"
    expect(existsSync("/tmp/cli-out-dir/Sheet1.yaml")).toBe(true)
  })

  test("Excel → YAML multi-sheet writes one file per sheet", () => {
    const r = run(
      "-i",
      "tests/fixtures/multi-sheet.xlsx",
      "-o",
      "/tmp/cli-multi-out",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-multi-out/People.yaml")).toBe(true)
    expect(existsSync("/tmp/cli-multi-out/Staff.yaml")).toBe(true)
  })

  test("--json outputs machine-readable success object", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--json",
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.input).toBe("tests/fixtures/data.yaml")
  })

  test("missing input file exits with code 2 and fatal JSON", () => {
    const r = run(
      "-i",
      "nonexistent.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--json",
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
    expect(parsed.error).toContain("nonexistent.yaml")
  })

  test("missing schema file exits with code 2", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "nonexistent-schema.yaml",
      "--json",
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
  })

  test("--validate does not write output files", () => {
    const r = run(
      "-i",
      "tests/fixtures/multi-sheet.xlsx",
      "-o",
      "/tmp/cli-out-dir",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--validate",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out-dir")).toBe(false)
  })

  test("multi-sheet validation errors include sheet field in errors file", async () => {
    // Build a 2-sheet xlsx in-memory: ValidSheet has valid data, BrokenSheet has invalid status
    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()

    const addSheet = (name: string, rows: unknown[][]) => {
      const ws = wb.addWorksheet(name)
      ws.addRow(["Personal Info", null, null, null, null])
      ws.mergeCells(1, 1, 1, 2)
      ws.addRow(["Name", "Date of Birth", "Status", "Score", "Verified"])
      for (const r of rows) ws.addRow(r)
    }

    addSheet("ValidSheet", [["Alice", null, "Active", 95, true]])
    addSheet("BrokenSheet", [["Bob", null, "INVALID_STATUS", 70, false]])

    await wb.xlsx.writeFile("/tmp/cli-invalid-multi.xlsx")

    const r = run(
      "-i",
      "/tmp/cli-invalid-multi.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--validate",
      "--json",
    )

    expect(r.status).toBe(1)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("error")
    expect(parsed.errorCount).toBeGreaterThan(0)

    // Read the errors file BEFORE cleanup to verify sheet field is populated
    const errorsFile = JSON.parse(
      readFileSync("/tmp/cli-invalid-multi.errors.json", "utf-8"),
    )
    expect(errorsFile.errors[0].sheet).toBe("BrokenSheet")

    // Cleanup
    rmSync("/tmp/cli-invalid-multi.xlsx", { force: true })
    rmSync("/tmp/cli-invalid-multi.errors.json", { force: true })
  })

  test("strings with embedded double-quotes round-trip YAML → Excel → YAML", () => {
    const xlsx = "/tmp/cli-special-chars.xlsx"
    const outDir = "/tmp/cli-special-chars-out"
    try {
      // YAML → Excel
      const toExcel = run(
        "-i",
        "tests/fixtures/special-chars.yaml",
        "-o",
        xlsx,
        "--schema",
        "tests/fixtures/special-chars-schema.yaml",
      )
      expect(toExcel.status).toBe(0)

      // Excel → YAML
      const toYaml = run(
        "-i",
        xlsx,
        "-o",
        outDir,
        "--schema",
        "tests/fixtures/special-chars-schema.yaml",
      )
      expect(toYaml.status).toBe(0)

      const yaml = readFileSync(`${outDir}/special-chars.yaml`, "utf-8")
      expect(yaml).toContain('Monitor "Live" Feed')
      expect(yaml).toContain('"Dev" Experience')
      expect(yaml).toContain("O'Brien's Portal")
      expect(yaml).toContain("Reports & Analytics")
    } finally {
      cleanup(xlsx, outDir)
    }
  })

  test("--sheet-schemas emits warning but continues", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--sheet-schemas",
      "Sheet1:schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(r.stderr).toContain("--sheet-schemas is not yet implemented")
  })
})
