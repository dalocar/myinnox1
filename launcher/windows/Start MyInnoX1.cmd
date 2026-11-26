@echo off
rem Starts MyInnoX1. Delayed expansion stays off so that "!" in a folder name survives.
setlocal DisableDelayedExpansion
rem Full path, so that no other powershell.exe in the current folder can be picked up.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1" start
set "MYINNOX1_EXIT=%ERRORLEVEL%"
if "%MYINNOX1_EXIT%"=="0" exit /b 0
echo.
echo MyInnoX1 did not start. Read the message above.
pause
exit /b %MYINNOX1_EXIT%
