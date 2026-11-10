$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host '은빛 잔향: http://127.0.0.1:8201'
python3 -m http.server 8201 --bind 127.0.0.1
