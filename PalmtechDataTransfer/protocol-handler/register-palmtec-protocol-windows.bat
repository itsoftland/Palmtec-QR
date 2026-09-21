@echo off
REM One-time setup: registers the palmtec:// URL protocol so the browser can
REM auto-launch PalmtechDataTransfer.exe from this downloaded tool folder.
REM Run this script from PalmtechDataTransfer\protocol-handler after choosing
REM the download folder in the web app. No admin rights needed
REM (writes to HKEY_CURRENT_USER only).

setlocal
set "REGPATH=HKCU\Software\Classes\palmtec"
set "TOOL_ROOT=%~dp0.."

for %%I in ("%TOOL_ROOT%\dist\PalmtechDataTransfer.exe") do set "TOOL_EXE=%%~fI"

REM The downloaded folder normally ships a prebuilt exe; only build (needs
REM Python + pip) when it is missing.
if exist "%TOOL_EXE%" goto register

echo PalmtechDataTransfer.exe not found. Building it...
pushd "%TOOL_ROOT%" || (
    echo ERROR: Could not open the PalmtechDataTransfer folder.
    pause
    exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
    popd
    echo ERROR: Python is not installed or not on PATH, so the tool cannot be built.
    echo Install Python 3 ^(tick "Add python.exe to PATH"^) and run this script again.
    pause
    exit /b 1
)
call "%TOOL_ROOT%\build.bat"
popd

if not exist "%TOOL_EXE%" (
    echo ERROR: Build failed - "%TOOL_EXE%" was not created. See the build output above.
    pause
    exit /b 1
)

:register

reg add "%REGPATH%" /ve /d "URL:Palmtec Protocol" /f >nul
reg add "%REGPATH%" /v "URL Protocol" /d "" /f >nul
reg add "%REGPATH%\shell\open\command" /ve /d "cmd.exe /c start \"\" \"%TOOL_EXE%\"" /f >nul

echo.
echo Palmtec protocol handler registered.
echo Registered executable:
echo %TOOL_EXE%
echo The web app can now launch the tool from the selected download folder.
echo You can close this window.
pause
