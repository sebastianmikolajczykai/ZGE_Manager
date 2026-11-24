@echo off
rem Zatrzymuje działającego ZGE Menedżera (np. przed przywróceniem kopii bazy).
chcp 65001 >nul
setlocal
if not defined PORT set "PORT=3000"
set "ZNALEZIONO="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:"127.0.0.1:%PORT% "') do (
  taskkill /PID %%p /T /F >nul 2>nul
  set "ZNALEZIONO=1"
)
if defined ZNALEZIONO (echo ZGE Menedżer został zatrzymany.) else (echo ZGE Menedżer nie był uruchomiony.)
if not defined ZGE_BEZ_PAUZY pause
exit /b 0
