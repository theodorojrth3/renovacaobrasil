@echo off
setlocal
cd /d "%~dp0"

echo Abrindo servidor local e navegador...
start "Renove Server" cmd /k "cd /d %~dp0 && node server.js"

powershell -NoProfile -Command ^
  "$ready = $false; for ($i = 0; $i -lt 15; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if (-not $ready) { exit 1 }"

if errorlevel 1 (
  echo.
  echo O servidor nao respondeu em http://127.0.0.1:8080
  echo Verifique a janela "Renove Server" para ver o erro real.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8080"
