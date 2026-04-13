#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-preview}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OPENPREVIEW_OUT_DIR:-${ROOT_DIR}/release}"
TMP_DIR="$(mktemp -d)"

# All release targets (OS-ARCH). Use OPENPREVIEW_BUILD_ALL=1 to build every target.
# Note: OPENPREVIEW_BUILD_ALL requires native deps for each platform (@opentui/core-*).
# Recommended: use CI (push a v* tag) to build both darwin-arm64 and linux-x64 on native runners.
RELEASE_TARGETS="darwin-arm64 linux-x64"

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

# Build one target: OS and ARCH (e.g. darwin arm64, linux x64).
# Uses Bun cross-compilation when target differs from host.
build_one() {
  local OS="$1"
  local ARCH="$2"
  local BUN_TARGET="bun-${OS}-${ARCH}"
  local ARCHIVE_BASENAME="${APP_NAME}-${OS}-${ARCH}"
  local BIN_PATH="${TMP_DIR}/${APP_NAME}"
  local ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_BASENAME}.tar.gz"
  local CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

  echo "Building ${APP_NAME} for ${OS}-${ARCH} (${BUN_TARGET})..."
  cd "${ROOT_DIR}"
  bun build --compile --target="${BUN_TARGET}" src/cli.ts --outfile "${BIN_PATH}"

  if [ "${OS}" = "darwin" ] && command -v codesign >/dev/null 2>&1; then
    if codesign --sign - --force "${BIN_PATH}" 2>/dev/null; then
      echo "Ad-hoc signed ${BIN_PATH}"
    else
      echo "Warning: codesign failed, binary may need manual signing on macOS"
    fi
  fi

  tar -C "${TMP_DIR}" -czf "${ARCHIVE_PATH}" "${APP_NAME}"
  printf '%s  %s\n' "$(sha256_file "${ARCHIVE_PATH}")" "$(basename "${ARCHIVE_PATH}")" > "${CHECKSUM_PATH}"
  echo "Created ${ARCHIVE_PATH}"
  echo "Created ${CHECKSUM_PATH}"
}

mkdir -p "${OUT_DIR}"

if [ "${OPENPREVIEW_BUILD_ALL:-0}" = "1" ]; then
  for spec in ${RELEASE_TARGETS}; do
    OS="${spec%-*}"
    ARCH="${spec#*-}"
    build_one "${OS}" "${ARCH}"
  done
else
  OS="${OPENPREVIEW_OS:-$(normalize_os "$(uname -s)")}"
  ARCH="${OPENPREVIEW_ARCH:-$(normalize_arch "$(uname -m)")}"
  build_one "${OS}" "${ARCH}"
fi
