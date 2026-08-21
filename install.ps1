# install.ps1 - one-shot installer for the game-dev-team plugin (Claude Code, Windows)
#
# Usage (from the extracted bundle folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Scope project
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1
# as ANSI, so non-ASCII string literals silently corrupt the parsed script.

param(
    [ValidateSet('user', 'project', 'local')]
    [string]$Scope = 'user',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$pluginDir   = $PSScriptRoot
$marketplace = 'game-dev-team'
$plugin      = 'game-dev-team@game-dev-team'

function Say($msg)  { Write-Host "  $msg" }
function Step($msg) { Write-Host ""; Write-Host "[*] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host ""; Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== game-dev-team plugin installer ===" -ForegroundColor Green

# --- 1. sanity: are we in the bundle root? -----------------------------------
$manifest = Join-Path $pluginDir '.claude-plugin\marketplace.json'
if (-not (Test-Path $manifest)) {
    Fail "marketplace.json not found. Run this script from the extracted bundle root."
}
$version = 'unknown'
$pj = Join-Path $pluginDir '.claude-plugin\plugin.json'
if (Test-Path $pj) {
    try { $version = (Get-Content $pj -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {}
}
Say "source : $pluginDir"
Say "version: $version"
Say "scope  : $Scope"

# --- 2. prerequisites --------------------------------------------------------
Step "Checking prerequisites"
$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) {
    Fail "'claude' CLI not found in PATH. Install Claude Code first: https://claude.com/claude-code"
}
Say "claude : $($claude.Source)"

if (Get-Command node -ErrorAction SilentlyContinue) {
    Say "node   : $(node --version)"
} else {
    Write-Host "  node   : NOT FOUND - the 4 quality hooks will stay silent." -ForegroundColor Yellow
    Write-Host "           Everything else works. Install Node.js to enable them." -ForegroundColor Yellow
}

# --- 3. uninstall path -------------------------------------------------------
if ($Uninstall) {
    Step "Removing plugin and marketplace"
    claude plugin uninstall $plugin 2>&1 | Out-Null
    claude plugin marketplace remove $marketplace 2>&1 | Out-Null
    Write-Host ""
    Write-Host "[OK] Removed. Run /reload-plugins in Claude Code." -ForegroundColor Green
    exit 0
}

# --- 4. clear any previous registration --------------------------------------
# The marketplace name comes from marketplace.json, not the folder name, so an
# older copy registered under the same name blocks the new one. Clearing first
# also refreshes the install cache: a directory source is snapshot-copied into
# ~/.claude/plugins/cache, and only a reinstall re-copies it.
Step "Clearing previous registration (if any)"
claude plugin uninstall $plugin 2>&1 | Out-Null
claude plugin marketplace remove $marketplace 2>&1 | Out-Null
Say "done"

# --- 5. register + install ---------------------------------------------------
Step "Registering marketplace"
claude plugin marketplace add "$pluginDir"
if ($LASTEXITCODE -ne 0) { Fail "marketplace add failed (exit $LASTEXITCODE)" }

Step "Installing plugin"
claude plugin install $plugin --scope $Scope
if ($LASTEXITCODE -ne 0) { Fail "plugin install failed (exit $LASTEXITCODE)" }

# --- 6. next steps -----------------------------------------------------------
Write-Host ""
Write-Host "[OK] game-dev-team $version installed (scope: $Scope)" -ForegroundColor Green
Write-Host ""
Write-Host "Next, inside Claude Code:" -ForegroundColor Cyan
Write-Host "  /reload-plugins        activate it in the current session"
Write-Host "  /agents                should list 6 roles (pm, game-designer, developer, qa, artist, meta-economy-designer)"
Write-Host "  /plugin                Installed tab shows game-dev-team, Errors tab is empty"
Write-Host ""
Write-Host "Then, in your game repo, just tell Claude to set the team up" -ForegroundColor Cyan
Write-Host "  (see INSTALL.md for the exact phrase to type)"
Write-Host ""
Write-Host "Keep this folder. It is the live source of the plugin -" -ForegroundColor Yellow
Write-Host "deleting or moving it breaks the marketplace registration." -ForegroundColor Yellow
Write-Host ""
