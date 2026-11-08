@echo off
title ComfyUI Studio Web App (Port 3005)
cd /d "%~dp0webapp"

if not exist ".next" (
    echo ========================================================
    echo  First-time setup: Building web app (please wait ~20s)...
    echo ========================================================
    call npm run build
)

echo ========================================================
echo  Starting ComfyUI Studio on http://localhost:3005
echo ========================================================
npm run start
pause
