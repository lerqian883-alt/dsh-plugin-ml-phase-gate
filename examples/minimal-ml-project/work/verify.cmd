@echo off
setlocal EnableDelayedExpansion
if "%2"=="010-" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0checks\010-problem.ps1"
  exit /b !errorlevel!
)
if "%2"=="011-" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0checks\011-data.ps1"
  exit /b !errorlevel!
)
exit /b 1
