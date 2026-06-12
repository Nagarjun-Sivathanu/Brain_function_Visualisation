@echo off
REM Launch the Brain Function Visualisation website.
REM Double-click this file, or run  start.bat  from a terminal.
cd /d "%~dp0"
echo Starting Brain Function Visualisation at http://127.0.0.1:8000 ...
echo (Press Ctrl+C in this window to stop the server.)
start "" "http://127.0.0.1:8000"
python run_web.py --port 8000
