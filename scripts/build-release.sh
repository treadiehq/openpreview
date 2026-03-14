#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-preview}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OPENPREVIEW_OUT_DIR:-${ROOT_DIR}/release}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

normalize_os() {
  case "$1" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *)
      echo "Unsupported operating system: $1" >&2
      exit 1
      ;;
  esac
}

normalize_arch() {
  case "$1" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64) echo "x64" ;;
    *)
      echo "Unsupported architecture: $1" >&2
      exit 1
      ;;
  esac
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  else
    shasum -a 256 "${file}" | awk '{print $1}'
  fi
}

OS="${OPENPREVIEW_OS:-$(normalize_os "$(uname -s)")}"
ARCH="${OPENPREVIEW_ARCH:-$(normalize_arch "$(uname -m)")}"
ARCHIVE_BASENAME="${APP_NAME}-${OS}-${ARCH}"
BIN_PATH="${TMP_DIR}/${APP_NAME}"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_BASENAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

mkdir -p "${OUT_DIR}"

echo "Building ${APP_NAME} for ${OS}-${ARCH}..."

cd "${ROOT_DIR}"
bun build --compile src/cli.ts --outfile "${BIN_PATH}"

tar -C "${TMP_DIR}" -czf "${ARCHIVE_PATH}" "${APP_NAME}"
printf '%s  %s\n' "$(sha256_file "${ARCHIVE_PATH}")" "$(basename "${ARCHIVE_PATH}")" > "${CHECKSUM_PATH}"

echo "Created ${ARCHIVE_PATH}"
echo "Created ${CHECKSUM_PATH}"
