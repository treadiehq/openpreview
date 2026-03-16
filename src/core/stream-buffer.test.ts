import { describe, expect, test } from "bun:test";
import { appendStreamChunk, createEmptyStreamBuffer, trimToLastBytes } from "./stream-buffer.ts";

describe("trimToLastBytes", () => {
  test("keeps the full string when under the limit", () => {
    expect(trimToLastBytes("hello", 10)).toBe("hello");
  });

  test("keeps the trailing bytes when over the limit", () => {
    expect(trimToLastBytes("abcdefghij", 4)).toBe("ghij");
  });
});

describe("appendStreamChunk", () => {
  test("tracks total and displayed bytes", () => {
    const next = appendStreamChunk(createEmptyStreamBuffer(), "hello", 10);
    expect(next.totalBytes).toBe(5);
    expect(next.displayedBytes).toBe(5);
    expect(next.truncated).toBe(false);
  });

  test("drops older content when the buffer exceeds the limit", () => {
    const first = appendStreamChunk(createEmptyStreamBuffer(), "hello", 5);
    const next = appendStreamChunk(first, " world", 8);

    expect(next.content).toBe("lo world");
    expect(next.totalBytes).toBe(11);
    expect(next.displayedBytes).toBe(8);
    expect(next.droppedBytes).toBe(3);
    expect(next.truncated).toBe(true);
  });
});
