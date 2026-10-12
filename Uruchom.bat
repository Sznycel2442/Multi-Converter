@echo off
title MULTI//CONVERTER
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Pythona. Zainstaluj Python 3 z https://python.org i sprobuj ponownie.
  pause
  exit /b 1
)

echo Uruchamiam serwer na http://localhost:8000 ...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

echo(
echo To okno = dzialajacy serwer. Nie zamykaj go, gdy uzywasz aplikacji.
echo Aby zatrzymac serwer: zamknij to okno albo wcisnij Ctrl+C.
echo(

python serve.py
pause
