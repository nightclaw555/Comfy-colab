# ====================================================================
# Bulletproof 1-Click Rclone and WinFsp Installer for Windows
# ====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  [Setup] Automated Rclone Google Drive (Drive X:) Installation" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# 1. Target directory
$rcloneDir = "C:\rclone"
if (!(Test-Path $rcloneDir)) {
    New-Item -ItemType Directory -Path $rcloneDir -Force | Out-Null
}
$rcloneExe = "$rcloneDir\rclone.exe"

# 2. Download Rclone directly if not present
if (!(Test-Path $rcloneExe)) {
    Write-Host "`n[1/3] Downloading latest Rclone binary..." -ForegroundColor Yellow
    $zipPath = "$env:TEMP\rclone.zip"
    $rcloneUrl = "https://downloads.rclone.org/rclone-current-windows-amd64.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $rcloneUrl -OutFile $zipPath -UseBasicParsing

    Write-Host "Extracting rclone.exe to $rcloneDir..." -ForegroundColor Yellow
    $extractPath = "$env:TEMP\rclone_temp"
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    $found = Get-ChildItem -Path $extractPath -Filter "rclone.exe" -Recurse | Select-Object -First 1
    if ($found) {
        Copy-Item -Path $found.FullName -Destination $rcloneExe -Force
        Write-Host "Installed: $rcloneExe" -ForegroundColor Green
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "`n[1/3] Rclone already installed at $rcloneExe" -ForegroundColor Green
}

# Update PATH
if ($env:Path -notlike "*$rcloneDir*") {
    $env:Path += ";$rcloneDir"
}

# 3. Check and install WinFsp (required for Drive X: mount)
$winfspInstalled = (Test-Path "C:\Program Files (x86)\WinFsp") -or (Test-Path "C:\Program Files\WinFsp")
if (!$winfspInstalled) {
    Write-Host "`n[2/3] Downloading and installing WinFsp driver..." -ForegroundColor Yellow
    $msiPath = "$env:TEMP\winfsp.msi"
    $winfspUrl = "https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-2.0.23075.msi"
    Invoke-WebRequest -Uri $winfspUrl -OutFile $msiPath -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    Write-Host "WinFsp installed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n[2/3] WinFsp driver already installed." -ForegroundColor Green
}

# 4. Trigger Google Drive authentication
Write-Host "`n[3/3] Opening browser for Google Drive login..." -ForegroundColor Cyan
Write-Host "Please select your Google Account and click 'Allow' in the browser window..." -ForegroundColor Yellow
Write-Host "--------------------------------------------------------------------" -ForegroundColor Gray

& $rcloneExe config create mygdrive drive scope drive

Write-Host "`n====================================================================" -ForegroundColor Green
Write-Host "  Authentication successful!" -ForegroundColor Green
Write-Host "  Mounting Google Drive to X: in the background..." -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green

# 5. Start mounting Drive X: in the background
Start-Process -FilePath $rcloneExe -ArgumentList "mount mygdrive: X: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M --volname \""Google Drive\""" -WindowStyle Hidden

Start-Sleep -Seconds 3
Write-Host "`nSUCCESS: Drive X: is now mounted and ready in This PC!" -ForegroundColor Green


