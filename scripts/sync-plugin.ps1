# sync-plugin.ps1 - sync repo root (source of truth) -> plugins/game-dev-team (mirror)
# Usage:
#   .\scripts\sync-plugin.ps1          # regenerate mirror
#   .\scripts\sync-plugin.ps1 -Check   # drift check only (exit 1 if different)
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1
# as ANSI, so non-ASCII string literals silently corrupt the parsed script.
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mirror = Join-Path $root 'plugins\game-dev-team'

# Canonical set - anything not listed here is not part of the mirror
$dirs = @('agents', 'skills', '.claude-plugin', '.codex-plugin')
$files = @('README.md', 'USAGE.md', 'ORCHESTRATION.md', 'REVIEW.md', 'AGENTS.md', 'CLAUDE.md')

function Get-TreeHash($base, $rel) {
    $path = Join-Path $base $rel
    if (-not (Test-Path $path)) { return "<missing:$rel>" }
    if (Test-Path $path -PathType Leaf) {
        return "$rel=$((Get-FileHash $path -Algorithm SHA256).Hash)"
    }
    Get-ChildItem $path -Recurse -File | Sort-Object FullName | ForEach-Object {
        $r = $_.FullName.Substring($base.Length + 1)
        "$r=$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
    }
}

if ($Check) {
    $drift = @()
    foreach ($item in ($dirs + $files)) {
        $a = (Get-TreeHash $root $item) -join "`n"
        $b = (Get-TreeHash $mirror $item) -join "`n"
        if ($a -ne $b) { $drift += $item }
    }
    if ($drift.Count -gt 0) {
        Write-Host "DRIFT detected: $($drift -join ', ')" -ForegroundColor Yellow
        Write-Host "Root is the source of truth. Run scripts\sync-plugin.ps1 to regenerate the mirror."
        exit 1
    }
    Write-Host "OK - root and plugins/game-dev-team are in sync."
    exit 0
}

foreach ($d in $dirs) {
    $srcDir = Join-Path $root $d
    $dstDir = Join-Path $mirror $d
    if (-not (Test-Path $srcDir)) { Write-Host "skip (not found): $d"; continue }
    $null = robocopy $srcDir $dstDir /MIR /NFL /NDL /NJH /NJS /NP
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $d (exit $LASTEXITCODE)" }
    Write-Host "  synced: $d (robocopy exit $LASTEXITCODE)"
}
foreach ($f in $files) {
    $srcFile = Join-Path $root $f
    if (-not (Test-Path $srcFile)) { Write-Host "skip (not found): $f"; continue }
    Copy-Item $srcFile (Join-Path $mirror $f) -Force
    Write-Host "  synced: $f"
}
$global:LASTEXITCODE = 0
Write-Host "Sync complete: $mirror"
