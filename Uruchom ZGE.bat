@echo off
rem Uruchamia ZGE Menedzera i otwiera go w przegladarce.
rem Wystarczy kliknac dwa razy. Jesli aplikacja juz dziala, tylko otwiera przegladarke.
setlocal
rem Ten plik celowo nie ma polskich liter: cmd zle je czyta na Windowsie z inna strona kodowa.
cd /d "%~dp0"
if not defined PORT set "PORT=3000"
set "ADRES=http://localhost:%PORT%"
rem Ile sekund czekac na start aplikacji (pierwszy start po wlaczeniu laptopa bywa wolny).
set "MAKS_SEKUND=90"

where node >nul 2>nul
if errorlevel 1 (
  echo Brakuje programu Node.js. Zainstaluj go ze strony https://nodejs.org ^(wersja LTS^) i sprobuj ponownie.
  goto :blad
)

curl.exe -s -f -o nul "%ADRES%/health"
if not errorlevel 1 goto :otworz

if not exist "node_modules\" (
  echo Pierwsze uruchomienie: instaluje potrzebne pliki. To potrwa kilka minut...
  call npm ci
  if errorlevel 1 (
    echo Instalacja sie nie udala. Sprawdz polaczenie z internetem i sprobuj ponownie.
    goto :blad
  )
)

if not exist "dane\" mkdir dane
echo Uruchamiam ZGE Menedzera...
rem "node --import tsx" (a nie npx) zostawia oknu ten tytul.
start "ZGE Menedzer - nie zamykaj tego okna" /min cmd /c "node --import tsx src/server.ts >> dane\serwer.log 2>&1"

set /a SEKUNDY=0
:czekaj
rem ping = pauza na ok. 1 sekunde (dziala takze bez klawiatury, np. przy starcie Windowsa)
ping -n 2 127.0.0.1 >nul
curl.exe -s -f -o nul "%ADRES%/health"
if not errorlevel 1 goto :otworz
set /a SEKUNDY+=1
if %SEKUNDY% lss %MAKS_SEKUND% goto :czekaj
echo Aplikacja nie wystartowala. Szczegoly sa w pliku dane\serwer.log
goto :blad

:otworz
if not defined ZGE_BEZ_PRZEGLADARKI start "" "%ADRES%"
exit /b 0

:blad
if not defined ZGE_BEZ_PAUZY pause
exit /b 1
