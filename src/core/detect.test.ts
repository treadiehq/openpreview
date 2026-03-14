import { describe, expect, test } from "bun:test";
import { detectContentType } from "./detect.ts";
import type { InputSource } from "./models.ts";

const stdin: InputSource = { type: "stdin", value: "stdin" };
const file = (v: string): InputSource => ({ type: "file", value: v });
const url = (v: string): InputSource => ({ type: "url", value: v });

describe("detectContentType", () => {
  describe("Content-Type header priority", () => {
    test("application/json overrides heuristics", () => {
      const r = detectContentType("# Markdown heading", stdin, "application/json; charset=utf-8");
      expect(r.type).toBe("json");
    });

    test("text/markdown overrides heuristics", () => {
      const r = detectContentType('{"json": true}', stdin, "text/markdown");
      expect(r.type).toBe("markdown");
    });

    test("text/html returns html", () => {
      const r = detectContentType("<html></html>", url("https://example.com"), "text/html");
      expect(r.type).toBe("html");
    });

    test("text/html marketing page with cards and numbers stays html", () => {
      const html = `
        <html>
          <head>
            <title>PlanetScale</title>
            <script>window.__DATA__ = [1,2,3,4,5,6,7,8,9,10,11,12];</script>
          </head>
          <body>
            <main>
              <section class="hero">
                <h1>The world's fastest and most scalable cloud databases</h1>
                <p>PlanetScale brings you the fastest databases available in the cloud, with Postgres and Vitess delivering exceptional speed and reliability for demanding workloads.</p>
                <p>Vitess was developed at YouTube to scale main databases to petabytes of data on 70000 nodes across 20 data centers, and PlanetScale now manages it for teams that need high performance.</p>
              </section>
              <section class="feature-grid">
                <div class="card"><h2>Performance</h2><p>Blazing fast NVMe drives unlock unlimited IOPS for critical workloads.</p></div>
                <div class="card"><h2>Security</h2><p>Flexible deployment options satisfy security and compliance requirements.</p></div>
              </section>
            </main>
          </body>
        </html>
      `;
      const r = detectContentType(html, url("https://planetscale.com"), "text/html; charset=utf-8");
      expect(r.type).toBe("html");
    });

    test("real-world planetscale regression fixture stays html", async () => {
      const html = await Bun.file("fixtures/regression-planetscale.html").text();
      const r = detectContentType(html, url("https://planetscale.com"), "text/html; charset=utf-8");
      expect(r.type).toBe("html");
      expect(r.explanation?.summary).toBe("Detected Docs mode from HTML content.");
    });

    test("forced docs mode overrides dashboard heuristics", () => {
      const html = '<div class="metric">100</div><div class="stat">200</div>';
      const r = detectContentType(html, url("https://example.com/dashboard"), "text/html", "docs");
      expect(r.type).toBe("html");
      expect(r.explanation?.rule).toBe("forced-mode");
    });

    test("forced dashboard mode overrides docs heuristics", () => {
      const html = "<html><body><main><h1>Docs</h1><p>Longer body content here.</p></main></body></html>";
      const r = detectContentType(html, url("https://example.com/docs"), "text/html", "dashboard");
      expect(r.type).toBe("dashboard");
    });
  });

  describe("URL detection", () => {
    test("URL with .json extension", () => {
      const r = detectContentType("{}", url("https://api.example.com/data.json"));
      expect(r.type).toBe("json");
    });

    test("URL with .json?query params", () => {
      const r = detectContentType("{}", url("https://api.example.com/data.json?page=1"));
      expect(r.type).toBe("json");
    });

    test("URL with .md#hash", () => {
      const r = detectContentType("# heading", url("https://example.com/readme.md#section"));
      expect(r.type).toBe("markdown");
    });

    test("plain URL returns html", () => {
      const r = detectContentType("<html><body>hi</body></html>", url("https://example.com"));
      expect(r.type).toBe("html");
    });

    test("dashboard-like URL returns dashboard", () => {
      const html = '<div class="metric">100</div><div class="stat">200</div>';
      const r = detectContentType(html, url("https://example.com/dashboard"));
      expect(r.type).toBe("dashboard");
      expect(r.explanation?.nextAction).toContain("--mode docs");
    });

    test("real-world privateconnect regression fixture stays html", async () => {
      const html = await Bun.file("fixtures/regression-privateconnect.html").text();
      const r = detectContentType(html, url("https://privateconnect.co"), "text/html");
      expect(r.type).toBe("html");
      expect(r.explanation?.signals.some((signal) => signal.name === "heading count")).toBe(true);
    });

    test("ARIA role=meter with numbers triggers dashboard", () => {
      const html = '<div role="meter">50</div><span>10 20 30 40 50 60</span>';
      const r = detectContentType(html, url("https://example.com/status"));
      expect(r.type).toBe("dashboard");
    });

    test("ARIA role=progressbar with numbers triggers dashboard", () => {
      const html = '<div role="progressbar">75%</div><span>1 2 3 4 5 6</span>';
      const r = detectContentType(html, url("https://example.com/status"));
      expect(r.type).toBe("dashboard");
    });

    test("<meter> element with numbers triggers dashboard", () => {
      const html = '<meter value="0.6">60%</meter><span>10 20 30 40 50 60</span>';
      const r = detectContentType(html, url("https://example.com/health"));
      expect(r.type).toBe("dashboard");
    });

    test("<progress> element with numbers triggers dashboard", () => {
      const html = '<progress value="70" max="100"></progress><span>10 20 30 40 50 60</span>';
      const r = detectContentType(html, url("https://example.com/health"));
      expect(r.type).toBe("dashboard");
    });

    test("widget class with numbers triggers dashboard", () => {
      const html = '<div class="widget">Revenue: 100 200 300 400 500 600</div>';
      const r = detectContentType(html, url("https://example.com/analytics"));
      expect(r.type).toBe("dashboard");
    });

    test("dashboard title with panel cards and numbers triggers dashboard", () => {
      const html = `
        <html>
          <head><title>Sales Dashboard</title></head>
          <body>
            <div class="panel"><h2>Revenue</h2><p>100 200 300 400 500 600</p></div>
          </body>
        </html>
      `;
      const r = detectContentType(html, url("https://example.com/dashboard"));
      expect(r.type).toBe("dashboard");
    });

    test("multiple tables with numeric cells triggers dashboard", () => {
      const html = `
        <table><tr><td>100</td><td>200</td></tr></table>
        <table><tr><td>300</td><td>400</td></tr></table>
        <table><tr><td>500</td><td>600</td></tr></table>
      `;
      const r = detectContentType(html, url("https://example.com/report"));
      expect(r.type).toBe("dashboard");
    });
  });

  describe("file extension detection", () => {
    test(".json file", () => {
      const r = detectContentType("{}", file("data.json"));
      expect(r.type).toBe("json");
    });

    test(".md file", () => {
      const r = detectContentType("hello", file("README.md"));
      expect(r.type).toBe("markdown");
    });

    test(".markdown file", () => {
      const r = detectContentType("hello", file("doc.markdown"));
      expect(r.type).toBe("markdown");
    });

    test(".html file", () => {
      const r = detectContentType("<html></html>", file("page.html"));
      expect(r.type).toBe("html");
    });

    test(".htm file", () => {
      const r = detectContentType("<html></html>", file("page.htm"));
      expect(r.type).toBe("html");
    });

    test(".txt file falls to heuristics", () => {
      const r = detectContentType("just text", file("notes.txt"));
      expect(r.type).toBe("text");
    });
  });

  describe("heuristic detection (stdin)", () => {
    test("JSON object", () => {
      expect(detectContentType('{"key": "value"}', stdin).type).toBe("json");
    });

    test("JSON array", () => {
      expect(detectContentType('[1, 2, 3]', stdin).type).toBe("json");
    });

    test("markdown with heading", () => {
      expect(detectContentType("# Title\n\nContent", stdin).type).toBe("markdown");
    });

    test("markdown with list", () => {
      expect(detectContentType("- item one\n- item two", stdin).type).toBe("markdown");
    });

    test("markdown with link", () => {
      expect(detectContentType("Check [this](https://example.com)", stdin).type).toBe("markdown");
    });

    test("markdown with code fence", () => {
      expect(detectContentType("```js\nconsole.log('hi')\n```", stdin).type).toBe("markdown");
    });

    test("GitHub PR detection", () => {
      const pr = "# Merge pull request\n\nAuthor: alice\nFiles changed\nsrc/cli.ts A";
      expect(detectContentType(pr, stdin).type).toBe("github-pr");
    });

    test("plain text fallback", () => {
      expect(detectContentType("hello world", stdin).type).toBe("text");
    });

    test("empty string returns text", () => {
      expect(detectContentType("", stdin).type).toBe("text");
    });

    test("whitespace only returns text", () => {
      expect(detectContentType("   \n   ", stdin).type).toBe("text");
    });
  });
});
