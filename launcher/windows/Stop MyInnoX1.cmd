@echo off
rem Stops MyInnoX1. Delayed expansion stays off so that "!" in a folder name survives.
setlocal DisableDelayedExpansion
rem Full path, so that no other powershell.exe in the current folder can be picked up.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1" stop
set "MYINNOX1_EXIT=%ERRORLEVEL%"
if not "%MYINNOX1_EXIT%"=="0" goto failed
rem Leave the message readable for a few seconds. Not "timeout", which fails with redirected input.
"%SystemRoot%\System32\ping.exe" -n 6 127.0.0.1 >nul
exit /b 0
:failed
echo.
echo MyInnoX1 was not stopped completely. Read the message above.
pause
exit /b %MYINNOX1_EXIT%
