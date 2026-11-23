@echo off
chcp 65001 > nul
echo ====================================================================
echo   Installing MV Director Dependencies into Local .venv
echo ====================================================================
echo.

set "VENV_PY=C:\Users\Administrator\comfyui-flux2-dashboard\.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo [ERROR] Python virtualenv not found at:
    echo   %VENV_PY%
    echo Please update VENV_PY in this script to point to your Python 3.11+ executable.
    pause
    exit /b 1
)

echo [1/2] Installing google-genai SDK (Gemini 4 / Interactions API)...
"%VENV_PY%" -m pip install -U google-genai requests

echo.
echo [2/2] Installing audio analysis and stem separation tools (librosa, faster-whisper, demucs)...
echo Note: This reuses existing torch/torchaudio in your .venv without re-downloading PyTorch.
"%VENV_PY%" -m pip install -U librosa faster-whisper demucs

echo.
echo ====================================================================
echo   Dependency installation finished!
echo ====================================================================
pause
