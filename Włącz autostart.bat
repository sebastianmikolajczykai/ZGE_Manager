@echo off
rem Dodaje ZGE Menedżera do autostartu Windowsa: aplikacja uruchomi się sama po zalogowaniu.
rem Cofnięcie: "Wyłącz autostart.bat".
chcp 65001 >nul
setlocal
set "ZGE_CEL=%~dp0Uruchom ZGE.bat"
set "ZGE_FOLDER=%~dp0"
set "ZGE_SKROT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZGE Menedżer.lnk"
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" mkdir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
rem Skrót tworzy PowerShell; ścieżki idą przez zmienne, więc spacje i polskie litery nie przeszkadzają.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:ZGE_SKROT); $s.TargetPath = $env:ZGE_CEL; $s.WorkingDirectory = $env:ZGE_FOLDER; $s.WindowStyle = 7; $s.Save()"
if errorlevel 1 (
  echo Nie udało się włączyć autostartu.
  if not defined ZGE_BEZ_PAUZY pause
  exit /b 1
)
echo Autostart włączony: ZGE Menedżer uruchomi się sam po włączeniu komputera.
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
