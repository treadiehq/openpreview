#!/usr/bin/env bash

set -euo pipefail

APP_NAME="preview"
REPO="${OPENPREVIEW_REPO:-treadiehq/openpreview}"
REQUESTED_VERSION="${OPENPREVIEW_VERSION:-}"
INSTALL_DIR_OVERRIDE="${OPENPREVIEW_INSTALL_DIR:-}"

if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  BLUE="$(printf '\033[94m')"
  YELLOW="$(printf '\033[33m')"
  GREEN="$(printf '\033[32m')"
  RESET="$(printf '\033[0m')"
else
  BOLD=""
  DIM=""
  BLUE=""
  YELLOW=""
  GREEN=""
  RESET=""
fi

say() {
  printf '%b\n' "$*"
}

fail() {
  say "${YELLOW}Error:${RESET} $*"
  exit 1
}

cleanup_dir=""
cleanup() {
  if [ -n "${cleanup_dir}" ] && [ -d "${cleanup_dir}" ]; then
    rm -rf "${cleanup_dir}"
  fi
}

trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *) fail "Unsupported operating system: $(uname -s). This installer currently supports macOS and Linux." ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64) echo "x64" ;;
    *) fail "Unsupported architecture: $(uname -m). Supported targets are arm64 and x64." ;;
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

choose_install_dir() {
  if [ -n "${INSTALL_DIR_OVERRIDE}" ]; then
    printf '%s\n' "${INSTALL_DIR_OVERRIDE}"
    return
  fi

  for candidate in /usr/local/bin /opt/homebrew/bin "${HOME}/.local/bin" "${HOME}/bin"; do
    if [ -d "${candidate}" ] || mkdir -p "${candidate}" 2>/dev/null; then
      if [ -w "${candidate}" ]; then
        printf '%s\n' "${candidate}"
        return
      fi
    fi
  done

  printf '%s\n' "${HOME}/.local/bin"
}

normalize_tag() {
  local value="$1"
  if [ -z "${value}" ]; then
    printf '%s\n' ""
  elif [ "${value#v}" = "${value}" ]; then
    printf 'v%s\n' "${value}"
  else
    printf '%s\n' "${value}"
  fi
}

need_cmd curl
need_cmd tar

OS="$(detect_os)"
ARCH="$(detect_arch)"
ASSET_NAME="${APP_NAME}-${OS}-${ARCH}.tar.gz"
LATEST_RELEASE_API="https://api.github.com/repos/${REPO}/releases/latest"

BASE_DOWNLOAD_URL=""
TAG=""

if [ -n "${REQUESTED_VERSION}" ]; then
  TAG="$(normalize_tag "${REQUESTED_VERSION}")"
  BASE_DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
else
  RELEASE_JSON="$(curl -fsSL "${LATEST_RELEASE_API}")" \
    || fail "Could not determine the latest release version from GitHub Releases."
  TAG="$(printf '%s' "${RELEASE_JSON}" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1)"
  [ -n "${TAG}" ] || fail "Could not determine the latest release version."
  BASE_DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
fi

VERSION="${TAG#v}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}.sha256"
INSTALL_DIR="$(choose_install_dir)"
cleanup_dir="$(mktemp -d)"
ARCHIVE_PATH="${cleanup_dir}/${ASSET_NAME}"
CHECKSUM_PATH="${cleanup_dir}/${ASSET_NAME}.sha256"

if command -v "${APP_NAME}" >/dev/null 2>&1; then
  INSTALLED_VERSION="$("${APP_NAME}" --version 2>/dev/null | awk 'NR==1 {print $2}')"
else
  INSTALLED_VERSION="none"
fi

say ""
say "${BOLD}${BLUE}preview${RESET}"
say "${DIM}Installed version:${RESET} ${INSTALLED_VERSION}"
say ""
say "${DIM}Installing preview version:${RESET} ${BOLD}${VERSION}${RESET}"
say ""

curl -fL --progress-bar "${BASE_DOWNLOAD_URL}" -o "${ARCHIVE_PATH}" \
  || fail "Download failed. Release asset ${ASSET_NAME} was not found for ${TAG}."

if curl -fsSL "${CHECKSUM_URL}" -o "${CHECKSUM_PATH}"; then
  EXPECTED_SHA="$(awk 'NR==1 {print $1}' "${CHECKSUM_PATH}")"
  ACTUAL_SHA="$(sha256_file "${ARCHIVE_PATH}")"
  [ "${EXPECTED_SHA}" = "${ACTUAL_SHA}" ] || fail "Checksum verification failed for ${ASSET_NAME}."
fi

tar -xzf "${ARCHIVE_PATH}" -C "${cleanup_dir}"
mkdir -p "${INSTALL_DIR}"

if command -v install >/dev/null 2>&1; then
  install -m 755 "${cleanup_dir}/${APP_NAME}" "${INSTALL_DIR}/${APP_NAME}"
else
  cp "${cleanup_dir}/${APP_NAME}" "${INSTALL_DIR}/${APP_NAME}"
  chmod 755 "${INSTALL_DIR}/${APP_NAME}"
fi

say ""
say "${GREEN}Installed ${APP_NAME} to ${INSTALL_DIR}/${APP_NAME}${RESET}"
say ""
say "${DIM}To start:${RESET}"
say "  ${BOLD}preview https://docs.example.com${RESET}"
say "  ${BOLD}preview --inspect https://docs.example.com${RESET}"
say ""
say "${DIM}When a page looks wrong:${RESET}"
say "  ${BOLD}preview --mode docs <url>${RESET}"
say "  ${BOLD}preview --explain <url>${RESET}"

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    say ""
    say "${YELLOW}${INSTALL_DIR} is not in your PATH.${RESET}"
    say "Add this to your shell profile:"
    say "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac

say ""
say "${DIM}More info:${RESET} https://github.com/${REPO}"
