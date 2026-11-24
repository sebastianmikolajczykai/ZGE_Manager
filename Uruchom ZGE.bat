@echo off
rem Uruchamia ZGE Menedżera i otwiera go w przeglądarce.
rem Wystarczy kliknąć dwa razy. Jeśli aplikacja już działa, tylko otwiera przeglądarkę.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=3000"
set "ADRES=http://localhost:%PORT%"
rem Ile sekund czekać na start aplikacji (pierwszy start po włączeniu laptopa bywa wolny).
set "MAKS_SEKUND=90"

where node >nul 2>nul
if errorlevel 1 (
  echo Brakuje programu Node.js. Zainstaluj go ze strony https://nodejs.org ^(wersja LTS^) i spróbuj ponownie.
  goto :blad
)

curl.exe -s -f -o nul "%ADRES%/health"
if not errorlevel 1 goto :otworz

if not exist "node_modules\" (
  echo Pierwsze uruchomienie: instaluję potrzebne pliki. To potrwa kilka minut...
  call npm ci
  if errorlevel 1 (
    echo Instalacja się nie udała. Sprawdź połączenie z internetem i spróbuj ponownie.
    goto :blad
  )
)

if not exist "dane\" mkdir dane
echo Uruchamiam ZGE Menedżera...
start "ZGE Menedżer - nie zamykaj tego okna" /min cmd /c "npx tsx src/server.ts >> dane\serwer.log 2>&1"

set /a SEKUNDY=0
:czekaj
rem ping = pauza na ok. 1 sekundę (działa także bez klawiatury, np. przy starcie Windowsa)
ping -n 2 127.0.0.1 >nul
curl.exe -s -f -o nul "%ADRES%/health"
if not errorlevel 1 goto :otworz
set /a SEKUNDY+=1
if %SEKUNDY% lss %MAKS_SEKUND% goto :czekaj
echo Aplikacja nie wystartowała. Szczegóły są w pliku dane\serwer.log
goto :blad

:otworz
if not defined ZGE_BEZ_PRZEGLADARKI start "" "%ADRES%"
exit /b 0

:blad
if not defined ZGE_BEZ_PAUZY pause
exit /b 1
