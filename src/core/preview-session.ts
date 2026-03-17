import { detectContentType } from "./detect.ts";
import { fetchContentWithMeta, MAX_CONTENT_SIZE_LABEL, type FetchResult } from "./fetch.ts";
import type {
  AnyParsed,
  DetectedContent,
  InputSource,
  PreviewInspectInfo,
  PreviewMode,
} from "./models.ts";
import { parse } from "./parse/index.ts";

export interface LoadedPreview {
  doc: AnyParsed;
  source: InputSource;
  detected: DetectedContent;
  inspectInfo: PreviewInspectInfo;
}

export async function loadPreview(source: InputSource, forcedMode: PreviewMode = "auto"): Promise<LoadedPreview> {
  const fetchResult = await fetchContentWithMeta(source);
  const resolvedSource = source.type === "stdin"
    ? { ...source, label: "stdin" }
    : source.type === "command"
      ? { ...source, label: source.label ?? source.value }
      : source;
  const detected = detectContentType(fetchResult.content, resolvedSource, fetchResult.contentType, forcedMode);
  const doc = await parse(detected);

  return {
    doc,
    source: resolvedSource,
    detected,
    inspectInfo: buildInspectInfo(resolvedSource, fetchResult, detected, forcedMode),
  };
}

function buildInspectInfo(
  source: InputSource,
  fetchResult: FetchResult,
  detected: DetectedContent,
  forcedMode: PreviewMode,
): PreviewInspectInfo {
  return {
    sourceType: source.type,
    forcedMode,
    detectedType: detected.type,
    contentType: fetchResult.contentType,
    durationMs: fetchResult.durationMs,
    statusCode: fetchResult.statusCode,
    finalUrl: fetchResult.finalUrl,
    exitCode: fetchResult.exitCode,
    stderrBytes: fetchResult.stderrBytes,
    totalBytes: fetchResult.totalBytes,
    displayedBytes: fetchResult.displayedBytes,
    truncated: fetchResult.truncated ?? false,
    truncationReason: fetchResult.truncated
      ? `Fetched content exceeded ${MAX_CONTENT_SIZE_LABEL}. Preview is showing the first ${MAX_CONTENT_SIZE_LABEL}.`
      : undefined,
    detectionSummary: detected.explanation?.summary ?? `Detected ${detected.type}.`,
    nextAction: detected.explanation?.nextAction,
    signals: detected.explanation?.signals ?? [],
    jsHeavy: detected.explanation?.jsHeavy ?? false,
  };
}
