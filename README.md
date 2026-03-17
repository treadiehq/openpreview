# OpenPreview

Preview URLs, files, logs, and command output in your terminal.

OpenPreview is a docs browser, API inspector, log triage tool, and diff viewer for the terminal.

> Instead of switching between terminal and browser, you can inspect APIs, docs, and output right where you’re already working.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/treadiehq/openpreview/main/install.sh | bash
```

Then run:

```bash
preview https://opencode.ai
```

Current release targets:

- macOS Apple Silicon
- Linux x64

## Quick start

```bash
bun install
bun run dev -- https://planetscale.com
```

If you want a built CLI:

```bash
bun run build
bun link
preview https://privateconnect.co
```

## Common commands

```bash
preview <url>
preview <file>
preview --cmd gh pr view 123
preview diff before.json after.json
<command> | preview
<command> | preview --follow
preview skill <url>
preview --mode docs <url>
preview --inspect <url>
preview --explain <url>
```

## How detection works

- HTML normally opens in Docs mode.
- Dashboard mode is only used for pages that look like real metrics or status dashboards.
- Aligned CLI output and `.csv` / `.tsv` files open in Table mode.
- Log output and `.log` files open in Log mode.
- If auto-detection gets it wrong, force the mode with `--mode`.

Examples:

```bash
preview --mode docs https://resend.com
preview --cmd curl https://api.example.com/users
preview diff https://docs.example.com/v1 https://docs.example.com/v2
preview --mode dashboard ./fixtures/sample-dashboard.html
ps aux | preview
docker logs app | preview
docker logs -f app | preview --follow
```

## In app

- `q` or `Esc`: quit
- `/`: search
- `Tab`: switch panes
- `Enter`: follow the selected link or drill into JSON
- `y`: copy the current section, row, code block, error group, or link
- `Y`: copy the full extracted content
- `b`: go back in docs or JSON navigation
- `o`: open the current URL in your browser
- `F`: jump to the first error in logs
- `s` then `k`: export a skill bundle when the current content supports it
- `i`: inspect fetch and detection details
- `?`: show help

## Command output

```bash
preview --cmd gh pr view 123
preview --cmd kubectl get pods -o json
preview --cmd docker logs api
ps aux | preview
docker logs app | preview
docker logs -f app | preview --follow
```

Use `--cmd` when you want Preview to run the command for you. Use pipes when you already have the output in your shell flow.

## Docs, JSON, logs, and diff

```bash
preview https://docs.example.com
preview diff before.json after.json
preview diff --left-cmd "kubectl get pods -o json" snapshots/pods.json
preview --mode table ./fixtures/sample-table.txt
preview --mode log ./fixtures/sample-log.txt
```

`--follow` is for live stdin only. It keeps rendering new output and retains the last `10 MB` in memory.

Docs mode keeps link history in-app, follows links with caching, and lets you copy the selected code block or link directly. JSON mode supports drill-down with path-aware copy. Log mode collapses repeats, filters by severity, and jumps to the first failure.

## Skill export

```bash
preview skill <url>
preview skill <file>
cat notes.md | preview skill
```

Supported content:

- Docs pages
- Markdown
- GitHub PR text
- Table output
- Log output
- Plain text

Each export is saved under `./openpreview-exports/` and includes:

- `SKILL.md`
- `references/source.md`

## Updating

```bash
preview update
preview update --check
```

## When a page looks wrong

Try these in order:

```bash
preview --mode docs <url>
preview --inspect <url>
preview --explain <url>
```

`--inspect` opens the in-app debug view. `--explain` prints a plain-text report with the detected mode, parser, bytes fetched, truncation status, and detection signals.

## Development

```bash
bun test
bun run build
bun run preview:planetscale
bun run preview:privateconnect
```

Manual test fixtures live in `fixtures/`.

## License

[FSL-1.1-MIT](LICENSE)
