@echo off
setlocal
set "SCRIPT=%~dp0LanguagePack.ps1"
if not exist "%SCRIPT%" (
  echo Installer script not found. Please extract the complete package.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Uninstall -PauseAtEnd %*
set "RESULT=%ERRORLEVEL%"
endlocal & exit /b %RESULT%
