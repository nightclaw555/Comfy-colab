@echo off
chcp 65001 > nul
title Rclone Google Drive Mount (Drive G:)
echo ====================================================================
echo   ☁️ Mounting Google Drive to G: via Rclone
echo ====================================================================
echo.

set "RCLONE_BIN=rclone"
if exist "C:\rclone\rclone.exe" set "RCLONE_BIN=C:\rclone\rclone.exe"

where %RCLONE_BIN% >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if not exist "C:\rclone\rclone.exe" (
        echo [ERROR] ไม่พบ rclone ในเครื่อง!
        echo กรุณารัน setup_rclone_windows.bat เพื่อติดตั้งอัตโนมัติก่อนครับ
        pause
        exit /b 1
    )
)

echo กำลังเชื่อมต่อ mygdrive: เข้ากับไดรฟ์ X:...
echo (หน้าต่างนี้ต้องเปิดค้างไว้เพื่อรักษาการเชื่อมต่อ)
echo.

"%RCLONE_BIN%" mount mygdrive: X: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M
pause
