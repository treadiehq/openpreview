export interface StreamBufferState {
  content: string;
  totalBytes: number;
  displayedBytes: number;
  droppedBytes: number;
  truncated: boolean;
}

export function createEmptyStreamBuffer(): StreamBufferState {
  return {
    content: "",
    totalBytes: 0,
    displayedBytes: 0,
    droppedBytes: 0,
    truncated: false,
  };
}

export function appendStreamChunk(
  current: StreamBufferState,
  chunk: string,
  maxBytes: number,
): StreamBufferState {
  const combined = current.content + chunk;
  const totalBytes = current.totalBytes + Buffer.byteLength(chunk, "utf8");
  const trimmed = trimToLastBytes(combined, maxBytes);
  const displayedBytes = Buffer.byteLength(trimmed, "utf8");
  const droppedBytes = Math.max(0, totalBytes - displayedBytes);

  return {
    content: trimmed,
    totalBytes,
    displayedBytes,
    droppedBytes,
    truncated: droppedBytes > 0,
  };
}

export function trimToLastBytes(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxBytes) return text;

  const sliced = bytes.subarray(bytes.length - maxBytes);
  return Buffer.from(sliced).toString("utf8").replace(/^\uFFFD+/, "");
}
