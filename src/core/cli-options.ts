import type { PreviewMode } from "./models.ts";

export const PREVIEW_MODES: PreviewMode[] = [
  "auto",
  "docs",
  "dashboard",
  "json",
  "markdown",
  "github-pr",
  "table",
  "log",
  "text",
];

export interface ParsedCliArgs {
  help: boolean;
  version: boolean;
  inspect: boolean;
  explain: boolean;
  follow: boolean;
  mode: PreviewMode;
  positional: string[];
  error?: string;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {
    help: false,
    version: false,
    inspect: false,
    explain: false,
    follow: false,
    mode: "auto",
    positional: [],
  };

  let parseFlags = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";

    if (parseFlags && arg === "--") {
      parseFlags = false;
      continue;
    }

    if (parseFlags && arg.startsWith("-")) {
      if (arg === "--help" || arg === "-h") {
        parsed.help = true;
        continue;
      }
      if (arg === "--version" || arg === "-v") {
        parsed.version = true;
        continue;
      }
      if (arg === "--inspect") {
        parsed.inspect = true;
        continue;
      }
      if (arg === "--follow" || arg === "-f") {
        parsed.follow = true;
        continue;
      }
      if (arg === "--explain" || arg === "--debug") {
        parsed.explain = true;
        continue;
      }
      if (arg === "--mode" || arg === "-m") {
        const value = args[i + 1];
        if (!value || value.startsWith("-")) {
          return { ...parsed, error: `Missing value for --mode. Use one of: ${PREVIEW_MODES.join(", ")}.` };
        }
        const mode = parsePreviewMode(value);
        if (!mode) {
          return { ...parsed, error: `Invalid --mode value: ${value}. Use one of: ${PREVIEW_MODES.join(", ")}.` };
        }
        parsed.mode = mode;
        i++;
        continue;
      }
      if (arg.startsWith("--mode=")) {
        const value = arg.slice("--mode=".length);
        const mode = parsePreviewMode(value);
        if (!mode) {
          return { ...parsed, error: `Invalid --mode value: ${value}. Use one of: ${PREVIEW_MODES.join(", ")}.` };
        }
        parsed.mode = mode;
        continue;
      }

      return { ...parsed, error: `Unknown option: ${arg}` };
    }

    parsed.positional.push(arg);
  }

  return parsed;
}

function parsePreviewMode(value: string): PreviewMode | null {
  const mode = value.trim().toLowerCase() as PreviewMode;
  return PREVIEW_MODES.includes(mode) ? mode : null;
}
