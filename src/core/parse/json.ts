import type {
  InputSource,
  JsonEntrySummary,
  JsonPaginationInfo,
  ParsedJson,
} from "../models.ts";
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
  const errorSummary = detectErrorSummary(root);
  const pagination = detectPagination(root);
  const classification = classifyJson(root, errorSummary, pagination);
  const entries = buildEntrySummaries(root, rows);
  const anomalies = detectJsonAnomalies(root, rows, errorSummary, pagination);

  return {
    kind: "json",
    root,
    schemaSummary,
    isArrayOfObjects,
    rows,
    node,
    classification,
    entries,
    errorSummary,
    pagination,
    anomalies,
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

function classifyJson(
  root: unknown,
  errorSummary: string | undefined,
  pagination: JsonPaginationInfo | undefined,
): ParsedJson["classification"] {
  if (errorSummary) return "error";
  if (pagination) return "paginated";
  if (Array.isArray(root)) return "array";
  if (root !== null && typeof root === "object") {
    return isSchemaLike(root as Record<string, unknown>) ? "schema" : "object";
  }
  return "primitive";
}

function buildEntrySummaries(
  root: unknown,
  rows?: Record<string, unknown>[],
): JsonEntrySummary[] {
  if (Array.isArray(root)) {
    return root.slice(0, 200).map((value, index) => ({
      path: `[${index}]`,
      label: `#${index + 1}`,
      type: getValueType(value),
      preview: summarizeValue(value),
      value,
    }));
  }

  if (root !== null && typeof root === "object") {
    return Object.entries(root as Record<string, unknown>).map(([key, value]) => ({
      path: key,
      label: key,
      type: getValueType(value),
      preview: summarizeValue(value),
      value,
    }));
  }

  return [
    {
      path: "$",
      label: "value",
      type: getValueType(root),
      preview: summarizeValue(root),
      value: root,
    },
  ];
}

function detectErrorSummary(root: unknown): string | undefined {
  if (!root || typeof root !== "object" || Array.isArray(root)) return undefined;
  const record = root as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : undefined;
  const error = firstString(
    record.error,
    record.message,
    record.detail,
    record.title,
    Array.isArray(record.errors) ? record.errors.join(", ") : undefined,
  );

  if (status && status >= 400) {
    return error ? `HTTP ${status}: ${error}` : `HTTP ${status} error response`;
  }

  if (typeof record.success === "boolean" && record.success === false && error) {
    return error;
  }

  if (record.success === true) {
    const hasErrorContent = typeof record.error === "string" && record.error.length > 0;
    const hasErrorsContent = Array.isArray(record.errors) && record.errors.length > 0;
    if (!hasErrorContent && !hasErrorsContent) {
      return undefined;
    }
  }

  if (error && ("error" in record || "errors" in record || "message" in record)) {
    return error;
  }

  return undefined;
}

function detectPagination(root: unknown): JsonPaginationInfo | undefined {
  if (!root || typeof root !== "object" || Array.isArray(root)) return undefined;
  const record = root as Record<string, unknown>;
  const itemEntry = findFirstArrayEntry(record, ["items", "data", "results", "nodes", "records"]);
  const nextEntry = findFirstValueEntry(record, ["next", "next_page", "nextPage", "cursor", "nextCursor"]);
  const totalEntry = findFirstNumberEntry(record, ["total", "total_count", "count", "totalCount"]);
  const hasMore =
    typeof record.has_more === "boolean"
      ? record.has_more
      : typeof record.hasMore === "boolean"
        ? record.hasMore
        : undefined;

  if (!itemEntry && !nextEntry && !totalEntry && hasMore === undefined) {
    return undefined;
  }

  return {
    itemPath: itemEntry?.path,
    nextPath: nextEntry?.path,
    totalPath: totalEntry?.path,
    count: totalEntry?.value,
    hasMore,
  };
}

function detectJsonAnomalies(
  root: unknown,
  rows: Record<string, unknown>[] | undefined,
  errorSummary: string | undefined,
  pagination: JsonPaginationInfo | undefined,
): string[] {
  const anomalies: string[] = [];

  if (errorSummary) {
    anomalies.push(`Error payload detected: ${errorSummary}`);
  }

  if (Array.isArray(root) && root.length === 0) {
    anomalies.push("Array response is empty.");
  }

  if (rows && rows.length > 1) {
    const baseline = new Set(Object.keys(rows[0] ?? {}));
    const inconsistent = rows.slice(1, 20).some((row) => {
      const keys = Object.keys(row);
      return keys.length !== baseline.size || keys.some((key) => !baseline.has(key));
    });
    if (inconsistent) {
      anomalies.push("Array rows use inconsistent object keys.");
    }
  }

  if (root && typeof root === "object" && !Array.isArray(root)) {
    const nullKeys = Object.entries(root as Record<string, unknown>)
      .filter(([, value]) => value === null)
      .map(([key]) => key);
    if (nullKeys.length > 0) {
      anomalies.push(`Null top-level fields: ${nullKeys.slice(0, 6).join(", ")}`);
    }
  }

  if (pagination && pagination.itemPath && pagination.count === 0) {
    anomalies.push("Paginated response reports zero items.");
  }

  return anomalies;
}

function getValueType(value: unknown): JsonEntrySummary["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value as JsonEntrySummary["type"];
}

function summarizeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array(0)";
    const first = value[0];
    if (first !== null && typeof first === "object" && !Array.isArray(first)) {
      return `array(${value.length}) of { ${Object.keys(first as object).slice(0, 6).join(", ")} }`;
    }
    return `array(${value.length})`;
  }
  if (typeof value === "object") {
    return `{ ${Object.keys(value as object).slice(0, 8).join(", ")} }`;
  }
  return String(value).replace(/\s+/g, " ").slice(0, 120);
}

function isSchemaLike(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.includes("properties") ||
    keys.includes("$schema") ||
    keys.includes("definitions") ||
    keys.includes("required") ||
    (keys.includes("type") && keys.includes("properties"))
  );
}

function findFirstArrayEntry(
  value: Record<string, unknown>,
  keys: string[],
): { path: string; value: unknown[] } | undefined {
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return { path: key, value: value[key] as unknown[] };
    }
  }
  return undefined;
}

function findFirstValueEntry(
  value: Record<string, unknown>,
  keys: string[],
): { path: string; value: unknown } | undefined {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      return { path: key, value: value[key] };
    }
  }
  return undefined;
}

function findFirstNumberEntry(
  value: Record<string, unknown>,
  keys: string[],
): { path: string; value: number } | undefined {
  for (const key of keys) {
    if (typeof value[key] === "number") {
      return { path: key, value: value[key] as number };
    }
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
