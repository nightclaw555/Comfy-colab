@echo off
chcp 65001 > nul
title ComfyUI Video Studio (Local PC Mode)
echo ====================================================================
echo   🎬 Starting ComfyUI MiniMax-H3 Video Studio (Local PC)
echo ====================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

rem 1. Start Local Sidecar Agent (Port 8189)
echo [1/3] เริ่มต้น Local Sidecar Agent บนพอร์ต 8189...
start "Sidecar Agent (Port 8189)" cmd /k "python "%ROOT_DIR%local_sidecar.py" --port 8189"

timeout /t 2 /nobreak > nul

rem 2. Start Studio Web App (Port 3000)
echo [2/3] เริ่มต้น Studio Web App บนพอร์ต 3000...
cd /d "%ROOT_DIR%webapp"
start "Studio Web App (Port 3000)" cmd /k "npm run dev"

timeout /t 3 /nobreak > nul

rem 3. Open Browser
echo [3/3] เปิดบราวเซอร์ไปที่ http://localhost:3000...
start http://localhost:3000

echo.
echo ====================================================================
echo  ✅ ระบบ Local Studio เปิดเรียบร้อยแล้ว!
echo  - ComfyUI API   : http://127.0.0.1:8188 (อย่าลืมเปิด ComfyUI ของคุณ)
echo  - Sidecar Agent : http://127.0.0.1:8189
echo  - Web App UI    : http://localhost:3000
echo ====================================================================
echo.
pause
