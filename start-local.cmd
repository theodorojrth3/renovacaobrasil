@echo off
setlocal
cd /d "%~dp0"

echo Iniciando servidor local da Renove...
echo.
node server.js

echo.
echo O servidor foi encerrado. Verifique a mensagem acima.
pause
