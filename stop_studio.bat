@echo off
echo Stopping ComfyUI Studio on port 3005...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3005 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Studio server stopped.
pause
