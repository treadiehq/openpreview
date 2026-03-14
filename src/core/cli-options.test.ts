import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./cli-options.ts";

describe("parseCliArgs", () => {
  test("parses help and version flags", () => {
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-v"]).version).toBe(true);
  });

  test("parses inspect flag", () => {
    const parsed = parseCliArgs(["--inspect", "https://example.com"]);
    expect(parsed.inspect).toBe(true);
    expect(parsed.positional).toEqual(["https://example.com"]);
  });

  test("parses explain flag", () => {
    const parsed = parseCliArgs(["--explain", "https://example.com"]);
    expect(parsed.explain).toBe(true);
    expect(parsed.positional).toEqual(["https://example.com"]);
  });

  test("parses debug alias for explain", () => {
    const parsed = parseCliArgs(["--debug", "https://example.com"]);
    expect(parsed.explain).toBe(true);
    expect(parsed.positional).toEqual(["https://example.com"]);
  });

  test("parses mode with separate value", () => {
    const parsed = parseCliArgs(["--mode", "docs", "https://example.com"]);
    expect(parsed.mode).toBe("docs");
    expect(parsed.positional).toEqual(["https://example.com"]);
  });

  test("parses mode with equals syntax", () => {
    const parsed = parseCliArgs(["--mode=dashboard", "https://example.com"]);
    expect(parsed.mode).toBe("dashboard");
    expect(parsed.positional).toEqual(["https://example.com"]);
  });

  test("supports -- to stop option parsing", () => {
    const parsed = parseCliArgs(["--", "--literal-file.md"]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.positional).toEqual(["--literal-file.md"]);
  });

  test("returns error for missing mode value", () => {
    const parsed = parseCliArgs(["--mode"]);
    expect(parsed.error).toContain("Missing value for --mode");
  });

  test("returns error for invalid mode value", () => {
    const parsed = parseCliArgs(["--mode", "graphql"]);
    expect(parsed.error).toContain("Invalid --mode value");
  });

  test("returns error for unknown flag", () => {
    const parsed = parseCliArgs(["--wat"]);
    expect(parsed.error).toBe("Unknown option: --wat");
  });
});
