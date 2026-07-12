@echo off
ping 127.0.0.1 -n 4 >nul
start "" http://localhost:3000
