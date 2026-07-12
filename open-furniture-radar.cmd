@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" /b cmd.exe /c call "%~dp0open-furniture-radar-browser.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-furniture-radar.ps1"
