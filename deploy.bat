@echo off
REM ============================================================
REM  IR Tutor (Keystone Summit) — deploy to Vercel production.
REM  Reads VERCEL_TOKEN from the environment (CLI picks it up natively; never pass --token, the CLI echoes it)
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

REM --- Pre-deploy test gate -------------------------------------
REM  Includes the seminar topic-quota guard: 15 items, Iran ceiling
REM  of 5, and the four required categories. If that guard is ever
REM  removed or breached the deploy stops here.
echo === Pre-deploy tests ===
call npm test
if errorlevel 1 (
  echo.
  echo ERROR: tests failed — deploy aborted.
  exit /b 1
)
echo.

echo === Deploying IR Tutor to Vercel production ===
call vercel --prod --yes
if errorlevel 1 (
  echo ERROR: vercel deploy failed.
  exit /b 1
)
echo.
echo Done. Verify: https://ir-tutor.vercel.app/seminar
