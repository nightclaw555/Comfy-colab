@echo off
cd /d "%~dp0webapp"
npm run start > "%~dp0service.log" 2>&1
