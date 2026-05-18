@echo off
setlocal

cd /d "%~dp0.."

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\build-installer.ps1"
set "BUILD_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%BUILD_EXIT_CODE%"=="0" (
  echo Build failed with exit code %BUILD_EXIT_CODE%.
) else (
  echo Build completed successfully.
)

echo.
pause
exit /b %BUILD_EXIT_CODE%
