#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
CLI_SOURCE="$ROOT_DIR/bin/stateset-desktop"
BIN_DIR="${XDG_DATA_HOME:-$HOME/.local}/bin"
TARGET_PATH="$BIN_DIR/stateset-desktop"

mkdir -p "$BIN_DIR"
ln -sf "$CLI_SOURCE" "$TARGET_PATH"

if ! command -v stateset-desktop >/dev/null 2>&1; then
  echo "Installed stateset-desktop to $TARGET_PATH"
  echo "Ensure $BIN_DIR is on your PATH, for example:"
  echo "  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc"
  echo "  source ~/.bashrc"
else
  echo "Installed stateset-desktop to $TARGET_PATH"
fi
