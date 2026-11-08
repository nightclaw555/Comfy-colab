# ====================================================================
# 🚀 Bulletproof 1-Click Rclone & WinFsp Installer for Windows
# ====================================================================
$ErrorActionPreference = 'Stop'

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  ☁️ ติดตั้งและเชื่อมต่อ Rclone Google Drive (Drive G:) อัตโนมัติ" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

# 1. โฟลเดอร์ rclone
$rcloneDir = "C:\rclone"
if (!(Test-Path $rcloneDir)) {
    New-Item -ItemType Directory -Path $rcloneDir -Force | Out-Null
}
$rcloneExe = "$rcloneDir\rclone.exe"

# 2. ดาวน์โหลด Rclone ตรงๆ จาก official release (ไม่ต้องง้อ winget)
if (!(Test-Path $rcloneExe)) {
    Write-Host "`n[1/3] กำลังดาวน์โหลด Rclone ล่าสุด..." -ForegroundColor Yellow
    $zipPath = "$env:TEMP\rclone.zip"
    $rcloneUrl = "https://downloads.rclone.org/rclone-current-windows-amd64.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $rcloneUrl -OutFile $zipPath -UseBasicParsing

    Write-Host "กำลังแตกไฟล์ rclone.exe เข้าสู่ $rcloneDir..." -ForegroundColor Yellow
    $extractPath = "$env:TEMP\rclone_temp"
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    $found = Get-ChildItem -Path $extractPath -Filter "rclone.exe" -Recurse | Select-Object -First 1
    if ($found) {
        Copy-Item -Path $found.FullName -Destination $rcloneExe -Force
        Write-Host "✅ ติดตั้ง $rcloneExe สำเร็จ!" -ForegroundColor Green
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "`n[1/3] ✅ พบ Rclone อยู่แล้วที่ $rcloneExe" -ForegroundColor Green
}

# อัปเดต PATH
$env:Path += ";$rcloneDir"

# 3. ติดตั้ง WinFsp (ไดรเวอร์จำเป็นสำหรับสร้างไดรฟ์ G:)
$winfspInstalled = (Test-Path "C:\Program Files (x86)\WinFsp") -or (Test-Path "C:\Program Files\WinFsp")
if (!$winfspInstalled) {
    Write-Host "`n[2/3] กำลังดาวน์โหลดและติดตั้ง WinFsp (ไดรเวอร์ไดรฟ์เสมือน)..." -ForegroundColor Yellow
    $msiPath = "$env:TEMP\winfsp.msi"
    $winfspUrl = "https://github.com/winfsp/winfsp/releases/download/v2.0/winfsp-2.0.23075.msi"
    Invoke-WebRequest -Uri $winfspUrl -OutFile $msiPath -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    Write-Host "✅ ติดตั้ง WinFsp สำเร็จ!" -ForegroundColor Green
} else {
    Write-Host "`n[2/3] ✅ พบ WinFsp ติดตั้งอยู่ในเครื่องแล้ว" -ForegroundColor Green
}

# 4. เรียกคำสั่งเชื่อมต่อ Google Drive
Write-Host "`n[3/3] กำลังเปิดเบราว์เซอร์เพื่อเข้าสู่ระบบ Google Drive..." -ForegroundColor Cyan
Write-Host "👉 เบราว์เซอร์ Chrome จะเปิดขึ้นมา กรุณาเลือกบัญชีและกด 'Allow' (อนุญาต)" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------------------" -ForegroundColor Gray

& $rcloneExe config create mygdrive drive scope drive

Write-Host "`n====================================================================" -ForegroundColor Green
Write-Host "  🎉 เชื่อมต่อ Google Drive บัญชีของคุณเรียบร้อยแล้ว!" -ForegroundColor Green
Write-Host "  กำลังเริ่ม Mount ไดรฟ์ G: เข้าสู่เครื่องของคุณ..." -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green

# 5. เริ่มรัน Mount ไดรฟ์ G: ในโหมด Background
Start-Process -FilePath $rcloneExe -ArgumentList "mount mygdrive: G: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M" -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host "`n✅ ไดรฟ์ G: เชื่อมต่อสำเร็จแล้ว! คุณสามารถเปิดดูใน This PC ได้เลยครับ" -ForegroundColor Cyan
