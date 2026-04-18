@echo off
setlocal

rem Stop the local HubSpot CRM sandbox process that is listening on port 5100.

set "PORT=5100"
set "RUNNING_PID="

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $conn.OwningProcess }"`) do (
    set "RUNNING_PID=%%I"
)

if not defined RUNNING_PID (
    echo HubSpot CRM Sandbox is not running on port %PORT%.
    exit /b 0
)

taskkill /PID %RUNNING_PID% /F >nul
echo HubSpot CRM Sandbox stopped ^(PID %RUNNING_PID%^).
exit /b 0
