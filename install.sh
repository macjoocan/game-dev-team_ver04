#!/bin/sh
# install.sh - one-shot installer for the game-dev-team plugin (Claude Code, macOS/Linux)
#
# Usage (from the extracted bundle folder):
#   sh ./install.sh
#   sh ./install.sh --scope project
#   sh ./install.sh --uninstall

set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKETPLACE="game-dev-team"
PLUGIN="game-dev-team@game-dev-team"
SCOPE="user"
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done

echo
echo "=== game-dev-team plugin installer ==="

# --- 1. sanity: are we in the bundle root? -----------------------------------
if [ ! -f "$PLUGIN_DIR/.claude-plugin/marketplace.json" ]; then
  echo "[X] marketplace.json not found. Run this from the extracted bundle root." >&2
  exit 1
fi
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1)
echo "  source : $PLUGIN_DIR"
echo "  version: ${VERSION:-unknown}"
echo "  scope  : $SCOPE"

# --- 2. prerequisites --------------------------------------------------------
echo
echo "[*] Checking prerequisites"
if ! command -v claude >/dev/null 2>&1; then
  echo "[X] 'claude' CLI not found in PATH. Install Claude Code first:" >&2
  echo "    https://claude.com/claude-code" >&2
  exit 1
fi
echo "  claude : $(command -v claude)"
if command -v node >/dev/null 2>&1; then
  echo "  node   : $(node --version)"
else
  echo "  node   : NOT FOUND - the 4 quality hooks will stay silent."
  echo "           Everything else works. Install Node.js to enable them."
fi

# --- 3. uninstall path -------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  echo
  echo "[*] Removing plugin and marketplace"
  claude plugin uninstall "$PLUGIN" >/dev/null 2>&1 || true
  claude plugin marketplace remove "$MARKETPLACE" >/dev/null 2>&1 || true
  echo
  echo "[OK] Removed. Run /reload-plugins in Claude Code."
  exit 0
fi

# --- 4. clear any previous registration --------------------------------------
# The marketplace name comes from marketplace.json, not the folder name, so an
# older copy registered under the same name blocks the new one. Clearing first
# also refreshes the install cache: a directory source is snapshot-copied into
# ~/.claude/plugins/cache, and only a reinstall re-copies it.
echo
echo "[*] Clearing previous registration (if any)"
claude plugin uninstall "$PLUGIN" >/dev/null 2>&1 || true
claude plugin marketplace remove "$MARKETPLACE" >/dev/null 2>&1 || true
echo "  done"

# --- 5. register + install ---------------------------------------------------
echo
echo "[*] Registering marketplace"
claude plugin marketplace add "$PLUGIN_DIR"

echo
echo "[*] Installing plugin"
claude plugin install "$PLUGIN" --scope "$SCOPE"

# --- 6. next steps -----------------------------------------------------------
echo
echo "[OK] game-dev-team ${VERSION:-unknown} installed (scope: $SCOPE)"
echo
echo "Next, inside Claude Code:"
echo "  /reload-plugins        activate it in the current session"
echo "  /agents                should list 6 roles"
echo "  /plugin                Installed tab shows game-dev-team, Errors tab is empty"
echo
echo "Keep this folder. It is the live source of the plugin -"
echo "deleting or moving it breaks the marketplace registration."
echo
