import { chmod, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { VERSION } from "./version.ts";

const APP_NAME = "preview";
const DEFAULT_REPO = "treadiehq/openpreview";
const GITHUB_API_VERSION = "2022-11-28";

interface ReleaseAsset {
  name: string;
  url: string;
  browser_download_url?: string;
}

interface ReleaseResponse {
  tag_name?: string;
  assets?: ReleaseAsset[];
}

interface ReleaseTarget {
  os: "darwin" | "linux";
  arch: "arm64" | "x64";
  assetName: string;
}

interface ResolvedRelease {
  tagName: string;
  asset: ReleaseAsset;
  checksumAsset?: ReleaseAsset;
}

export interface ParsedUpdateArgs {
  check: boolean;
  help: boolean;
  toVersion?: string;
  error?: string;
}

export function parseUpdateArgs(args: string[]): ParsedUpdateArgs {
  const parsed: ParsedUpdateArgs = {
    check: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--check") {
      parsed.check = true;
      continue;
    }
    if (arg === "--to") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        return { ...parsed, error: "Missing value for --to. Example: preview update --to 1.2.3" };
      }
      parsed.toVersion = value;
      i++;
      continue;
    }
    if (arg.startsWith("--to=")) {
      const value = arg.slice("--to=".length);
      if (!value) {
        return { ...parsed, error: "Missing value for --to. Example: preview update --to 1.2.3" };
      }
      parsed.toVersion = value;
      continue;
    }

    return { ...parsed, error: `Unknown update option: ${arg}` };
  }

  return parsed;
}

export function getUpdateHelp(): string {
  return `
Update OpenPreview from GitHub Releases.

Usage:
  preview update
  preview update --check
  preview update --to 1.2.3

Options:
  --check          Check whether an update is available
  --to <version>   Install a specific release tag or version
  --help, -h       Show this help

Environment:
  OPENPREVIEW_REPO          Override the GitHub repo (default: treadiehq/openpreview)
  OPENPREVIEW_GITHUB_TOKEN  GitHub token for private releases
  GITHUB_TOKEN              Fallback GitHub token

Notes:
  This command replaces the current installed release binary in place.
  It does not update bun-linked or bun-run development commands.
`.trim();
}

export async function runSelfUpdate(args: string[]): Promise<void> {
  const parsed = parseUpdateArgs(args);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (parsed.help) {
    console.log(getUpdateHelp());
    return;
  }

  const token = process.env.OPENPREVIEW_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.OPENPREVIEW_REPO || DEFAULT_REPO;
  const target = detectReleaseTarget();
  const release = await resolveRelease(repo, target, token, parsed.toVersion);
  const targetVersion = stripTagPrefix(release.tagName);

  if (parsed.check) {
    if (targetVersion === VERSION) {
      console.log(`OpenPreview ${VERSION} is up to date.`);
    } else {
      console.log(`Update available: ${VERSION} -> ${targetVersion}`);
    }
    return;
  }

  if (!parsed.toVersion && targetVersion === VERSION) {
    console.log(`OpenPreview ${VERSION} is already up to date.`);
    return;
  }

  const executablePath = resolveSelfUpdatePath();
  const tempDir = await mkdtemp(join(tmpdir(), "preview-update-"));

  try {
    const archivePath = join(tempDir, target.assetName);
    const binaryPath = join(tempDir, APP_NAME);

    console.log(`Updating OpenPreview ${VERSION} -> ${targetVersion}`);
    console.log(`Downloading ${target.assetName}...`);
    await downloadAsset(release.asset, archivePath, token);

    if (!release.checksumAsset) {
      throw new Error(
        `Release ${release.tagName} is missing checksum file ${target.assetName}.sha256. ` +
          "Refusing to install unverified binary.",
      );
    }
    const checksumPath = join(tempDir, `${target.assetName}.sha256`);
    await downloadAsset(release.checksumAsset, checksumPath, token);
    await verifyChecksum(archivePath, checksumPath);

    await extractArchive(archivePath, tempDir);
    await installBinary(binaryPath, executablePath);

    console.log(`Updated OpenPreview to ${targetVersion}`);
    console.log(`Installed at ${executablePath}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function detectReleaseTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): ReleaseTarget {
  const os = (() => {
    switch (platform) {
      case "darwin":
        return "darwin";
      case "linux":
        return "linux";
      default:
        throw new Error(`Self-update is only supported on macOS and Linux. Current platform: ${platform}`);
    }
  })();

  const normalizedArch = (() => {
    switch (arch) {
      case "arm64":
      case "aarch64":
        return "arm64";
      case "x64":
      case "amd64":
        return "x64";
      default:
        throw new Error(`Unsupported architecture for self-update: ${arch}`);
    }
  })();

  return {
    os,
    arch: normalizedArch,
    assetName: `${APP_NAME}-${os}-${normalizedArch}.tar.gz`,
  };
}

export function resolveSelfUpdatePath(execPath: string = process.execPath): string {
  if (basename(execPath) !== APP_NAME) {
    throw new Error(
      `Self-update only works for installed release binaries. Current executable: ${execPath}. Use the installer or a GitHub Release build instead.`,
    );
  }
  return execPath;
}

function normalizeTag(version?: string): string | undefined {
  if (!version) return undefined;
  return version.startsWith("v") ? version : `v${version}`;
}

function stripTagPrefix(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

async function resolveRelease(
  repo: string,
  target: ReleaseTarget,
  token?: string,
  requestedVersion?: string,
): Promise<ResolvedRelease> {
  const tag = normalizeTag(requestedVersion);
  const endpoint = tag
    ? `https://api.github.com/repos/${repo}/releases/tags/${tag}`
    : `https://api.github.com/repos/${repo}/releases/latest`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: buildGitHubHeaders(token),
      redirect: "follow",
    });
  } catch (error) {
    throw new Error(`Could not reach GitHub Releases: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(buildGitHubError(response.status, repo, tag, token));
  }

  const release = (await response.json()) as ReleaseResponse;
  const tagName = release.tag_name;
  const assets = release.assets ?? [];

  if (!tagName) {
    throw new Error("GitHub Releases response did not include a tag name.");
  }

  const asset = assets.find((entry) => entry.name === target.assetName);
  if (!asset) {
    throw new Error(`Release ${tagName} does not include ${target.assetName}.`);
  }

  return {
    tagName,
    asset,
    checksumAsset: assets.find((entry) => entry.name === `${target.assetName}.sha256`),
  };
}

function buildGitHubError(
  status: number,
  repo: string,
  tag: string | undefined,
  token: string | undefined,
): string {
  if ((status === 401 || status === 403 || status === 404) && !token) {
    return `Could not access releases for ${repo}. If the repo is private, set OPENPREVIEW_GITHUB_TOKEN or GITHUB_TOKEN and try again.`;
  }
  if (tag) {
    return `Could not fetch release ${tag} from ${repo} (HTTP ${status}).`;
  }
  return `Could not fetch the latest release from ${repo} (HTTP ${status}).`;
}

function buildGitHubHeaders(token?: string, accept = "application/vnd.github+json"): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": `${APP_NAME}/${VERSION}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function downloadAsset(asset: ReleaseAsset, destination: string, token?: string): Promise<void> {
  const response = await fetch(asset.url || asset.browser_download_url || "", {
    headers: buildGitHubHeaders(token, "application/octet-stream"),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Could not download ${asset.name} (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await Bun.write(destination, bytes);
}

async function verifyChecksum(archivePath: string, checksumPath: string): Promise<void> {
  const checksumText = await Bun.file(checksumPath).text();
  const expected = checksumText.trim().split(/\s+/)[0];
  if (!expected) {
    throw new Error("Checksum file was empty.");
  }

  const digest = await sha256Hex(await Bun.file(archivePath).arrayBuffer());
  if (digest !== expected) {
    throw new Error(`Checksum verification failed for ${basename(archivePath)}.`);
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  if (!Bun.which("tar")) {
    throw new Error("The `tar` command is required for self-update.");
  }

  const proc = Bun.spawn(["tar", "-xzf", archivePath, "-C", destination], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Could not extract ${basename(archivePath)}: ${stderr.trim() || `tar exited with code ${exitCode}`}`);
  }
}

async function installBinary(downloadedBinaryPath: string, targetPath: string): Promise<void> {
  const targetDir = dirname(targetPath);
  const tempTargetPath = join(targetDir, `.${APP_NAME}.next-${Date.now()}`);

  if (!(await Bun.file(downloadedBinaryPath).exists())) {
    throw new Error(`Update archive did not contain ${APP_NAME}.`);
  }

  await Bun.write(tempTargetPath, Bun.file(downloadedBinaryPath));
  await chmod(tempTargetPath, 0o755);

  try {
    await rename(tempTargetPath, targetPath);
  } catch (error) {
    await rm(tempTargetPath, { force: true });
    if (isPermissionError(error)) {
      throw new Error(`Cannot write to ${targetPath}. Re-run with elevated permissions or reinstall OpenPreview to a user-writable directory.`);
    }
    throw error;
  }
}

function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (
    (error as NodeJS.ErrnoException).code === "EACCES" ||
    (error as NodeJS.ErrnoException).code === "EPERM"
  );
}
