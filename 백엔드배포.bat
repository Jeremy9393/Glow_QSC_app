@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   백엔드(앱스 스크립트) 배포 — 올리고, 새 버전을 만들어, 있는 배포에 끼웁니다
echo   주소(/exec)는 바뀌지 않습니다. '새 배포'라는 길이 이 도구에는 없습니다.
echo.
if "%~1"=="" goto ask
python tools\deploy_backend.py %*
goto end
:ask
set /p DESC=  이번 배포 설명 (그냥 엔터 치면 날짜로):
python tools\deploy_backend.py %DESC%
:end
echo.
pause
