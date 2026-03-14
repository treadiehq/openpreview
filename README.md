# Preview

Preview URLs, files, and command output in your terminal.

It works well for docs pages, JSON, markdown, GitHub PR text, dashboards, and plain text.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/treadiehq/openpreview/main/install.sh | bash
```

Then run:

```bash
preview https://opencode.ai
```

The installer downloads the latest GitHub Release and installs the `preview` binary.

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
preview --mode docs <url>
preview --inspect <url>
preview --explain <url>
```

## How detection works

- HTML normally opens in Docs mode.
- Dashboard mode is only used for pages that look like real metrics or status dashboards.
- If auto-detection gets it wrong, force the mode with `--mode`.

Examples:

```bash
preview --mode docs https://resend.com
preview --mode dashboard ./fixtures/sample-dashboard.html
```

## In app

- `q` or `Esc`: quit
- `/`: search
- `Tab`: switch panes
- `Enter`: open the selected link
- `y`: copy the selected value
- `i`: inspect fetch and detection details
- `?`: show help

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
