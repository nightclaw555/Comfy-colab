@echo off
chcp 65001 > nul
setlocal

set "ROOT_DIR=%~dp0"
set "VENV_PY=C:\Users\Administrator\comfyui-flux2-dashboard\.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo [ERROR] Virtualenv python not found at: %VENV_PY%
    echo Run scripts\install_mv_deps.bat or update VENV_PY path.
    exit /b 1
)

if not "%~1"=="" goto :run_script

echo ====================================================================
echo   AI Music Video Director Launcher
echo ====================================================================
echo Usage examples:
echo   1. Run offline self-test:
echo      run_mv_director.bat --self-test
echo.
echo   2. Pitch 3 MV plots from Flow Music link or local song:
echo      run_mv_director.bat --stage pitch --audio "https://www.flowmusic.app/song/<id>"
echo.
echo   3. Prepare full storyboard + character refs from chosen plot:
echo      run_mv_director.bat --stage prepare --audio "https://www.flowmusic.app/song/<id>" --plot-choice 1
echo.
echo   4. Render shots on Colab A100 + assemble MV:
echo      run_mv_director.bat --stage all --audio "https://www.flowmusic.app/song/<id>" --plot-choice 1 --comfy-url "https://xxxx.trycloudflare.com" --sidecar-url "https://yyyy.trycloudflare.com" --auto-disconnect
echo.
"%VENV_PY%" "%ROOT_DIR%scripts\mv_director.py" --help
exit /b 0

:run_script
"%VENV_PY%" "%ROOT_DIR%scripts\mv_director.py" %*
exit /b %ERRORLEVEL%
