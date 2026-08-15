@echo off
cd /d "%~dp0"
netstat -an | findstr ":8123" | findstr "LISTENING" >nul
if %errorlevel%==0 (
  start "" http://localhost:8123
  exit
)
echo ============================================
echo  GLOW SEOUL QSC server: http://localhost:8123
echo  (Keep this window open. Close = stop)
echo ============================================
start "" http://localhost:8123
python -m http.server 8123
