#!/bin/sh
# install.sh - one-shot installer for the game-dev-team plugin (macOS/Linux)
#
# Installs into EVERY supported harness found on PATH: Claude Code and Codex.
# You do not need to know the marketplace names - they differ per harness and
# neither matches the repo name, which is exactly why hand-typing them failed
# (see REVIEW.md B-18).
#
# Usage (from the extracted bundle folder):
#   sh ./install.sh                      # install into every harness found
#   sh ./install.sh --scope project      # Claude Code scope (Codex has no scopes)
#   sh ./install.sh --harness codex      # only one harness
#   sh ./install.sh --uninstall

set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

# Claude Code reads .claude-plugin/marketplace.json  -> marketplace "game-dev-team"
CC_MARKETPLACE="game-dev-team"
CC_PLUGIN="game-dev-team@game-dev-team"
# Codex reads .agents/plugins/marketplace.json       -> marketplace "game-dev-team-local"
CX_MARKETPLACE="game-dev-team-local"
CX_PLUGIN="game-dev-team@game-dev-team-local"

SCOPE="user"
UNINSTALL=0
HARNESS="both"

while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --harness) HARNESS="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done
case "$HARNESS" in
  claude|codex|both) ;;
  *) echo "--harness must be claude, codex or both"; exit 1 ;;
esac

echo
echo "=== game-dev-team plugin installer ==="

# --- 1. sanity: are we in the bundle root? -----------------------------------
if [ ! -f "$PLUGIN_DIR/.claude-plugin/marketplace.json" ]; then
  echo "[X] .claude-plugin/marketplace.json not found." >&2
  echo "    Run this from the extracted bundle root." >&2
  exit 1
fi
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1)
echo "  source : $PLUGIN_DIR"
echo "  version: ${VERSION:-unknown}"

# --- 2. which harnesses are present? -----------------------------------------
echo
echo "[*] Looking for harnesses"
HAVE_CC=0
HAVE_CX=0
if [ "$HARNESS" != "codex" ] && command -v claude >/dev/null 2>&1; then
  HAVE_CC=1; echo "  claude : $(command -v claude)"
fi
if [ "$HARNESS" != "claude" ] && command -v codex >/dev/null 2>&1; then
  HAVE_CX=1; echo "  codex  : $(command -v codex)"
fi
if [ "$HAVE_CC" -eq 0 ] && [ "$HAVE_CX" -eq 0 ]; then
  echo "[X] Neither 'claude' nor 'codex' found in PATH." >&2
  echo "    Claude Code: https://claude.com/claude-code" >&2
  echo "    Codex:       npm i -g @openai/codex" >&2
  exit 1
fi
if command -v node >/dev/null 2>&1; then
  echo "  node   : $(node --version)"
else
  echo "  node   : NOT FOUND - the 4 quality hooks will stay silent."
  echo "           Everything else works. Install Node.js to enable them."
fi

# Codex installs from the plugins/game-dev-team MIRROR, not the repo root.
# A stale mirror means Codex silently gets old code, so say so before installing.
if [ "$HAVE_CX" -eq 1 ] && command -v node >/dev/null 2>&1; then
  if ! node "$PLUGIN_DIR/scripts/validate-plugin.mjs" >/dev/null 2>&1; then
    echo
    echo "  [!] validate-plugin reported a problem (possibly mirror drift)."
    echo "      Codex installs from plugins/game-dev-team - if that mirror is"
    echo "      stale, Codex gets old code. Run scripts/sync-plugin.ps1 and retry."
    echo "[X] Source validation failed. Sync and validate the bundle before installing." >&2
    exit 1
  fi
fi

# --- 3. uninstall path -------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  echo
  echo "[*] Removing"
  if [ "$HAVE_CC" -eq 1 ]; then
    claude plugin uninstall "$CC_PLUGIN" >/dev/null 2>&1 || true
    claude plugin marketplace remove "$CC_MARKETPLACE" >/dev/null 2>&1 || true
    echo "  claude : removed"
  fi
  if [ "$HAVE_CX" -eq 1 ]; then
    codex plugin remove "$CX_PLUGIN" >/dev/null 2>&1 || true
    codex plugin marketplace remove "$CX_MARKETPLACE" >/dev/null 2>&1 || true
    echo "  codex  : removed"
  fi
  echo
  echo "[OK] Removed."
  exit 0
fi

# --- 4. clear any previous registration --------------------------------------
# The marketplace name comes from marketplace.json, not the folder name, so an
# older copy registered under the same name blocks the new one. Clearing first
# also refreshes the install cache: the source is snapshot-copied into the
# harness cache, and only a reinstall re-copies it.
#
# This also repairs the failure that motivated the rewrite: a marketplace left
# pointing at a DEAD repo (game-dev-team-Ver3, v0.16.0) kept reinstalling that
# old version while the real source had moved 18 versions ahead.
echo
echo "[*] Clearing previous registration (if any)"
if [ "$HAVE_CC" -eq 1 ]; then
  claude plugin uninstall "$CC_PLUGIN" >/dev/null 2>&1 || true
  claude plugin marketplace remove "$CC_MARKETPLACE" >/dev/null 2>&1 || true
fi
if [ "$HAVE_CX" -eq 1 ]; then
  codex plugin remove "$CX_PLUGIN" >/dev/null 2>&1 || true
  codex plugin marketplace remove "$CX_MARKETPLACE" >/dev/null 2>&1 || true
fi
echo "  done"

# --- 5. register + install ---------------------------------------------------
FAILED=""
if [ "$HAVE_CC" -eq 1 ]; then
  echo
  echo "[*] Claude Code"
  if claude plugin marketplace add "$PLUGIN_DIR" && \
     claude plugin install "$CC_PLUGIN" --scope "$SCOPE"; then
    echo "  installed (scope: $SCOPE)"
  else
    FAILED="$FAILED claude"
  fi
fi
if [ "$HAVE_CX" -eq 1 ]; then
  echo
  echo "[*] Codex"
  if codex plugin marketplace add "$PLUGIN_DIR" && \
     codex plugin add "$CX_PLUGIN"; then
    echo "  installed (Codex has no scopes - it is global)"
  else
    FAILED="$FAILED codex"
  fi
fi
if [ -n "$FAILED" ]; then
  echo
  echo "[X] Failed for:$FAILED" >&2
  exit 1
fi

# --- 6. next steps -----------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  echo "[*] Verifying installed files"
  if ! node "$PLUGIN_DIR/scripts/check-plugin-version.mjs" --source "$PLUGIN_DIR" --harness "$HARNESS"; then
    echo "[X] Installed files could not be verified against this source." >&2
    exit 1
  fi
else
  echo "[!] Installed file hashes were not checked (Node.js is unavailable)."
fi

echo
echo "[OK] game-dev-team ${VERSION:-unknown} installed"
if [ "$HAVE_CC" -eq 1 ]; then
  echo
  echo "In Claude Code:"
  echo "  /reload-plugins        activate it in the current session"
  echo "  /agents                should list 6 roles"
  echo "  /plugin                Installed tab shows game-dev-team, Errors tab empty"
fi
if [ "$HAVE_CX" -eq 1 ]; then
  echo
  echo "In Codex:"
  echo "  codex plugin list      game-dev-team should say 'installed, enabled'"
  echo "  Skills only - Codex does not load agents, hooks or /gate."
  echo "  Read AGENTS.md first: it is the only rule channel Codex has."
fi
echo
echo "Keep this folder. It is the live source of the plugin -"
echo "deleting or moving it breaks the marketplace registration."
echo "Changed the source? The install is a snapshot - rerun this script."
echo
