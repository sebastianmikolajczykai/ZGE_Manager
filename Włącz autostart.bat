@echo off
rem Dodaje ZGE Menedzera do autostartu Windowsa: aplikacja uruchomi sie sama po zalogowaniu.
rem Cofniecie: "Wylacz autostart.bat".
setlocal
set "ZGE_CEL=%~dp0Uruchom ZGE.bat"
set "ZGE_FOLDER=%~dp0"
set "ZGE_SKROT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZGE Menedzer.lnk"
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" mkdir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
rem Wszystko w tym pliku bez polskich liter: cmd i skroty zle je czytaja na Windowsie z inna strona kodowa.
rem Skrot tworzy PowerShell; sciezki ida przez zmienne, wiec spacje i polskie litery nie przeszkadzaja.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:ZGE_SKROT); $s.TargetPath = $env:ZGE_CEL; $s.WorkingDirectory = $env:ZGE_FOLDER; $s.WindowStyle = 7; $s.Save()"
if errorlevel 1 (
  echo Nie udalo sie wlaczyc autostartu.
  if not defined ZGE_BEZ_PAUZY pause
  exit /b 1
)
echo Autostart wlaczony: ZGE Menedzer uruchomi sie sam po wlaczeniu komputera.
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
