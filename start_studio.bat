@echo off
title ComfyUI Studio Web App (Port 3005)
cd /d "%~dp0webapp"
echo ========================================================
echo  Starting ComfyUI Studio on http://localhost:3005
echo  Public Subdomain: https://studio.ayaigaldie.site
echo ========================================================
npm run start
pause
