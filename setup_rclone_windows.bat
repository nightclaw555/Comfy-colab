@echo off
chcp 65001 > nul
title ติดตั้งและเชื่อมต่อ Rclone Google Drive (Drive X:)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_rclone.ps1"
pause
