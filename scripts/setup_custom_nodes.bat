@echo off
chcp 65001 > nul
title ComfyUI MiniMax-H3 — Install Custom Nodes
echo ====================================================================
echo   🛠️ ComfyUI MiniMax-H3 Studio — Local Custom Nodes Installer
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

rem Check Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ไม่พบ python ใน PATH กรุณาติดตั้ง Python 3.10+ หรือเปิดจากโฟลเดอร์ portable
    pause
    exit /b 1
)

python "%SCRIPT_DIR%setup_custom_nodes.py" %*
echo.
pause
