# install.ps1 - one-shot installer for the game-dev-team plugin (Windows)
#
# Installs into EVERY supported harness found on PATH: Claude Code and Codex.
# You do not need to know the marketplace names - they differ per harness and
# neither matches the repo name, which is exactly why hand-typing them failed
# (see REVIEW.md B-18).
#
# Usage (from the extracted bundle folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Scope project
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Harness codex
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1
# as ANSI, so non-ASCII string literals silently corrupt the parsed script.

param(
    [ValidateSet('user', 'project', 'local')]
    [string]$Scope = 'user',
    [ValidateSet('both', 'claude', 'codex')]
    [string]$Harness = 'both',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$pluginDir = $PSScriptRoot

# Claude Code reads .claude-plugin\marketplace.json -> marketplace "game-dev-team"
$ccMarketplace = 'game-dev-team'
$ccPlugin      = 'game-dev-team@game-dev-team'
# Codex reads .agents\plugins\marketplace.json      -> marketplace "game-dev-team-local"
$cxMarketplace = 'game-dev-team-local'
$cxPlugin      = 'game-dev-team@game-dev-team-local'

function Say($msg)  { Write-Host "  $msg" }
function Step($msg) { Write-Host ""; Write-Host "[*] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host ""; Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== game-dev-team plugin installer ===" -ForegroundColor Green

# --- 1. sanity: are we in the bundle root? -----------------------------------
$manifest = Join-Path $pluginDir '.claude-plugin\marketplace.json'
if (-not (Test-Path $manifest)) {
    Fail ".claude-plugin\marketplace.json not found. Run this from the extracted bundle root."
}
$version = 'unknown'
try {
    $version = (Get-Content (Join-Path $pluginDir '.claude-plugin\plugin.json') -Raw -Encoding UTF8 |
                ConvertFrom-Json).version
} catch { }
Say "source : $pluginDir"
Say "version: $version"

# --- 2. which harnesses are present? -----------------------------------------
Step "Looking for harnesses"
$claudeCmd = $null
$codexCmd  = $null
if ($Harness -ne 'codex') { $claudeCmd = Get-Command claude -ErrorAction SilentlyContinue }
if ($Harness -ne 'claude') { $codexCmd = Get-Command codex  -ErrorAction SilentlyContinue }
if ($claudeCmd) { Say "claude : $($claudeCmd.Source)" }
if ($codexCmd)  { Say "codex  : $($codexCmd.Source)" }
if ((-not $claudeCmd) -and (-not $codexCmd)) {
    Write-Host ""
    Write-Host "[X] Neither 'claude' nor 'codex' found in PATH." -ForegroundColor Red
    Write-Host "    Claude Code: https://claude.com/claude-code"
    Write-Host "    Codex:       npm i -g @openai/codex"
    exit 1
}
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Say "node   : $(& node --version)"
} else {
    Say "node   : NOT FOUND - the 4 quality hooks will stay silent."
    Say "         Everything else works. Install Node.js to enable them."
}

# Codex installs from the plugins\game-dev-team MIRROR, not the repo root.
# A stale mirror means Codex silently gets old code, so say so before installing.
if ($codexCmd -and $node) {
    & node (Join-Path $pluginDir 'scripts\validate-plugin.mjs') 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Say "[!] validate-plugin reported a problem (possibly mirror drift)."
        Say "    Codex installs from plugins\game-dev-team - if that mirror is"
        Say "    stale, Codex gets old code. Run scripts\sync-plugin.ps1 and retry."
        Fail "Source validation failed. Sync and validate the bundle before installing."
    }
}

# --- 3. uninstall path -------------------------------------------------------
if ($Uninstall) {
    Step "Removing"
    if ($claudeCmd) {
        claude plugin uninstall $ccPlugin 2>&1 | Out-Null
        claude plugin marketplace remove $ccMarketplace 2>&1 | Out-Null
        Say "claude : removed"
    }
    if ($codexCmd) {
        codex plugin remove $cxPlugin 2>&1 | Out-Null
        codex plugin marketplace remove $cxMarketplace 2>&1 | Out-Null
        Say "codex  : removed"
    }
    Write-Host ""
    Write-Host "[OK] Removed." -ForegroundColor Green
    exit 0
}

# --- 4. clear any previous registration --------------------------------------
# The marketplace name comes from marketplace.json, not the folder name, so an
# older copy registered under the same name blocks the new one. Clearing first
# also refreshes the install cache: the source is snapshot-copied into the
# harness cache, and only a reinstall re-copies it.
#
# This also repairs the failure that motivated the rewrite: a marketplace left
# pointing at a DEAD repo (game-dev-team-Ver3, v0.16.0) kept reinstalling that
# old version while the real source had moved 18 versions ahead.
Step "Clearing previous registration (if any)"
if ($claudeCmd) {
    claude plugin uninstall $ccPlugin 2>&1 | Out-Null
    claude plugin marketplace remove $ccMarketplace 2>&1 | Out-Null
}
if ($codexCmd) {
    codex plugin remove $cxPlugin 2>&1 | Out-Null
    codex plugin marketplace remove $cxMarketplace 2>&1 | Out-Null
}
Say "done"

# --- 5. register + install ---------------------------------------------------
$failed = @()
if ($claudeCmd) {
    Step "Claude Code"
    claude plugin marketplace add "$pluginDir"
    if ($LASTEXITCODE -ne 0) { $failed += 'claude' }
    else {
        claude plugin install $ccPlugin --scope $Scope
        if ($LASTEXITCODE -ne 0) { $failed += 'claude' } else { Say "installed (scope: $Scope)" }
    }
}
if ($codexCmd) {
    Step "Codex"
    codex plugin marketplace add "$pluginDir"
    if ($LASTEXITCODE -ne 0) { $failed += 'codex' }
    else {
        codex plugin add $cxPlugin
        if ($LASTEXITCODE -ne 0) { $failed += 'codex' } else { Say "installed (Codex has no scopes - it is global)" }
    }
}
if ($failed.Count -gt 0) { Fail "Failed for: $($failed -join ', ')" }

if ($node) {
    Step "Verifying installed files"
    & node (Join-Path $pluginDir 'scripts\check-plugin-version.mjs') --source "$pluginDir" --harness $Harness
    if ($LASTEXITCODE -ne 0) { Fail "Installed files could not be verified against this source." }
} else {
    Say "[!] Installed file hashes were not checked (Node.js is unavailable)."
}

# --- 6. next steps -----------------------------------------------------------
Write-Host ""
Write-Host "[OK] game-dev-team $version installed" -ForegroundColor Green
if ($claudeCmd) {
    Write-Host ""
    Write-Host "In Claude Code:"
    Say "/reload-plugins        activate it in the current session"
    Say "/agents                should list 6 roles"
    Say "/plugin                Installed tab shows game-dev-team, Errors tab empty"
}
if ($codexCmd) {
    Write-Host ""
    Write-Host "In Codex:"
    Say "codex plugin list      game-dev-team should say 'installed, enabled'"
    Say "Skills only - Codex does not load agents, hooks or /gate."
    Say "Read AGENTS.md first: it is the only rule channel Codex has."
}
Write-Host ""
Write-Host "Keep this folder. It is the live source of the plugin -"
Write-Host "deleting or moving it breaks the marketplace registration."
Write-Host "Changed the source? The install is a snapshot - rerun this script."
Write-Host ""
