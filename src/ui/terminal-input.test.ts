import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { getRendererInputConfig } from "./terminal-input.ts";

describe("getRendererInputConfig", () => {
  test("uses the existing stdin when it is already a tty", () => {
    let opened = false;

    const config = getRendererInputConfig(
      { type: "stdin", value: "-", label: "stdin" },
      { isTTY: true } as Pick<NodeJS.ReadStream, "isTTY">,
      () => {
        opened = true;
        return {
          stdin: new PassThrough() as unknown as NodeJS.ReadStream,
        };
      },
    );

    expect(config).toEqual({});
    expect(opened).toBe(false);
  });

  test("uses a dedicated terminal stream for piped stdin", () => {
    const terminalInput = new PassThrough() as unknown as NodeJS.ReadStream;
    let destroyed = false;
    const originalDestroy = terminalInput.destroy.bind(terminalInput);
    terminalInput.destroy = ((...args: any[]) => {
      destroyed = true;
      return originalDestroy(...args);
    }) as typeof terminalInput.destroy;

    const config = getRendererInputConfig(
      { type: "stdin", value: "-", label: "stdin" },
      { isTTY: false } as Pick<NodeJS.ReadStream, "isTTY">,
      () => ({ stdin: terminalInput }),
    );

    expect(config.stdin).toBe(terminalInput);
    expect(typeof config.onDestroy).toBe("function");

    config.onDestroy?.();
    expect(destroyed).toBe(true);
  });

  test("falls back cleanly when no terminal stream is available", () => {
    const config = getRendererInputConfig(
      { type: "stdin", value: "-", label: "stdin" },
      { isTTY: false } as Pick<NodeJS.ReadStream, "isTTY">,
      () => null,
    );

    expect(config).toEqual({});
  });

  test("does nothing for non-stdin sources", () => {
    let opened = false;

    const config = getRendererInputConfig(
      { type: "url", value: "https://example.com", label: "https://example.com" },
      { isTTY: false } as Pick<NodeJS.ReadStream, "isTTY">,
      () => {
        opened = true;
        return {
          stdin: new PassThrough() as unknown as NodeJS.ReadStream,
        };
      },
    );

    expect(config).toEqual({});
    expect(opened).toBe(false);
  });
});
