@echo off
title JohnCord 2.0 - Servidor
cd /d "%~dp0backend"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo ========================================================
echo   JohnCord 2.0 - Servidor Local Iniciado com Sucesso!
echo   Acesse no navegador: http://localhost:3000
echo ========================================================
start http://localhost:3000
node server.js
pause
