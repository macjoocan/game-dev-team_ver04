$ErrorActionPreference='Stop'
$runRoot=$PSScriptRoot
foreach($dir in @('input','output','user')){New-Item -ItemType Directory -Force -Path (Join-Path $runRoot $dir) | Out-Null}
$python='D:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe'
$main='D:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py'
$serverArgs=@('-s',$main,'--windows-standalone-build','--listen','127.0.0.1','--port','8196','--lowvram','--reserve-vram','3','--cache-none','--disable-all-custom-nodes','--input-directory',(Join-Path $runRoot 'input'),'--output-directory',(Join-Path $runRoot 'output'),'--user-directory',(Join-Path $runRoot 'user'),'--disable-auto-launch')
if(Get-NetTCPConnection -LocalPort 8196 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8196 occupied'}
$p=Start-Process -FilePath $python -ArgumentList $serverArgs -WorkingDirectory 'D:\ComfyUI\ComfyUI_windows_portable\ComfyUI' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runRoot 'server.stdout.log') -RedirectStandardError (Join-Path $runRoot 'server.stderr.log') -PassThru
@{pid=$p.Id;python=$python;arguments=$serverArgs;root=$runRoot} | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $runRoot 'server-process.json')
Write-Output ('Started isolated ComfyUI PID '+$p.Id)
