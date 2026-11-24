@echo off
rem Zatrzymuje dzialajacego ZGE Menedzera (np. przed przywroceniem kopii bazy).
setlocal
if not defined PORT set "PORT=3000"
set "ZNALEZIONO="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:"127.0.0.1:%PORT% "') do (
  taskkill /PID %%p /T /F >nul 2>nul
  set "ZNALEZIONO=1"
)
if defined ZNALEZIONO (echo ZGE Menedzer zostal zatrzymany.) else (echo ZGE Menedzer nie byl uruchomiony.)
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
