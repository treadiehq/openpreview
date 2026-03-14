import type { InputSource, ParsedGitHubPR } from "../models.ts";

/**
 * Parse PR-like text (e.g. from `gh pr view` or pasted content).
 * Heuristic-based; no GitHub API.
 */
export function parseGitHubPR(raw: string, source: InputSource): ParsedGitHubPR {
  const lines = raw.split(/\r?\n/);
  let title = "Pull Request";
  let author: string | undefined;
  let status: string | undefined;
  let body = "";
  const files: ParsedGitHubPR["files"] = [];
  const comments: ParsedGitHubPR["comments"] = [];

  let phase: "header" | "body" | "files" | "comments" | "other" = "header";
  let bodyLines: string[] = [];
  let currentComment: { author?: string; body: string } | null = null;
  let pendingHeading: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (/^#\s+.+/.test(line) && !title.match(/[^\s]/)) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (/^#\s+.+/.test(line) && title === "Pull Request") {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (/^title:\s+/i.test(trimmed)) {
      title = trimmed.replace(/^title:\s+/i, "").trim();
      continue;
    }

    if (/^##\s+Author/i.test(line)) {
      pendingHeading = "author";
      continue;
    }
    if (/^##\s+State/i.test(line)) {
      pendingHeading = "state";
      continue;
    }
    if (/^##\s+Body/i.test(line) || /^##\s+Description/i.test(line)) {
      phase = "body";
      pendingHeading = null;
      continue;
    }
    if (/^##\s+Files?\s*(changed)?/i.test(line)) {
      phase = "files";
      pendingHeading = null;
      continue;
    }
    if (/^##\s+Comments?/i.test(line)) {
      phase = "comments";
      pendingHeading = null;
      continue;
    }

    if (pendingHeading && trimmed) {
      if (pendingHeading === "author") {
        author = trimmed.replace(/^@/, "");
      } else if (pendingHeading === "state") {
        status = trimmed;
      }
      pendingHeading = null;
      continue;
    }

    if (/^(author|user):\s+/i.test(trimmed)) {
      author = trimmed.replace(/^(author|user):\s+/i, "").trim();
      continue;
    }
    if (/^state:\s+/i.test(trimmed)) {
      status = trimmed.replace(/^state:\s+/i, "").trim();
      continue;
    }
    if (/^(body|description):/i.test(trimmed)) {
      phase = "body";
      if (trimmed.includes(":")) bodyLines.push(trimmed.replace(/^(body|description):\s*/i, ""));
      continue;
    }

    if (phase === "files") {
      const fileMatch = trimmed.match(/^([^\s#]+)\s+([AMDRC?]+)?/);
      if (fileMatch && fileMatch[1]) {
        files.push({ path: fileMatch[1], status: fileMatch[2] });
      }
      continue;
    }

    if (phase === "comments" || /comments?:/i.test(trimmed)) {
      if (/comments?:/i.test(trimmed) && phase !== "comments") {
        phase = "comments";
        continue;
      }
      if (/^@\w+/.test(trimmed)) {
        if (currentComment) comments.push(currentComment);
        const authorMatch = trimmed.match(/^@(\w+)/);
        currentComment = {
          author: authorMatch?.[1],
          body: trimmed.replace(/^@\w+[:\s]*/, "").trim(),
        };
        continue;
      }
      if (line.startsWith(">") && currentComment) {
        currentComment.body += "\n" + line.replace(/^>\s?/, "");
        continue;
      }
      if (trimmed && currentComment) {
        currentComment.body += "\n" + trimmed;
        continue;
      }
      continue;
    }

    if (/files? changed/i.test(trimmed)) {
      phase = "files";
      continue;
    }

    if (phase === "body" && trimmed) bodyLines.push(line);
  }

  if (currentComment) comments.push(currentComment);
  body = bodyLines.join("\n").trim() || raw.slice(0, 3000);

  return {
    kind: "github-pr",
    title,
    author,
    status,
    body,
    files: files.length ? files : [{ path: "(no files listed)", status: undefined }],
    comments,
    url: source.type === "url" ? source.value : undefined,
  };
}
