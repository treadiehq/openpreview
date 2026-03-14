#!/usr/bin/env bun
/**
 * OpenPreview — terminal-native preview for URLs, markdown, JSON, and stdin.
 * Usage: preview [url|file] | cat file | preview
 */

import { parseCliArgs } from "./core/cli-options.ts";
import { buildExplainReport } from "./core/explain.ts";
import { resolveInput } from "./core/input.ts";
import { loadPreview } from "./core/preview-session.ts";
import { getUpdateHelp, runSelfUpdate } from "./core/self-update.ts";
import { VERSION } from "./core/version.ts";
import { runApp } from "./ui/app.ts";

function showHelp() {
  console.log(`
OpenPreview — terminal-native preview for URLs, markdown, JSON, and command output.

Usage:
  preview <url>              Preview a web page (docs mode)
  preview <file-path>         Preview a local file (e.g. .md, .json)
  <command> | preview         Preview piped input (e.g. curl ... | preview, cat file | preview)
  preview update             Download and install the latest release

Examples:
  preview https://docs.example.com
  preview --mode docs https://planetscale.com
  preview --inspect https://docs.example.com
  preview --explain https://docs.example.com
  preview update
  preview ./README.md
  cat data.json | preview
  gh pr view 123 | preview

Options:
  --help, -h               Show this help
  --version, -v            Show version
  --mode, -m <mode>        Force a mode: auto, docs, dashboard, json, markdown, github-pr, text
  --inspect                Open the inspect overlay on launch
  --explain, --debug       Print detection, parser, and fetch details, then exit

Update:
  preview update --check   Show whether an update is available
  preview update --to X    Install a specific release version

In-app:
  i                        Toggle inspect overlay
  ?                        Toggle keybinding help

Modes: Docs (HTML), Dashboard, API (JSON), Markdown, GitHub PR, plain text.
`);
}

function showVersion() {
  console.log(`OpenPreview ${VERSION}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "update") {
    await runSelfUpdate(args.slice(1));
    return;
  }
  if (args[0] === "help" && args[1] === "update") {
    console.log(getUpdateHelp());
    process.exit(0);
  }

  const parsed = parseCliArgs(args);

  if (parsed.error) {
    console.error(`OpenPreview error: ${parsed.error}`);
    process.exit(1);
  }

  if (parsed.help) {
    showHelp();
    process.exit(0);
  }
  if (parsed.version) {
    showVersion();
    process.exit(0);
  }

  const input = resolveInput(parsed.positional);

  if (parsed.explain) {
    if (!input) {
      console.error("OpenPreview error: --explain requires a URL, file path, or stdin.");
      process.exit(1);
    }
    const loaded = await loadPreview(input, parsed.mode);
    console.log(buildExplainReport(loaded));
    process.exit(0);
  }

  await runApp(input, { mode: parsed.mode, inspect: parsed.inspect });
}

main().catch((err) => {
  console.error("OpenPreview error:", err.message);
  process.exit(1);
});
