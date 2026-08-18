@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   QSC 앱 배포 — 점검하고, 올리고, 실서버로 확인합니다
echo.
if "%~1"=="" goto full
python toolselease.py check
goto end
:full
python toolselease.py
:end
echo.
pause
