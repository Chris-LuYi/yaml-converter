import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"

function run(...args: string[]) {
  return spawnSync("bun", ["run", "src/cli.ts", ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
}

afterEach(() => {
  for (const f of [
    "/tmp/cli-out.xlsx",
    "/tmp/cli-out.yaml",
    "/tmp/cli-out.errors.json",
  ]) {
    if (existsSync(f)) unlinkSync(f)
  }
})

describe("CLI", () => {
  test("--help shows all flags", () => {
    const r = run("--help")
    expect(r.stdout).toContain("--input")
    expect(r.stdout).toContain("--schema")
    expect(r.stdout).toContain("--validate")
    expect(r.stdout).toContain("--json")
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

  test("Excel → YAML succeeds with exit code 0", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.xlsx",
      "-o",
      "/tmp/cli-out.yaml",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.yaml")).toBe(true)
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

  test("--validate does not write output file", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.xlsx",
      "-o",
      "/tmp/cli-out.yaml",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--validate",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.yaml")).toBe(false)
  })
})
