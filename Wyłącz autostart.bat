@echo off
rem Usuwa ZGE Menedzera z autostartu Windowsa. Aplikacje nadal mozna uruchomic plikiem "Uruchom ZGE.bat".
setlocal
set "ZGE_SKROT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ZGE Menedzer.lnk"
if exist "%ZGE_SKROT%" (
  del "%ZGE_SKROT%"
  echo Autostart wylaczony.
) else (
  echo Autostart nie byl wlaczony.
)
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
