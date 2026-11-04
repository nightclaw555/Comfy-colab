@echo off
set SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ComfyUI_Studio.lnk
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo Auto-start disabled.
) else (
    echo Auto-start was not enabled.
)
pause
