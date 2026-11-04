@echo off
title Deploy ComfyUI Studio to Vercel
cd /d "%~dp0webapp"
echo ========================================================
echo  Deploying ComfyUI Studio to Vercel (Free 24/7 Cloud)
echo ========================================================
echo.
echo If this is your first time:
echo 1. It will ask to log in (Choose GitHub or Email)
echo 2. Press Enter to accept defaults (Link to existing project: No, etc.)
echo.
call vercel --prod
echo.
set /p SUBDOMAIN="Enter subdomain (default: comfy): "
if "%SUBDOMAIN%"=="" set SUBDOMAIN=comfy
set FULL_DOMAIN=%SUBDOMAIN%.ayaigaldie.site

echo.
echo ========================================================
echo  Deployment complete! Adding custom domain: %FULL_DOMAIN%
echo ========================================================
call vercel domains add %FULL_DOMAIN%
echo.
echo ========================================================
echo  All set! In Cloudflare DNS, make sure you have:
echo  Type: CNAME
echo  Name: %SUBDOMAIN%
echo  Target: cname.vercel-dns.com
echo  Proxy status: DNS only (Grey Cloud)
echo ========================================================
pause
