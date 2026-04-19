@echo off
setlocal

rem Stop stale local HubSpot CRM sandbox processes owned by this project.
rem If port 5100 is used by another process, fail instead of killing it.

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PORT=5100"
set "QUIET=%~1"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=[IO.Path]::GetFullPath('%SCRIPT_DIR%'); $port=%PORT%; $quiet='%QUIET%' -ieq '/quiet'; $killed=0; $own=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'HubSpotDealsSandbox.exe' -and $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath)).StartsWith($root,[StringComparison]::OrdinalIgnoreCase) }; foreach($p in $own){ if(-not $quiet){ Write-Host ('Stopping stale HubSpot CRM Sandbox (PID {0})...' -f $p.ProcessId) }; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ }; Start-Sleep -Milliseconds 500; $listeners=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; foreach($conn in $listeners){ $proc=Get-CimInstance Win32_Process -Filter ('ProcessId={0}' -f $conn.OwningProcess) -ErrorAction SilentlyContinue; if($proc -and $proc.ExecutablePath -and ([IO.Path]::GetFullPath($proc.ExecutablePath)).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){ if(-not $quiet){ Write-Host ('Stopping sandbox listener on port {0} (PID {1})...' -f $port,$proc.ProcessId) }; Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ } else { Write-Error ('Port {0} is used by PID {1} ({2}). Not killing an unrelated process.' -f $port,$conn.OwningProcess,$proc.Name); exit 2 } }; Start-Sleep -Milliseconds 500; if($killed -eq 0 -and -not $quiet){ Write-Host ('HubSpot CRM Sandbox is not running on port {0}.' -f $port) }; exit 0"

exit /b %ERRORLEVEL%
