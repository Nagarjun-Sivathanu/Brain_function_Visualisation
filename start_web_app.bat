@echo off
title Brain Swarm Interactive Dashboard
echo ====================================================================
echo Starting Decentralized Brain Swarm Web Application...
echo ====================================================================
cd /d "%~dp0"
uv run python -u web_server.py
pause
