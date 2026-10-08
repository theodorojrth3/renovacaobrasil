@echo off
setlocal
cd /d "%~dp0"

echo [%date% %time%] Iniciando diagnostico > server-debug.log
where node >> server-debug.log 2>&1
node -v >> server-debug.log 2>&1
echo. >> server-debug.log
echo [%date% %time%] Iniciando server.js >> server-debug.log
node server.js >> server-debug.log 2>&1
echo. >> server-debug.log
echo [%date% %time%] server.js encerrou >> server-debug.log

type server-debug.log
pause
