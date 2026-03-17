/**
 * Resolve CLI args and stdin into a single InputSource.
 * Priority: explicit positional path/URL > stdin.
 */

import type { InputSource } from "./models.ts";

const URL_REGEX = /^https?:\/\//i;
const STDIN_TIMEOUT_MS = 30_000;

export function hasStdin(): boolean {
  return !process.stdin.isTTY;
}

export interface ResolveInputOptions {
  /** Override stdin detection (e.g. for tests). Default: use process.stdin.isTTY */
  stdin?: boolean;
  /** Explicit command tokens passed via --cmd */
  commandArgs?: string[];
}

export function resolveInput(args: string[], options?: ResolveInputOptions): InputSource | null {
  if (options?.commandArgs && options.commandArgs.length > 0) {
    const value = options.commandArgs.join(" ");
    return {
      type: "command",
      value,
      label: value,
      args: options.commandArgs,
    };
  }

  const arg = args[0]?.trim();
  if (arg) {
    if (URL_REGEX.test(arg)) {
      return {
        type: "url",
        value: arg,
        label: arg,
      };
    }
    return {
      type: "file",
      value: arg,
      label: arg.split("/").pop() ?? arg,
    };
  }
  const useStdin = options?.stdin ?? hasStdin();
  if (useStdin) {
    return { type: "stdin", value: "stdin", label: "stdin" };
  }
  return null;
}

export function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let timer: ReturnType<typeof setTimeout>;

    const clearListeners = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        clearListeners();
        reject(new Error(`stdin timed out after ${STDIN_TIMEOUT_MS / 1000}s — is the pipe stalled?`));
      }, STDIN_TIMEOUT_MS);
    };

    const onData = (chunk: string) => {
      chunks.push(Buffer.from(chunk));
      resetTimer();
    };

    const onEnd = () => {
      clearTimeout(timer);
      clearListeners();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    const onError = (error: Error) => {
      clearTimeout(timer);
      clearListeners();
      reject(error);
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    resetTimer();
  });
}

export async function readFile(path: string): Promise<string> {
  const f = await Bun.file(path);
  if (!(await f.exists())) throw new Error(`File not found: ${path}`);
  return f.text();
}
