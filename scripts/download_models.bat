@echo off
chcp 65001 > nul
title ComfyUI MiniMax-H3 — Download Models
echo ====================================================================
echo   📥 ComfyUI MiniMax-H3 Turbo — Local Models Downloader
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

rem Check Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ไม่พบ python ใน PATH
    pause
    exit /b 1
)

python "%SCRIPT_DIR%download_models.py" %*
echo.
pause
