# OpenPreview

Preview URLs, files, and command output in your terminal.

It works well for docs pages, JSON, markdown, GitHub PR text, dashboards, CLI tables, logs, and plain text.

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
preview --mode dashboard ./fixtures/sample-dashboard.html
ps aux | preview
docker logs app | preview
docker logs -f app | preview --follow
```

## In app

- `q` or `Esc`: quit
- `/`: search
- `Tab`: switch panes
- `Enter`: open the selected link
- `y`: copy the full extracted content
- `s` then `k`: export a skill bundle when the current content supports it
- `i`: inspect fetch and detection details
- `?`: show help

## Tables, Logs, and Streams

```bash
ps aux | preview
docker logs app | preview
docker logs -f app | preview --follow
preview --mode table ./fixtures/sample-table.txt
preview --mode log ./fixtures/sample-log.txt
```

`--follow` is for live stdin only. It keeps rendering new output and retains the last `10 MB` in memory.

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
