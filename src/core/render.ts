/**
 * Render a web page as colored half-block characters for terminal display.
 *
 * Pipeline: URL → Playwright screenshot (PNG) → decode → resize → ANSI half-blocks.
 *
 * The PNG decoder is minimal and inline (no external image deps).
 * Playwright is loaded dynamically — if it's missing, we surface an install hint.
 */

import { inflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecodedImage {
  width: number;
  height: number;
  /** RGBA row-major, 4 bytes per pixel */
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// Minimal PNG decoder (non-interlaced 8-bit RGB / RGBA only — covers
// everything Playwright/Puppeteer produces)
// ---------------------------------------------------------------------------

function decodePNG(buf: Buffer): DecodedImage {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error("Not a valid PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const chunk = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len; // 4 len + 4 type + data + 4 crc

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const bitDepth = chunk[8]!;
      colorType = chunk[9]!;
      if (chunk[12] !== 0) throw new Error("Interlaced PNGs are not supported");
      if (bitDepth !== 8) throw new Error(`Bit depth ${bitDepth} not supported (need 8)`);
      if (colorType !== 2 && colorType !== 6)
        throw new Error(`Color type ${colorType} not supported (need RGB=2 or RGBA=6)`);
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(chunk));
    } else if (type === "IEND") {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = 1 + width * channels;
  const pixels = new Uint8Array(width * height * 4);
  let prevRow = new Uint8Array(width * channels);

  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    const filter = raw[rowOff]!;
    const cur = new Uint8Array(width * channels);

    for (let i = 0; i < width * channels; i++) {
      const v = raw[rowOff + 1 + i]!;
      const a = i >= channels ? cur[i - channels]! : 0;
      const b = prevRow[i]!;
      const c = i >= channels ? prevRow[i - channels]! : 0;

      switch (filter) {
        case 0: cur[i] = v; break;
        case 1: cur[i] = (v + a) & 0xff; break;
        case 2: cur[i] = (v + b) & 0xff; break;
        case 3: cur[i] = (v + ((a + b) >>> 1)) & 0xff; break;
        case 4: cur[i] = (v + paeth(a, b, c)) & 0xff; break;
        default: cur[i] = v;
      }
    }

    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      pixels[di] = cur[si]!;
      pixels[di + 1] = cur[si + 1]!;
      pixels[di + 2] = cur[si + 2]!;
      pixels[di + 3] = channels === 4 ? cur[si + 3]! : 255;
    }

    prevRow = cur;
  }

  return { width, height, data: pixels };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---------------------------------------------------------------------------
// Nearest-neighbor resize
// ---------------------------------------------------------------------------

function resizeNearest(src: DecodedImage, dstW: number, dstH: number): DecodedImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor(y * src.height / dstH);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor(x * src.width / dstW);
      const si = (sy * src.width + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = src.data[si + 3]!;
    }
  }
  return { width: dstW, height: dstH, data: out };
}

// ---------------------------------------------------------------------------
// Half-block ANSI converter
//
// Each terminal cell packs two vertical pixels using ▀ (upper-half block):
//   foreground = top pixel color, background = bottom pixel color.
// Uses 24-bit truecolor escapes (\x1b[38;2;R;G;Bm / \x1b[48;2;R;G;Bm).
// Consecutive characters sharing the same fg+bg pair are batched to keep
// string length reasonable.
// ---------------------------------------------------------------------------

function hexPad(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${hexPad(r)}${hexPad(g)}${hexPad(b)}`;
}

/**
 * Produce hex-color segments for framework-native rendering (Box + Text).
 * Each segment carries a foreground hex and character count.
 * Consecutive identical colors are merged for efficiency.
 */
export interface ColorSegment {
  fg: string;
  bg: string;
  count: number;
}

export function imageToSegmentRows(img: DecodedImage): ColorSegment[][] {
  const rows: ColorSegment[][] = [];

  for (let y = 0; y < img.height; y++) {
    const segments: ColorSegment[] = [];

    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      const r = img.data[idx]!;
      const g = img.data[idx + 1]!;
      const b = img.data[idx + 2]!;
      const fg = rgbHex(r, g, b);

      const last = segments[segments.length - 1];
      if (last && last.fg === fg) {
        last.count++;
      } else {
        segments.push({ fg, bg: fg, count: 1 });
      }
    }

    rows.push(segments);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Playwright screenshot
// ---------------------------------------------------------------------------

const BROWSER_VIEWPORT_WIDTH = 1280;
const BROWSER_VIEWPORT_HEIGHT = 800;
const NAVIGATION_TIMEOUT_MS = 30_000;

async function findLocalBrowserPath(): Promise<string | null> {
  const { resolve, join } = await import("node:path");
  const { existsSync, readdirSync } = await import("node:fs");

  const base = resolve("node_modules/playwright-core/.local-browsers");
  if (!existsSync(base)) return null;

  const platform = process.platform === "darwin" ? "mac" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";

  for (const dir of readdirSync(base)) {
    if (!dir.startsWith("chromium_headless_shell-") && !dir.startsWith("chromium-")) continue;

    if (dir.startsWith("chromium_headless_shell-")) {
      const p = join(base, dir, `chrome-headless-shell-${platform}-${arch}`, "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
    if (dir.startsWith("chromium-")) {
      if (platform === "darwin") {
        const p = join(base, dir, `chrome-${platform}-${arch}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
        if (existsSync(p)) return p;
      } else {
        const p = join(base, dir, `chrome-${platform}-${arch}`, "chrome");
        if (existsSync(p)) return p;
      }
    }
  }

  return null;
}

async function captureScreenshot(url: string): Promise<{ png: Buffer; pageHeight: number }> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is required for `preview render`.\n" +
        "Install it with:\n\n" +
        "  bun add playwright\n" +
        "  bunx playwright install chromium\n",
    );
  }

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (firstErr: any) {
    const localPath = await findLocalBrowserPath();
    if (localPath) {
      browser = await pw.chromium.launch({ headless: true, executablePath: localPath });
    } else {
      throw firstErr;
    }
  }
  try {
    const page = await browser.newPage({
      viewport: { width: BROWSER_VIEWPORT_WIDTH, height: BROWSER_VIEWPORT_HEIGHT },
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const png = await page.screenshot({ fullPage: true, type: "png" });
    return { png: Buffer.from(png), pageHeight: bodyHeight };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function renderWebPageSegments(
  url: string,
  termWidth: number,
  _termHeight: number,
): Promise<{ rows: ColorSegment[][]; url: string; browserWidth: number; browserHeight: number; imageWidth: number; imageHeight: number }> {
  const { png, pageHeight } = await captureScreenshot(url);
  const image = decodePNG(png);

  const targetWidth = Math.max(20, termWidth);
  const scale = targetWidth / image.width;
  const targetHeight = Math.max(2, Math.round(image.height * scale));
  const resized = resizeNearest(image, targetWidth, targetHeight);

  const rows = imageToSegmentRows(resized);

  return {
    rows,
    url,
    browserWidth: BROWSER_VIEWPORT_WIDTH,
    browserHeight: pageHeight,
    imageWidth: resized.width,
    imageHeight: resized.height,
  };
}
