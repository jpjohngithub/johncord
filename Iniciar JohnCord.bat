@echo off
title JohnCord 2.0
cd /d "%~dp0backend"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo ================================
echo   JohnCord 2.0 - Servidor
echo   http://localhost:3000
echo ================================
node server.js
pause
