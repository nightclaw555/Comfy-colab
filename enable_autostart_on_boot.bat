@echo off
set SCRIPT_DIR=%~dp0
set VBS_TARGET=%SCRIPT_DIR%start_studio_background.vbs
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_FOLDER%\ComfyUI_Studio.lnk

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_TARGET%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Save()"

if exist "%SHORTCUT%" (
    echo ========================================================
    echo  SUCCESS: Auto-start enabled!
    echo  Next time Windows starts, ComfyUI Studio will start
    echo  automatically in the background on port 3005.
    echo ========================================================
) else (
    echo Failed to create shortcut.
)
pause
