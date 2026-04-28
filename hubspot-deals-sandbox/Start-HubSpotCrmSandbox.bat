@echo off
setlocal

rem Start the local HubSpot CRM sandbox.
rem First stop any stale sandbox process from this project so rebuilds do not
rem fail on a locked HubSpotDealsSandbox.exe.

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PORT=5100"
set "URL=http://localhost:%PORT%"
set "STDOUT_LOG=%SCRIPT_DIR%\webserver.stdout.log"
set "STDERR_LOG=%SCRIPT_DIR%\webserver.stderr.log"
set "APP_CMD=dotnet run --project ""%SCRIPT_DIR%\HubSpotDealsSandbox.csproj"" -- web"

if exist "%SCRIPT_DIR%\HubSpotDealsSandbox.exe" (
    set "APP_CMD=""%SCRIPT_DIR%\HubSpotDealsSandbox.exe"" web"
)

pushd "%SCRIPT_DIR%" >nul

call "%SCRIPT_DIR%\Stop-HubSpotCrmSandbox.bat" /quiet
if errorlevel 1 (
    popd >nul
    exit /b 1
)

if not defined HUBSPOT_ACCESS_TOKEN (
    echo HUBSPOT_ACCESS_TOKEN is not set. Falling back to HubSpot:AccessToken in appsettings.json.
)

echo Starting HubSpot CRM Sandbox on %URL% ...
del "%STDOUT_LOG%" "%STDERR_LOG%" 2>nul

start "HubSpot CRM Sandbox" cmd /c "cd /d ""%SCRIPT_DIR%"" && %APP_CMD% 1>>""%STDOUT_LOG%"" 2>>""%STDERR_LOG%"""

for /l %%I in (1,1,30) do (
    call :GetListeningPid "%PORT%" RUNNING_PID
    if defined RUNNING_PID goto :Started
    timeout /t 1 /nobreak >nul
)

echo Sandbox did not start in time. Check:
echo   %STDOUT_LOG%
echo   %STDERR_LOG%
popd >nul
exit /b 1

:Started
echo HubSpot CRM Sandbox started on %URL% ^(PID %RUNNING_PID%^).
start "" "%URL%"
popd >nul
exit /b 0

:GetListeningPid
setlocal
set "PORT_TO_CHECK=%~1"
set "FOUND_PID="

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort %PORT_TO_CHECK% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $conn.OwningProcess }"`) do (
    set "FOUND_PID=%%I"
)

endlocal & set "%~2=%FOUND_PID%"
exit /b 0
