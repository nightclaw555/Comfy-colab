@echo off
chcp 65001 > nul
title ยกเลิกการเชื่อมต่อ Google Drive (Drive X:)
echo กำลังตัดการเชื่อมต่อไดรฟ์ X:...
taskkill /F /IM rclone.exe >nul 2>&1
echo เรียบร้อย! ปลดการเชื่อมต่อไดรฟ์ X: แล้ว
timeout /t 2 >nul
