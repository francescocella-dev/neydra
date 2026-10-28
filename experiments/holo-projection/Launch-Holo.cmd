@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\package.json" (
  echo Installing the locked local viewer dependencies. No paid services.
  call npm.cmd ci --ignore-scripts --no-fund
  if errorlevel 1 goto failed
)
call npm.cmd run pipeline -- --serve --open
if errorlevel 1 goto failed
exit /b 0
:failed
echo Pipeline stopped. Read the error above and local\last-export.log.
pause
exit /b 1
