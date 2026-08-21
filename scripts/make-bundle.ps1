# make-bundle.ps1 - build the distributable zip teammates install from
# Usage:
#   .\scripts\make-bundle.ps1              # -> dist\game-dev-team-v<version>.zip
#   .\scripts\make-bundle.ps1 -OutDir D:\share
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less .ps1
# as ANSI, so non-ASCII string literals silently corrupt the parsed script.
param([string]$OutDir)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $root 'dist' }

$version = (Get-Content (Join-Path $root '.claude-plugin\plugin.json') -Raw -Encoding UTF8 |
            ConvertFrom-Json).version
$name    = "game-dev-team-v$version"
$staging = Join-Path $env:TEMP "gdt-bundle-$version"
$zipPath = Join-Path $OutDir "$name.zip"

Write-Host "Building bundle $name"

# Everything a teammate needs to install and read. Excluded on purpose:
#   .git             - history, not needed to run the plugin
#   .claude/agent-memory, .claude/worktrees - other projects' data
#   dist, node_modules, *.bak
$include = @(
    'agents', 'skills', 'hooks', 'commands', 'scripts', 'plugins',
    '.claude-plugin', '.codex-plugin', '.agents', '.github', '.githooks',
    'install.ps1', 'install.sh', 'INSTALL.md', 'README.md', 'USAGE.md',
    'ORCHESTRATION.md', 'REVIEW.md', 'AGENTS.md', 'CLAUDE.md', '.gitignore'
)

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
$payload = Join-Path $staging $name
$null = New-Item -ItemType Directory -Path $payload -Force

foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) { Write-Host "  skip (not found): $item"; continue }
    Copy-Item $src -Destination $payload -Recurse -Force
    Write-Host "  added: $item"
}

# Belt and braces: never ship project memory or worktrees.
foreach ($strip in @('.claude\agent-memory', '.claude\worktrees')) {
    $p = Join-Path $payload $strip
    if (Test-Path $p) { Remove-Item $p -Recurse -Force; Write-Host "  stripped: $strip" }
}

if (-not (Test-Path $OutDir)) { $null = New-Item -ItemType Directory -Path $OutDir -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipPath)
Remove-Item $staging -Recurse -Force

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB)
Write-Host ""
Write-Host "Bundle ready: $zipPath ($sizeKb KB)"
Write-Host "Teammates: extract, then run install.ps1 (Windows) or install.sh (macOS/Linux)."
