import { describe, expect, test } from "bun:test";
import {
  detectReleaseTarget,
  getUpdateHelp,
  parseUpdateArgs,
  resolveSelfUpdatePath,
} from "./self-update.ts";

describe("parseUpdateArgs", () => {
  test("parses check mode", () => {
    expect(parseUpdateArgs(["--check"])).toEqual({
      check: true,
      help: false,
    });
  });

  test("parses explicit version with separate value", () => {
    expect(parseUpdateArgs(["--to", "0.0.2"])).toEqual({
      check: false,
      help: false,
      toVersion: "0.0.2",
    });
  });

  test("parses explicit version with equals syntax", () => {
    expect(parseUpdateArgs(["--to=v0.0.2"])).toEqual({
      check: false,
      help: false,
      toVersion: "v0.0.2",
    });
  });

  test("returns an error for unknown flags", () => {
    expect(parseUpdateArgs(["--wat"]).error).toBe("Unknown update option: --wat");
  });

  test("returns an error for missing --to value", () => {
    expect(parseUpdateArgs(["--to"]).error).toContain("Missing value for --to");
  });
});

describe("detectReleaseTarget", () => {
  test("maps darwin arm64", () => {
    expect(detectReleaseTarget("darwin", "arm64")).toEqual({
      os: "darwin",
      arch: "arm64",
      assetName: "preview-darwin-arm64.tar.gz",
    });
  });

  test("maps linux x64", () => {
    expect(detectReleaseTarget("linux", "x64")).toEqual({
      os: "linux",
      arch: "x64",
      assetName: "preview-linux-x64.tar.gz",
    });
  });

  test("throws on unsupported targets", () => {
    expect(() => detectReleaseTarget("win32", "x64")).toThrow(/only supported on macOS and Linux/);
    expect(() => detectReleaseTarget("darwin", "ppc")).toThrow(/Unsupported architecture/);
  });
});

describe("resolveSelfUpdatePath", () => {
  test("accepts installed preview binary", () => {
    expect(resolveSelfUpdatePath("/usr/local/bin/preview")).toBe("/usr/local/bin/preview");
  });

  test("rejects bun exec path", () => {
    expect(() => resolveSelfUpdatePath("/opt/homebrew/bin/bun")).toThrow(/installed release binaries/);
  });
});

describe("getUpdateHelp", () => {
  test("mentions check mode", () => {
    expect(getUpdateHelp()).toContain("preview update --check");
  });
});
