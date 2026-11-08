@echo off
chcp 65001 > nul
title ติดตั้งและเชื่อมต่อ Rclone Google Drive (Drive G:) อัตโนมัติ
echo ====================================================================
echo   🚀 ระบบติดตั้งและเชื่อมต่อ Rclone Google Drive (Drive G:) อัตโนมัติ
echo ====================================================================
echo.

rem 1. ตรวจสอบและติดตั้ง WinFsp (จำเป็นสำหรับไดรฟ์ G:)
echo [1/3] กำลังตรวจสอบ WinFsp (ไดรเวอร์ไดรฟ์เสมือน)...
winget list WinFsp.WinFsp >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo กำลังติดตั้ง WinFsp อัตโนมัติ กรุณารอสักครู่...
    winget install --id WinFsp.WinFsp -e --silent --accept-package-agreements --accept-source-agreements
) else (
    echo ✅ WinFsp ติดตั้งเรียบร้อยแล้ว
)

echo.
rem 2. ตรวจสอบและติดตั้ง Rclone
echo [2/3] กำลังตรวจสอบ Rclone...
where rclone >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo กำลังติดตั้ง Rclone อัตโนมัติ กรุณารอสักครู่...
    winget install --id Rclone.Rclone -e --silent --accept-package-agreements --accept-source-agreements
    rem รีเฟรช PATH สำหรับ session นี้
    set "PATH=%PATH%;C:\Program Files\Rclone;%LOCALAPPDATA%\Microsoft\WinGet\Links"
) else (
    echo ✅ Rclone ติดตั้งเรียบร้อยแล้ว
)

echo.
rem 3. เชื่อมต่อบัญชี Google Drive (จะเด้งเปิดบราวเซอร์ให้อัตโนมัติ)
echo [3/3] กำลังเปิดบราวเซอร์เพื่อล็อกอิน Google Drive...
echo (กรุณากด 'Allow' หรือ 'อนุญาต' ในหน้าต่างบราวเซอร์ที่เด้งขึ้นมา)
echo.

rclone config create mygdrive drive scope drive

echo.
echo ====================================================================
echo  🎉 เชื่อมต่อ Google Drive สำเร็จแล้ว!
echo  กำลังเริ่ม Mount ไดรฟ์ G: เข้าสู่เครื่องของคุณ...
echo ====================================================================
echo.

start "Rclone Drive G: (ห้ามปิดหน้าต่างนี้)" rclone mount mygdrive: G: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M

echo ✅ ไดรฟ์ G: พร้อมใช้งานแล้ว! คุณสามารถเปิดดูใน This PC ได้เลยครับ
pause
