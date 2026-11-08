@echo off
chcp 65001 > nul
title Rclone Google Drive Mount (Drive G:)
echo ====================================================================
echo   ☁️ Mounting Google Drive to G: via Rclone
echo ====================================================================
echo.

rem Check if rclone exists
where rclone >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ไม่พบคำสั่ง rclone ในเครื่อง!
    echo กรุณาติดตั้ง rclone ก่อนด้วยคำสั่ง: winget install Rclone.Rclone
    pause
    exit /b 1
)

echo กำลังเชื่อมต่อ mygdrive: เข้ากับไดรฟ์ G:...
echo (หน้าต่างนี้ต้องเปิดค้างไว้เพื่อรักษาการเชื่อมต่อ หรือใช้ nssm ติดตั้งเป็น Service)
echo.

rclone mount mygdrive: G: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M
pause
