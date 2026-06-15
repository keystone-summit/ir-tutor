@echo off
REM ============================================================
REM  IR Tutor (Keystone Summit) — deploy to Vercel production.
REM  Reads VERCEL_TOKEN from the environment and passes --token
REM  so it never triggers a browser OAuth prompt.
REM  Personal Vercel account (apt2023@pm.me) / team "keystone-summit".
REM  Live: https://ir-tutor.vercel.app
REM
REM  Usage (PowerShell):
REM    $env:VERCEL_TOKEN = "<keystone token>"
REM    .\deploy.bat
REM ============================================================
cd /d "%~dp0"

if not defined VERCEL_TOKEN (
  echo ERROR: set VERCEL_TOKEN before running ^(personal Keystone Vercel token^).
  exit /b 1
)

echo === Deploying IR Tutor to Vercel production ===
call vercel --prod --yes --token %VERCEL_TOKEN%
echo.
echo Done. Verify: https://ir-tutor.vercel.app/seminar
