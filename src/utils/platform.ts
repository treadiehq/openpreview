/**
 * Platform detection and platform-specific actions (clipboard, open URL).
 * Supports macOS first; Linux and Windows use fallbacks.
 */

export type Platform = "darwin" | "linux" | "win32" | "unknown";

export function getPlatform(): Platform {
  const p = process.platform;
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "unknown";
}

/** Copy text to system clipboard. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = getPlatform();
  try {
    if (platform === "darwin") {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      proc.stdin.write(new TextEncoder().encode(text));
      proc.stdin.end();
      return (await proc.exited) === 0;
    }
    if (platform === "linux") {
      const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      });
      proc.stdin.write(new TextEncoder().encode(text));
      proc.stdin.end();
      return (await proc.exited) === 0;
    }
    if (platform === "win32") {
      const proc = Bun.spawn(["cmd", "/c", "clip"], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      });
      proc.stdin.write(new TextEncoder().encode(text));
      proc.stdin.end();
      return (await proc.exited) === 0;
    }
  } catch {
    // pbcopy/xclip/clip not available
  }
  return false;
}

/** Open URL in default browser. */
export function openURL(url: string): boolean {
  const platform = getPlatform();
  try {
    if (platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
      return true;
    }
    if (platform === "linux") {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
      return true;
    }
    if (platform === "win32") {
      const escaped = url.replace(/[&|<>()^%"]/g, "^$&");
      Bun.spawn(["cmd", "/c", "start", "", escaped], { stdout: "ignore", stderr: "ignore" });
      return true;
    }
  } catch {
    //
  }
  return false;
}
