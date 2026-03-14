import type { InputSource, ParsedJson } from "../models.ts";
import type { JsonNode } from "../models.ts";

export function parseJson(raw: string, source: InputSource): ParsedJson {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch (e) {
    const msg = (e as SyntaxError).message || "Invalid JSON";
    const posMatch = msg.match(/position (\d+)/i);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const before = raw.slice(0, pos);
      const lineNum = (before.match(/\n/g) || []).length + 1;
      const col = pos - before.lastIndexOf("\n");
      throw new Error(`Invalid JSON at line ${lineNum}, column ${col}: ${msg}`);
    }
    throw new Error(`Invalid JSON: ${msg}`);
  }

  const node = toJsonNode(root);
  const isArrayOfObjects = Array.isArray(root) && root.length > 0 && root.every((x) => x !== null && typeof x === "object" && !Array.isArray(x));
  const rows = isArrayOfObjects ? (root as Record<string, unknown>[]) : undefined;
  const schemaSummary = summarizeSchema(root);

  return {
    kind: "json",
    root,
    schemaSummary,
    isArrayOfObjects,
    rows,
    node,
  };
}

function toJsonNode(value: unknown): JsonNode | null {
  if (value === null || typeof value !== "object") return value as JsonNode;
  if (Array.isArray(value)) {
    const inferredKeys = inferKeys(value);
    return {
      type: "array",
      length: value.length,
      value,
      inferredKeys: inferredKeys.length ? inferredKeys : undefined,
    };
  }
  return {
    type: "object",
    keys: Object.keys(value as object),
    value: value as Record<string, unknown>,
  };
}

function inferKeys(arr: unknown[]): string[] {
  const keys = new Set<string>();
  for (const item of arr.slice(0, 20)) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      Object.keys(item as object).forEach((k) => keys.add(k));
    }
  }
  return [...keys];
}

function summarizeSchema(root: unknown): string {
  if (Array.isArray(root)) {
    if (root.length === 0) return "[]";
    const first = root[0];
    if (first !== null && typeof first === "object" && !Array.isArray(first)) {
      return `array(${root.length}) of { ${Object.keys(first as object).join(", ")} }`;
    }
    return `array(${root.length})`;
  }
  if (root !== null && typeof root === "object") {
    return `object: ${Object.keys(root as object).join(", ")}`;
  }
  return typeof root;
}
