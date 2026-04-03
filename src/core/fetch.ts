/**
 * Load content from URL, file, or stdin (already resolved by input.ts).
 */

import type { InputSource } from "./models.ts";
import { readFile } from "./input.ts";
import { runCommandWithMeta } from "./run-command.ts";
import { VERSION } from "./version.ts";

const FETCH_TIMEOUT_MS = 10_000;
export const MAX_CONTENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CONTENT_SIZE_LABEL = "10 MB";

export interface FetchResult {
  content: string;
  contentType?: string;
  truncated?: boolean;
  totalBytes: number;
  displayedBytes: number;
  durationMs?: number;
  statusCode?: number;
  finalUrl?: string;
  exitCode?: number;
  stderrBytes?: number;
}

export async function fetchContentWithMeta(source: InputSource): Promise<FetchResult> {
  switch (source.type) {
    case "stdin": {
      const { readStdin } = await import("./input.ts");
      const content = await readStdin();
      return buildFetchResult(content);
    }
    case "file": {
      const content = await readFile(source.value);
      return buildFetchResult(content);
    }
    case "url":
      return fetchUrl(source.value);
    case "command": {
      const result = await runCommandWithMeta(source);
      return {
        ...buildFetchResult(result.stdout),
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
      };
    }
    default:
      throw new Error(`Unknown source type: ${(source as InputSource).type}`);
  }
}

async function fetchUrl(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `OpenPreview/${VERSION}` },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const contentType = res.headers.get("content-type") ?? undefined;
    const text = await res.text();
    return {
      ...buildFetchResult(text),
      contentType,
      durationMs: Math.round(performance.now() - started),
      statusCode: res.status,
      finalUrl: res.url || url,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function trimToFirstBytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const sliced = buf.subarray(0, maxBytes);
  return sliced.toString("utf8").replace(/\uFFFD$/, "");
}

function buildFetchResult(content: string): FetchResult {
  const totalBytes = Buffer.byteLength(content, "utf8");
  const truncated = totalBytes > MAX_CONTENT_SIZE_BYTES;
  const displayedContent = truncated ? trimToFirstBytes(content, MAX_CONTENT_SIZE_BYTES) : content;

  return {
    content: displayedContent,
    truncated,
    totalBytes,
    displayedBytes: Buffer.byteLength(displayedContent, "utf8"),
  };
}
