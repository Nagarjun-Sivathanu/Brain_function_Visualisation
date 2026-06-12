@echo off
REM ── Brain Region Society launcher (Windows) ────────────────────────────────
REM Starts the FastAPI backend (:8000) and the Next.js frontend (:3000), then
REM opens the browser. First run installs backend + frontend dependencies.
setlocal
cd /d "%~dp0"

echo Brain Region Society
echo ====================

REM ── Backend venv + deps ────────────────────────────────────────────────────
if not exist "backend\.venv\Scripts\python.exe" (
  echo [setup] creating backend venv ...
  python -m venv "backend\.venv"
  "backend\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
  "backend\.venv\Scripts\python.exe" -m pip install --quiet -r "backend\requirements.txt"
)

REM ── Frontend deps ──────────────────────────────────────────────────────────
if not exist "frontend\node_modules" (
  echo [setup] installing frontend deps ^(one-time, may take a few minutes^) ...
  pushd frontend
  call npm install
  popd
)

REM ── Free port 8000 if something else (e.g. another app) is holding it ───────
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
  echo [setup] port 8000 in use by PID %%P — stopping it
  taskkill /F /PID %%P >nul 2>&1
)

echo [run] starting backend on http://127.0.0.1:8000
REM `cmd /k` keeps the window open if the backend errors, so you can read why.
start "society-backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [run] starting frontend on http://localhost:3000
start "society-frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM give the dev server a moment, then open the browser
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo Both servers launched in separate windows. Close those windows to stop.
endlocal
