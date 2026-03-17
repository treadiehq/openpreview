import type { InputSource } from "./models.ts";

const COMMAND_TIMEOUT_MS = 15_000;

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export async function runCommandWithMeta(source: InputSource): Promise<CommandResult> {
  if (source.type !== "command") {
    throw new Error(`Cannot run non-command source: ${source.type}`);
  }

  const command = source.value.trim();
  if (!command) {
    throw new Error("Missing command to execute.");
  }

  const shell = process.env.SHELL || "/bin/sh";
  const started = performance.now();
  const proc = Bun.spawn([shell, "-lc", command], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
    env: process.env,
  });

  const timeout = setTimeout(() => {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Ignore shutdown races.
    }
  }, COMMAND_TIMEOUT_MS);

  try {
    const [stdoutBuffer, stderrBuffer, exitCode] = await Promise.all([
      readStream(proc.stdout),
      readStream(proc.stderr),
      proc.exited,
    ]);
    const durationMs = Math.round(performance.now() - started);
    const stdout = stdoutBuffer.toString("utf8");
    const stderr = stderrBuffer.toString("utf8");

    if (exitCode !== 0) {
      const errText = stderr.trim() || stdout.trim();
      const suffix = errText ? `\n${errText}` : "";
      throw new Error(`Command exited with code ${exitCode}: ${command}${suffix}`);
    }

    return {
      stdout,
      stderr,
      exitCode,
      durationMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const buffer = await new Response(stream).arrayBuffer();
  return Buffer.from(buffer);
}
