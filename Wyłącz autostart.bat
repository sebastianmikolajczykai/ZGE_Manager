@echo off
rem Usuwa ZGE Menedżera z autostartu Windowsa. Aplikację nadal można uruchomić plikiem "Uruchom ZGE.bat".
chcp 65001 >nul
setlocal
set "ZGE_SKROT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZGE Menedżer.lnk"
if exist "%ZGE_SKROT%" (
  del "%ZGE_SKROT%"
  echo Autostart wyłączony.
) else (
  echo Autostart nie był włączony.
)
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
