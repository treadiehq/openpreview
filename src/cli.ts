#!/usr/bin/env bun
/**
 * OpenPreview — terminal-native preview for URLs, markdown, JSON, and stdin.
 * Usage: preview [url|file] | cat file | preview
 */

import { createCliRenderer } from "@opentui/core";
import { parseCliArgs, parsePreviewMode } from "./core/cli-options.ts";
import { buildPreviewDiff } from "./core/diff.ts";
import { buildExplainReport } from "./core/explain.ts";
import { exportSkillBundle, supportsSkillExport } from "./core/export.ts";
import { resolveInput } from "./core/input.ts";
import type { InputSource, PreviewMode } from "./core/models.ts";
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
  preview --cmd <command...>  Preview command output without piping
  <command> | preview         Preview piped input (e.g. curl ... | preview, cat file | preview)
  <command> | preview --follow
  preview diff <left> <right> Compare two URLs, files, or captures
  preview skill <url|file>   Export supported content as a reusable skill bundle
  preview update             Download and install the latest release

Examples:
  preview https://docs.example.com
  preview --cmd gh pr view 123
  ps aux | preview
  docker logs app | preview
  docker logs -f app | preview --follow
  preview diff fixtures/sample.json fixtures/sample.json
  preview diff --left-cmd "kubectl get pods -o json" fixtures/sample.json
  preview --mode docs https://planetscale.com
  preview --mode table fixtures/sample-table.txt
  preview --mode log fixtures/sample-log.txt
  preview --inspect https://docs.example.com
  preview --explain https://docs.example.com
  preview skill https://texturehq.com
  preview update
  preview ./README.md
  cat data.json | preview
  gh pr view 123 | preview

Options:
  --help, -h               Show this help
  --version, -v            Show version
  --mode, -m <mode>        Force a mode: auto, docs, dashboard, json, markdown, github-pr, table, log, text
  --cmd, -c <command...>   Execute a command and preview its stdout
  --follow, -f             Follow live stdin and keep rendering appended output
  --inspect                Open the inspect overlay on launch
  --explain, --debug       Print detection, parser, and fetch details, then exit

Update:
  preview update --check   Show whether an update is available
  preview update --to X    Install a specific release version

In-app:
  Enter                    Follow the selected doc link or drill into JSON
  y                        Copy the current section, row, code block, error group, or link
  Y                        Copy the full extracted content
  b                        Go back in docs or JSON navigation
  o                        Open the current URL in a browser
  F                        Jump to the first error in logs
  i                        Toggle inspect overlay
  s then k                 Export a skill bundle
  ?                        Toggle keybinding help

Modes: Docs (HTML), Dashboard, API (JSON), Markdown, GitHub PR, Table, Log, plain text.
`);
}

function showDiffHelp() {
  console.log(`
OpenPreview diff

Usage:
  preview diff <left> <right>
  preview diff --left-cmd "<command>" <right>
  preview diff <left> --right-cmd "<command>"
  preview diff --left-cmd "<command>" --right-cmd "<command>"

Examples:
  preview diff before.json after.json
  preview diff https://docs.example.com/guide/v1 https://docs.example.com/guide/v2
  preview diff --left-cmd "kubectl get pods -o json" snapshots/pods.json
  preview diff --left-cmd "docker logs api" --right-cmd "docker logs worker"
`);
}

function showSkillHelp() {
  console.log(`
OpenPreview skill export

Usage:
  preview skill <url>
  preview skill <file-path>
  <command> | preview skill

Examples:
  preview skill https://texturehq.com
  preview skill --mode docs https://planetscale.com
  cat notes.md | preview skill

Notes:
  - Skill export is available for docs, markdown, GitHub PR, table, log, and plain text content.
  - Output is saved under ./openpreview-exports by default.
  - The bundle includes SKILL.md and references/source.md.
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
  if (args[0] === "diff") {
    await runDiffCommand(args.slice(1));
    return;
  }
  if (args[0] === "skill") {
    await runSkillExport(args.slice(1));
    return;
  }
  if (args[0] === "help" && args[1] === "update") {
    console.log(getUpdateHelp());
    process.exit(0);
  }
  if (args[0] === "help" && args[1] === "skill") {
    showSkillHelp();
    process.exit(0);
  }
  if (args[0] === "help" && args[1] === "diff") {
    showDiffHelp();
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

  const input = resolveInput(parsed.positional, { commandArgs: parsed.commandArgs });

  if (parsed.follow && input?.type !== "stdin") {
    console.error("OpenPreview error: --follow currently requires piped stdin, for example `docker logs -f app | preview --follow`.");
    process.exit(1);
  }

  if (parsed.explain) {
    if (!input) {
      console.error("OpenPreview error: --explain requires a URL, file path, or stdin.");
      process.exit(1);
    }
    const loaded = await loadPreview(input, parsed.mode);
    console.log(buildExplainReport(loaded));
    process.exit(0);
  }

  await runApp(input, { mode: parsed.mode, inspect: parsed.inspect, follow: parsed.follow });
}

async function runSkillExport(args: string[]) {
  const parsed = parseCliArgs(args);

  if (parsed.error) {
    console.error(`OpenPreview error: ${parsed.error}`);
    process.exit(1);
  }

  if (parsed.help) {
    showSkillHelp();
    process.exit(0);
  }

  if (parsed.version) {
    showVersion();
    process.exit(0);
  }

  if (parsed.inspect || parsed.explain || parsed.follow) {
    console.error("OpenPreview error: --inspect, --explain, and --follow are not supported with `preview skill`.");
    process.exit(1);
  }

  const input = resolveInput(parsed.positional, { commandArgs: parsed.commandArgs });
  if (!input) {
    console.error("OpenPreview error: `preview skill` requires a URL, file path, or stdin.");
    process.exit(1);
  }

  const loaded = await loadPreview(input, parsed.mode);
  if (!supportsSkillExport(loaded.doc)) {
    console.error(
      `OpenPreview error: Skill export is not available for ${loaded.doc.kind} content.`,
    );
    process.exit(1);
  }

  const result = await exportSkillBundle(loaded.doc, loaded.source, loaded.inspectInfo);
  console.log(`Saved skill bundle: ${result.savedPath}`);

  if (loaded.inspectInfo.truncated || loaded.inspectInfo.jsHeavy || loaded.inspectInfo.nextAction) {
    console.log("Review references/source.md in the bundle if extraction may be incomplete.");
  }
}

async function runDiffCommand(args: string[]) {
  const parsed = parseDiffArgs(args);

  if (parsed.error) {
    console.error(`OpenPreview error: ${parsed.error}`);
    process.exit(1);
  }

  if (parsed.help) {
    showDiffHelp();
    process.exit(0);
  }

  if (parsed.version) {
    showVersion();
    process.exit(0);
  }

  const left = parsed.left;
  const right = parsed.right;
  if (!left || !right) {
    console.error("OpenPreview error: `preview diff` needs two inputs.");
    process.exit(1);
  }

  const [leftLoaded, rightLoaded] = await Promise.all([
    loadPreview(left, parsed.mode),
    loadPreview(right, parsed.mode),
  ]);
  const diffDoc = buildPreviewDiff(leftLoaded, rightLoaded);

  const renderer = await createCliRenderer({ exitOnCtrlC: true, useAlternateScreen: true });
  const { runContentApp } = await import("./ui/run-content.ts");
  const diffSource: InputSource = {
    type: "file",
    value: "diff",
    label: "comparison",
  };
  runContentApp(renderer, diffDoc, diffSource, { forcedMode: parsed.mode });
}

function parseDiffArgs(args: string[]): {
  help: boolean;
  version: boolean;
  mode: PreviewMode;
  left?: InputSource;
  right?: InputSource;
  error?: string;
} {
  let help = false;
  let version = false;
  let mode: PreviewMode = "auto";
  let leftCmd: string | undefined;
  let rightCmd: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      version = true;
      continue;
    }
    if (arg === "--mode" || arg === "-m") {
      const value = args[i + 1];
      if (!value) {
        return { help, version, mode, error: "Missing value for --mode." };
      }
      const parsedMode = parsePreviewMode(value);
      if (!parsedMode) {
        return { help, version, mode, error: `Invalid --mode value: ${value}.` };
      }
      mode = parsedMode;
      i++;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      const parsedMode = parsePreviewMode(value);
      if (!parsedMode) {
        return { help, version, mode, error: `Invalid --mode value: ${value}.` };
      }
      mode = parsedMode;
      continue;
    }
    if (arg === "--left-cmd") {
      leftCmd = args[i + 1];
      if (!leftCmd) return { help, version, mode, error: "Missing value for --left-cmd." };
      i++;
      continue;
    }
    if (arg === "--right-cmd") {
      rightCmd = args[i + 1];
      if (!rightCmd) return { help, version, mode, error: "Missing value for --right-cmd." };
      i++;
      continue;
    }
    if (arg.startsWith("--left-cmd=")) {
      leftCmd = arg.slice("--left-cmd=".length);
      continue;
    }
    if (arg.startsWith("--right-cmd=")) {
      rightCmd = arg.slice("--right-cmd=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      return { help, version, mode, error: `Unknown option: ${arg}` };
    }
    positional.push(arg);
  }

  if (help || version) {
    return { help, version, mode };
  }

  const left = leftCmd ? createCommandSource(leftCmd) : resolveDiffPositional(positional[0]);
  const right = rightCmd ? createCommandSource(rightCmd) : resolveDiffPositional(positional[leftCmd ? 0 : 1]);

  if (!left || !right) {
    return { help, version, mode, error: "Provide two inputs or use --left-cmd/--right-cmd." };
  }

  return { help, version, mode, left, right };
}

function resolveDiffPositional(value?: string): InputSource | undefined {
  if (!value) return undefined;
  return resolveInput([value], { stdin: false }) ?? undefined;
}

function createCommandSource(command: string): InputSource {
  return {
    type: "command",
    value: command,
    label: command,
  };
}

main().catch((err) => {
  console.error("OpenPreview error:", err.message);
  process.exit(1);
});
