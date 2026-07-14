@echo off
setlocal

cd /d "%~dp0.."

tasklist /FI "IMAGENAME eq MdReader.exe" 2>NUL | find /I "MdReader.exe" >NUL
if not errorlevel 1 (
  echo MdReader is currently running.
  echo Close all MdReader windows and run this script again.
  echo.
  pause
  exit /b 1
)

call npm.cmd run build
if errorlevel 1 goto :failed

call npx.cmd electron-builder --dir --config.win.signAndEditExecutable=false --config.directories.output=dist-unpacked
if errorlevel 1 goto :failed

echo.
echo Unpacked build completed successfully.
echo Output: %CD%\dist-unpacked\win-unpacked\MdReader.exe
echo.
pause
exit /b 0

:failed
set "BUILD_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Unpacked build failed with exit code %BUILD_EXIT_CODE%.
echo.
pause
exit /b %BUILD_EXIT_CODE%
