import * as cheerio from "cheerio";
import type { InputSource, ParsedDashboard } from "../models.ts";

/**
 * Extract summary-friendly structure from dashboard-like HTML:
 * headings, number-like values, links, and panel-like blocks.
 */
export function parseDashboard(html: string, source: InputSource): ParsedDashboard {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || "Dashboard";
  const panels: ParsedDashboard["panels"] = [];
  const metrics: string[] = [];
  const links: ParsedDashboard["links"] = [];

  $("[class*='metric'], [class*='stat'], [class*='card'], [class*='panel'], [data-value]").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const titleEl = $el.find("h1, h2, h3, h4, .title, [class*='label']").first();
    const panelTitle = titleEl.length ? titleEl.text().trim() : undefined;
    const values = text.split(/\s+/).filter((t) => /^\d+$|^\d+[.,]\d+%?$/.test(t));
    if (values.length) {
      panels.push({ title: panelTitle, values, links: [] });
      metrics.push(...values);
    }
  });

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text && href.startsWith("http")) links.push({ href, text });
  });

  const allHeadings = $("h1, h2, h3, h4");
  if (panels.length === 0 && allHeadings.length > 0) {
    allHeadings.slice(0, 10).each((_, el) => {
      const $el = $(el);
      const nextText = $el.next().text().trim().slice(0, 100);
      panels.push({ title: $el.text().trim(), values: nextText ? [nextText] : [] });
    });
  }

  if (panels.length === 0) {
    panels.push({ title: "Content", values: [$("body").text().trim().slice(0, 500).replace(/\s+/g, " ")] });
  }

  return {
    kind: "dashboard",
    title,
    panels: panels.slice(0, 20),
    metrics: [...new Set(metrics)].slice(0, 30),
    links: links.slice(0, 50),
  };
}
