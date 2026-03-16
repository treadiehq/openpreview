import fs from "node:fs";
import { ReadStream as TtyReadStream } from "node:tty";
import type { CliRendererConfig } from "@opentui/core";
import type { InputSource } from "../core/models.ts";

type RendererInputConfig = Pick<CliRendererConfig, "stdin" | "onDestroy">;
type OpenedTerminalInput = {
  stdin: NodeJS.ReadStream;
  cleanup?: () => void;
};

export function getRendererInputConfig(
  source: InputSource | null,
  stdin: Pick<NodeJS.ReadStream, "isTTY"> = process.stdin,
  openTerminalInput: () => OpenedTerminalInput | null = openTerminalInputStream,
): RendererInputConfig {
  if (source?.type !== "stdin" || stdin.isTTY) {
    return {};
  }

  const opened = openTerminalInput();
  if (!opened) {
    return {};
  }

  return {
    stdin: opened.stdin,
    onDestroy: () => {
      opened.cleanup?.();

      if ("destroyed" in opened.stdin && opened.stdin.destroyed) {
        return;
      }
      opened.stdin.destroy();
    },
  };
}

export function openTerminalInputStream(): OpenedTerminalInput | null {
  if (process.platform === "win32") {
    return null;
  }

  const devicePath = process.platform === "win32" ? "CONIN$" : "/dev/tty";
  let fd: number | null = null;
  let restoreState: string | null = null;
  let restored = false;

  try {
    restoreState = captureTerminalState(devicePath);
    if (!restoreState || !runStty(devicePath, "raw -echo")) {
      return null;
    }

    fd = fs.openSync(devicePath, "r");
    const stdin = new TtyReadStream(fd) as NodeJS.ReadStream & {
      setRawMode?: ((mode: boolean) => NodeJS.ReadStream) | undefined;
    };

    stdin.setRawMode = undefined;

    return {
      stdin,
      cleanup: () => {
        if (restored) {
          return;
        }
        restored = true;

        if (restoreState) {
          runStty(devicePath, shellQuote(restoreState));
        } else {
          runStty(devicePath, "sane");
        }
      },
    };
  } catch {
    if (restoreState) {
      runStty(devicePath, shellQuote(restoreState));
    }
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // The stream constructor may have already taken ownership.
      }
    }
    return null;
  }
}

function captureTerminalState(devicePath: string): string | null {
  const proc = Bun.spawnSync(["/bin/sh", "-lc", `stty -g < ${shellQuote(devicePath)}`], {
    stdout: "pipe",
    stderr: "ignore",
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  return Buffer.from(proc.stdout).toString("utf8").trim() || null;
}

function runStty(devicePath: string, mode: string): boolean {
  const proc = Bun.spawnSync(["/bin/sh", "-lc", `stty ${mode} < ${shellQuote(devicePath)}`], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return proc.exitCode === 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}
