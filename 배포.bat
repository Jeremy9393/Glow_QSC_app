@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo   QSC 배포 — 바뀐 쪽만 알아서 올립니다
echo     서버 두뇌(앱스 스크립트)  →  바뀌었으면 올림
echo     화면(GitHub Pages)        →  바뀌었으면 올림
echo.
if "%~1"=="check" goto checkonly

rem ── 서버 두뇌 먼저 ────────────────────────────────────────────
rem  먼저 하는 이유: 이 단계가 Code.gs 의 버전 라벨과 .deployed.json 을 고친다.
rem  그 뒤에 release.py 가 돌아야 그 변경까지 같이 커밋된다.
python tools\deploy_backend.py --if-changed %*
if errorlevel 1 goto backendfail

rem ── 화면 ──────────────────────────────────────────────────────
python tools\release.py
goto end

:checkonly
python tools\release.py check
goto end

:backendfail
echo.
echo   ★서버 두뇌 배포에서 멈췄습니다★ — 화면은 올리지 않았습니다.
echo   위에 적힌 이유를 보고 고친 뒤 다시 실행하십시오.

:end
echo.
pause
