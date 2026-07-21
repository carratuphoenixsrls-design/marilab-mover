@echo off
setlocal
cd /d "%~dp0"
title Marilab Mover E1.8.2 - Deploy stesso dominio

echo ==========================================================
echo MARILAB MOVER E1.8.2 - DEPLOY SU PROGETTO VERCEL ESISTENTE
echo Dominio da mantenere: marilab-mover.vercel.app
echo ==========================================================
echo.

if not exist ".vercel\project.json" (
  echo ATTENZIONE: questa cartella non e ancora collegata a Vercel.
  echo Ora verra avviato Vercel Link.
  echo Seleziona il progetto ESISTENTE collegato a marilab-mover.vercel.app.
  echo NON creare un nuovo progetto.
  echo.
  call npx vercel link
  if errorlevel 1 goto :error
)

echo.
echo [1/3] Installazione dipendenze...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :error

echo.
echo [2/3] Collaudo completo...
call npm run check
if errorlevel 1 goto :error

echo.
echo [3/3] Deploy produzione sul progetto collegato...
call npx vercel --prod
if errorlevel 1 goto :error

echo.
echo DEPLOY COMPLETATO.
echo Verifica che il dominio mostrato sia marilab-mover.vercel.app
pause
exit /b 0

:error
echo.
echo OPERAZIONE INTERROTTA PER UN ERRORE.
echo Nessun passaggio successivo e stato eseguito.
pause
exit /b 1
