import { describe, expect, test } from "bun:test";
import { parseJson } from "./json.ts";
import { parseMarkdown } from "./markdown.ts";
import { parseDocs } from "./docs.ts";
import { parseGitHubPR } from "./github-pr.ts";
import { parseDashboard } from "./dashboard.ts";
import { parseTable } from "./table.ts";
import { parseLog } from "./log.ts";
import type { InputSource, ParsedDocs } from "../models.ts";

const stdin: InputSource = { type: "stdin", value: "stdin" };
const fileSource: InputSource = { type: "file", value: "test.md" };
const urlSource: InputSource = { type: "url", value: "https://example.com" };

describe("parseJson", () => {
  test("parses simple object", () => {
    const doc = parseJson('{"name": "Alice", "age": 30}', stdin);
    expect(doc.kind).toBe("json");
    expect(doc.schemaSummary).toContain("object");
    expect(doc.isArrayOfObjects).toBe(false);
  });

  test("parses array of objects", () => {
    const doc = parseJson('[{"id": 1}, {"id": 2}]', stdin);
    expect(doc.kind).toBe("json");
    expect(doc.isArrayOfObjects).toBe(true);
    expect(doc.rows).toHaveLength(2);
    expect(doc.schemaSummary).toContain("array(2)");
  });

  test("parses empty array", () => {
    const doc = parseJson("[]", stdin);
    expect(doc.schemaSummary).toBe("[]");
    expect(doc.isArrayOfObjects).toBe(false);
  });

  test("parses primitive", () => {
    const doc = parseJson("42", stdin);
    expect(doc.schemaSummary).toBe("number");
  });

  test("parses null", () => {
    const doc = parseJson("null", stdin);
    expect(doc.root).toBeNull();
  });

  test("throws on invalid JSON with position info", () => {
    expect(() => parseJson('{"a": }', stdin)).toThrow(/Invalid JSON/);
  });

  test("throws on empty string", () => {
    expect(() => parseJson("", stdin)).toThrow(/Invalid JSON/);
  });

  test("handles deeply nested objects", () => {
    const nested = JSON.stringify({ a: { b: { c: { d: 1 } } } });
    const doc = parseJson(nested, stdin);
    expect(doc.kind).toBe("json");
  });

  test("handles mixed array (not array of objects)", () => {
    const doc = parseJson('[1, "two", null]', stdin);
    expect(doc.isArrayOfObjects).toBe(false);
  });

  test("classifies error payloads and anomalies", () => {
    const doc = parseJson('{"status":404,"error":"Not found","request_id":null}', stdin);
    expect(doc.classification).toBe("error");
    expect(doc.errorSummary).toContain("404");
    expect(doc.anomalies.join(" ")).toContain("Null top-level");
  });

  test("detects paginated responses", () => {
    const doc = parseJson('{"items":[{"id":1}],"next":"cursor_2","total":10,"hasMore":true}', stdin);
    expect(doc.classification).toBe("paginated");
    expect(doc.pagination?.itemPath).toBe("items");
    expect(doc.pagination?.totalPath).toBe("total");
  });
});

describe("parseMarkdown", () => {
  test("extracts headings", async () => {
    const doc = await parseMarkdown("# Title\n## Section\n### Sub", fileSource);
    expect(doc.headings).toHaveLength(3);
    expect(doc.headings[0].text).toBe("Title");
    expect(doc.headings[0].level).toBe(1);
    expect(doc.title).toBe("Title");
  });

  test("extracts code blocks", async () => {
    const md = "# Test\n\n```typescript\nconst x = 1;\n```";
    const doc = await parseMarkdown(md, fileSource);
    expect(doc.codeBlocks).toHaveLength(1);
    expect(doc.codeBlocks[0].language).toBe("typescript");
    expect(doc.codeBlocks[0].code).toContain("const x = 1");
  });

  test("handles empty markdown", async () => {
    const doc = await parseMarkdown("", fileSource);
    expect(doc.headings).toHaveLength(0);
    expect(doc.codeBlocks).toHaveLength(0);
  });

  test("preserves raw content", async () => {
    const md = "# Hello\nWorld";
    const doc = await parseMarkdown(md, fileSource);
    expect(doc.raw).toBe(md);
  });
});

describe("parseDocs", () => {
  test("extracts title and description", () => {
    const html = `
      <html><head>
        <title>My Page</title>
        <meta name="description" content="A test page">
      </head><body><h1>Hello</h1></body></html>`;
    const doc = parseDocs(html, urlSource);
    expect(doc.title).toBe("My Page");
    expect(doc.description).toBe("A test page");
  });

  test("extracts sections from headings", () => {
    const html = `
      <html><body>
        <h1>Main</h1><p>Content one</p>
        <h2>Sub</h2><p>Content two</p>
      </body></html>`;
    const doc = parseDocs(html, urlSource);
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);
  });

  test("ignores repeated headings from table of contents when building sections", () => {
    const html = `
      <html><body>
        <main>
          <div class="table-of-contents">
            <a href="#overview">Overview</a>
            <a href="#install">Install</a>
          </div>
          <article>
            <h1>Docs</h1>
            <p>Intro paragraph.</p>
            <h2 id="overview">Overview</h2>
            <p>Actual overview body.</p>
            <h2 id="install">Install</h2>
            <p>Run bun install first.</p>
          </article>
        </main>
      </body></html>`;

    const doc = parseDocs(html, urlSource);
    const overview = doc.sections.find((section) => section.title === "Overview");
    const install = doc.sections.find((section) => section.title === "Install");

    expect(overview?.content).toContain("Actual overview body.");
    expect(overview?.content).not.toContain("Run bun install first.");
    expect(install?.content).toContain("Run bun install first.");
    expect(doc.mainContent).not.toContain("Overview Install Overview");
  });

  test("keeps nested section content in DOM order", () => {
    const html = `
      <html><body>
        <main>
          <article>
            <div>
              <h2>How it works</h2>
              <div class="copy">
                <p>Private traffic reaches the hub first.</p>
                <p>Then it is forwarded to your server.</p>
              </div>
            </div>
            <section>
              <h2>Access by name</h2>
              <div><p>Use the DNS name for stable access.</p></div>
            </section>
          </article>
        </main>
      </body></html>`;

    const doc = parseDocs(html, urlSource);
    const howItWorks = doc.sections.find((section) => section.title === "How it works");

    expect(howItWorks?.content).toContain("Private traffic reaches the hub first.");
    expect(howItWorks?.content).toContain("Then it is forwarded to your server.");
    expect(howItWorks?.content).not.toContain("Use the DNS name for stable access.");
  });

  test("extracts links", () => {
    const html = `
      <html><body>
        <a href="https://example.com">Example</a>
        <a href="/relative">Relative</a>
      </body></html>`;
    const doc = parseDocs(html, urlSource);
    expect(doc.links.length).toBe(2);
    expect(doc.links[0].href).toBe("https://example.com/");
    expect(doc.links[1].href).toBe("https://example.com/relative");
  });

  test("resolves relative links against the source url", () => {
    const doc = parseDocs('<html><body><a href="/guide/install">Install</a></body></html>', urlSource);
    expect(doc.links[0]?.href).toBe("https://example.com/guide/install");
  });

  test("extracts code blocks", () => {
    const html = `<html><body><pre><code class="language-js">console.log('hi');</code></pre></body></html>`;
    const doc = parseDocs(html, urlSource);
    expect(doc.codeBlocks.length).toBe(1);
    expect(doc.codeBlocks[0].language).toBe("js");
  });

  test("preserves pre blocks inside sections as section code blocks", () => {
    const html = `
      <html><body>
        <main>
          <h2>How it works</h2>
          <pre><code>line 1
line 2</code></pre>
          <p>Encrypted end-to-end.</p>
        </main>
      </body></html>`;

    const doc = parseDocs(html, urlSource);
    expect(doc.sections[0]?.content).toContain("[[CODEBLOCK_0]]");
    expect(doc.sections[0]?.codeBlocks?.[0]?.code).toContain("line 1\nline 2");
    expect(doc.sections[0]?.content).toContain("Encrypted end-to-end.");
  });

  test("does not leak decorative numbering into the previous section", () => {
    const html = `
      <html><body>
        <main>
          <h2>How it works</h2>
          <p>Encrypted end-to-end.</p>
          <div>
            <span>01</span>
            <h3>Access by name</h3>
            <p>Use a stable service name.</p>
          </div>
        </main>
      </body></html>`;

    const doc = parseDocs(html, urlSource);
    const howItWorks = doc.sections.find((section) => section.title === "How it works");
    const accessByName = doc.sections.find((section) => section.title === "Access by name");

    expect(howItWorks?.content).toBe("Encrypted end-to-end.");
    expect(accessByName?.content).toBe("Use a stable service name.");
  });

  test("does not truncate long section content", () => {
    const longParagraph = `start ${"chunk ".repeat(2500)}end`;
    const html = `
      <html><body>
        <main>
          <h2>Long section</h2>
          <p>${longParagraph}</p>
        </main>
      </body></html>`;

    const doc = parseDocs(html, urlSource);
    const section = doc.sections.find((item) => item.title === "Long section");

    expect(section?.content.startsWith("start chunk")).toBe(true);
    expect(section?.content.endsWith("end")).toBe(true);
    expect(section?.content.length).toBeGreaterThan(13_000);
  });

  test("parses the planetscale regression fixture without collapsing into dashboard-like summaries", async () => {
    const raw = await Bun.file("fixtures/regression-planetscale.html").text();
    const doc = parseDocs(raw, { type: "url", value: "https://planetscale.com" });
    const expected = await Bun.file("fixtures/regression-planetscale.expected.json").json();

    expect(doc.kind).toBe("docs");
    expect(doc.sections[0]?.title).toBe("The world's fastest and most scalable cloud databases");
    expect(doc.sections[0]?.content).toContain("Our blazing fast NVMe drives unlock unlimited IOPS");
    expect(doc.sections[0]?.content.length).toBeGreaterThan(400);
    expect(projectPlanetscaleSnapshot(doc)).toEqual(expected);
  });

  test("parses the privateconnect regression fixture without toc bleed or pre block loss", async () => {
    const raw = await Bun.file("fixtures/regression-privateconnect.html").text();
    const doc = parseDocs(raw, { type: "url", value: "https://privateconnect.co" });
    const howItWorks = doc.sections.find((section) => section.title === "How it works");
    const accessByName = doc.sections.find((section) => section.title === "Access by name");
    const expected = await Bun.file("fixtures/regression-privateconnect.expected.json").json();

    expect(doc.kind).toBe("docs");
    expect(howItWorks?.codeBlocks?.[0]?.code).toContain("Your Server");
    expect(accessByName?.content).not.toContain("01");
    expect(doc.links.some((link) => link.href === "https://privateconnect.co/docs/sharing")).toBe(true);
    expect(projectPrivateConnectSnapshot(doc)).toEqual(expected);
  });

  test("handles empty HTML", () => {
    const doc = parseDocs("", urlSource);
    expect(doc.title).toBe("Untitled");
    expect(doc.mainContent).toBe("No readable content found.");
  });

  test("handles malformed HTML gracefully", () => {
    const doc = parseDocs("<div><p>unclosed", urlSource);
    expect(doc.kind).toBe("docs");
    expect(doc.mainContent).toContain("unclosed");
  });

  test("sets url from source", () => {
    const doc = parseDocs("<html><body>hi</body></html>", urlSource);
    expect(doc.url).toBe("https://example.com");
  });

  test("sets empty url for file source", () => {
    const doc = parseDocs("<html><body>hi</body></html>", fileSource);
    expect(doc.url).toBe("");
  });
});

describe("parseGitHubPR", () => {
  test("extracts title from heading", () => {
    const doc = parseGitHubPR("# Fix bug in parser\n\nBody text", stdin);
    expect(doc.title).toBe("Fix bug in parser");
  });

  test("extracts author", () => {
    const doc = parseGitHubPR("# PR\nauthor: alice", stdin);
    expect(doc.author).toBe("alice");
  });

  test("extracts status", () => {
    const doc = parseGitHubPR("# PR\nstate: Open", stdin);
    expect(doc.status).toBe("Open");
  });

  test("extracts files", () => {
    const text = "# PR\nFiles changed\nsrc/cli.ts A\nsrc/app.ts M";
    const doc = parseGitHubPR(text, stdin);
    expect(doc.files.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts comments", () => {
    const text = "# PR\n## Comments\n@reviewer: LGTM";
    const doc = parseGitHubPR(text, stdin);
    expect(doc.comments.length).toBeGreaterThanOrEqual(1);
    expect(doc.comments[0].author).toBe("reviewer");
  });

  test("handles empty input", () => {
    const doc = parseGitHubPR("", stdin);
    expect(doc.kind).toBe("github-pr");
    expect(doc.title).toBe("Pull Request");
    expect(doc.files[0].path).toBe("(no files listed)");
  });

  test("handles fixture file", async () => {
    const raw = await Bun.file("fixtures/sample-pr.txt").text();
    const doc = parseGitHubPR(raw, stdin);
    expect(doc.title).toContain("OpenPreview CLI");
    expect(doc.author).toBe("dantelex");
  });
});

describe("parseDashboard", () => {
  test("extracts panels from metric-like elements", () => {
    const html = `
      <html><body>
        <div class="metric">
          <span class="label">Revenue</span>
          <span>125000</span>
        </div>
        <div class="stat">
          <span class="label">Users</span>
          <span>3842</span>
        </div>
      </body></html>`;
    const doc = parseDashboard(html, urlSource);
    expect(doc.panels.length).toBeGreaterThanOrEqual(1);
    expect(doc.metrics.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts links", () => {
    const html = `<html><body><a href="https://example.com">Report</a></body></html>`;
    const doc = parseDashboard(html, urlSource);
    expect(doc.links.length).toBe(1);
  });

  test("falls back to headings when no metrics", () => {
    const html = `<html><body><h2>Section A</h2><p>Info</p><h2>Section B</h2><p>More</p></body></html>`;
    const doc = parseDashboard(html, urlSource);
    expect(doc.panels.length).toBeGreaterThanOrEqual(1);
  });

  test("falls back to body content when no headings", () => {
    const html = `<html><body><p>Just some text content here.</p></body></html>`;
    const doc = parseDashboard(html, urlSource);
    expect(doc.panels.length).toBe(1);
    expect(doc.panels[0].title).toBe("Content");
  });

  test("handles empty HTML", () => {
    const doc = parseDashboard("", urlSource);
    expect(doc.kind).toBe("dashboard");
    expect(doc.title).toBe("Dashboard");
  });

  test("handles fixture file", async () => {
    const raw = await Bun.file("fixtures/sample-dashboard.html").text();
    const doc = parseDashboard(raw, urlSource);
    expect(doc.title).toBe("Sales Dashboard");
    expect(doc.panels.length).toBeGreaterThanOrEqual(1);
  });
});

describe("parseTable", () => {
  test("parses aligned cli output into columns and rows", async () => {
    const raw = await Bun.file("fixtures/sample-table.txt").text();
    const doc = parseTable(raw, stdin);

    expect(doc.kind).toBe("table");
    expect(doc.columns[0]).toBe("USER");
    expect(doc.columns).toContain("COMMAND");
    expect(doc.rows.length).toBe(3);
    expect(doc.rows[1]?.[0]).toBe("dante");
    expect(doc.rows[1]?.[doc.columns.length - 1]).toContain("bun run src/cli.ts");
  });

  test("falls back to a single-column table when forced on arbitrary text", () => {
    const doc = parseTable("hello\nworld", stdin);
    expect(doc.columns).toEqual(["Value"]);
    expect(doc.rows).toEqual([["hello"], ["world"]]);
  });
});

describe("parseLog", () => {
  test("parses structured log lines and stack traces", async () => {
    const raw = await Bun.file("fixtures/sample-log.txt").text();
    const doc = parseLog(raw, stdin);

    expect(doc.kind).toBe("log");
    expect(doc.entries.length).toBe(4);
    expect(doc.entries[0]?.level).toBe("info");
    expect(doc.entries[2]?.level).toBe("error");
    expect(doc.entries[2]?.details[0]).toContain("parseDocs");
    expect(doc.counts.error).toBe(1);
    expect(doc.counts.info).toBe(2);
  });

  test("parses ndjson logs", () => {
    const raw = `{"timestamp":"2026-03-16T09:00:00Z","level":"info","message":"Started"}\n{"timestamp":"2026-03-16T09:00:01Z","level":"error","message":"Failed"}`;
    const doc = parseLog(raw, stdin);

    expect(doc.entries.length).toBe(2);
    expect(doc.entries[0]?.timestamp).toBe("2026-03-16T09:00:00Z");
    expect(doc.entries[1]?.level).toBe("error");
  });

  test("collapses repeated groups and records first failure", () => {
    const raw = [
      "INFO booted",
      "INFO booted",
      "WARN slow query",
      "ERROR failed to connect",
      "ERROR failed to connect",
    ].join("\n");
    const doc = parseLog(raw, stdin);

    expect(doc.groups.length).toBe(3);
    expect(doc.groups[0]?.count).toBe(2);
    expect(doc.firstFailureIndex).toBe(3);
    expect(doc.repeatedGroupCount).toBe(2);
  });
});

function projectPlanetscaleSnapshot(doc: ParsedDocs) {
  return {
    title: doc.title,
    description: doc.description ?? null,
    sectionCount: doc.sections.length,
    sectionTitles: doc.sections.slice(0, 8).map((section) => section.title),
    firstSectionExcerpt: doc.sections[0]?.content.slice(0, 320) ?? null,
    firstLinkHrefs: doc.links.slice(0, 8).map((link) => link.href),
    codeBlockCount: doc.codeBlocks.length,
  };
}

function projectPrivateConnectSnapshot(doc: ParsedDocs) {
  const howItWorks = doc.sections.find((section) => section.title === "How it works");
  const accessByName = doc.sections.find((section) => section.title === "Access by name");

  return {
    title: doc.title,
    description: doc.description ?? null,
    sectionCount: doc.sections.length,
    sectionTitles: doc.sections.slice(0, 10).map((section) => section.title),
    howItWorksExcerpt: howItWorks?.content.slice(0, 320) ?? null,
    howItWorksCode: howItWorks?.codeBlocks?.[0]?.code.slice(0, 240) ?? null,
    accessByNameExcerpt: accessByName?.content.slice(0, 240) ?? null,
    firstLinkHrefs: doc.links.slice(0, 8).map((link) => link.href),
    codeBlockCount: doc.codeBlocks.length,
  };
}
