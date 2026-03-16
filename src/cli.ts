#!/usr/bin/env bun
/**
 * OpenPreview — terminal-native preview for URLs, markdown, JSON, and stdin.
 * Usage: preview [url|file] | cat file | preview
 */

import { parseCliArgs } from "./core/cli-options.ts";
import { buildExplainReport } from "./core/explain.ts";
import { exportSkillBundle, supportsSkillExport } from "./core/export.ts";
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
  <command> | preview --follow
  preview skill <url|file>   Export supported content as a reusable skill bundle
  preview update             Download and install the latest release

Examples:
  preview https://docs.example.com
  ps aux | preview
  docker logs app | preview
  docker logs -f app | preview --follow
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
  --follow, -f             Follow live stdin and keep rendering appended output
  --inspect                Open the inspect overlay on launch
  --explain, --debug       Print detection, parser, and fetch details, then exit

Update:
  preview update --check   Show whether an update is available
  preview update --to X    Install a specific release version

In-app:
  i                        Toggle inspect overlay
  s then k                 Export a skill bundle
  ?                        Toggle keybinding help

Modes: Docs (HTML), Dashboard, API (JSON), Markdown, GitHub PR, Table, Log, plain text.
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

  const input = resolveInput(parsed.positional);
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

main().catch((err) => {
  console.error("OpenPreview error:", err.message);
  process.exit(1);
});
