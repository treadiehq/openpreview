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
}

export function resolveInput(args: string[], options?: ResolveInputOptions): InputSource | null {
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
  const chunks: Buffer[] = [];
  const stdinPromise = new Promise<string>((resolve, reject) => {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`stdin timed out after ${STDIN_TIMEOUT_MS / 1000}s — is the pipe stalled?`)),
      STDIN_TIMEOUT_MS,
    );
  });
  return Promise.race([stdinPromise, timeoutPromise]).finally(() => clearTimeout(timer!));
}

export async function readFile(path: string): Promise<string> {
  const f = await Bun.file(path);
  if (!(await f.exists())) throw new Error(`File not found: ${path}`);
  return f.text();
}
