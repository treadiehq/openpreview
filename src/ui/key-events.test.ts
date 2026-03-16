import { describe, expect, test } from "bun:test";
import { isEscapeKey, isPlainKey, isTabKey } from "./key-events.ts";

describe("isPlainKey", () => {
  test("matches a plain printable keypress", () => {
    expect(isPlainKey({ raw: "y", eventType: "press" }, "y")).toBe(true);
  });

  test("rejects multi-byte terminal responses", () => {
    expect(isPlainKey({ raw: "\u001b[?2026;1$y", sequence: "y", eventType: "press" }, "y")).toBe(
      false,
    );
  });

  test("rejects modified keypresses", () => {
    expect(isPlainKey({ raw: "y", ctrl: true, eventType: "press" }, "y")).toBe(false);
  });
});

describe("isEscapeKey", () => {
  test("matches escape via name or raw byte", () => {
    expect(isEscapeKey({ name: "escape" })).toBe(true);
    expect(isEscapeKey({ raw: "\u001b" })).toBe(true);
  });
});

describe("isTabKey", () => {
  test("matches tab via name or raw byte", () => {
    expect(isTabKey({ name: "tab" })).toBe(true);
    expect(isTabKey({ raw: "\t" })).toBe(true);
  });
});
