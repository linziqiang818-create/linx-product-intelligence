@echo off
setlocal
title LINX Chrome Launcher

set "LINX_HTML=%~dp0LINX.html"
if not exist "%LINX_HTML%" (
  echo LINX.html was not found. Please extract the complete ZIP file first.
  pause
  exit /b 1
)

set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME_EXE%" goto open_linx

set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME_EXE%" goto open_linx

set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME_EXE%" goto open_linx

where chrome.exe >nul 2>&1
if not errorlevel 1 (
  set "CHROME_EXE=chrome.exe"
  goto open_linx
)

echo Google Chrome was not found. Opening LINX with the default browser.
start "" "%LINX_HTML%"
exit /b 0

:open_linx
start "" "%CHROME_EXE%" --new-window "%LINX_HTML%"
exit /b 0
