@echo off
chcp 65001 >nul
title LINX Portable
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-linx.ps1"
