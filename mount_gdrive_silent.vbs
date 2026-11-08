Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "C:\rclone\rclone.exe mount mygdrive: X: --vfs-cache-mode full --dir-cache-time 72h --vfs-cache-max-age 24h --buffer-size 64M --volname ""Google Drive""", 0, False
