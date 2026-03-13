@echo off
setlocal EnableDelayedExpansion

:: ── Configuration ──────────────────────────────────────────────
set "PORT=4175"
set "MAX_WAIT=15"

:: ── Lock working directory to the folder containing this .bat ──
cd /d "%~dp0"
echo.
echo ========================================
echo   PSAR OHS Checklist Suite — Local Server
echo ========================================
echo  Serving from: %CD%

:: ── Read version from package.json ─────────────────────────────
set "VERSION=unknown"
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" "%~dp0package.json"') do set "VERSION=%%~v"
echo  package.json version: %VERSION%
echo  Port: %PORT%
echo ========================================
echo.

:: ── Port hygiene: kill any LISTENING process on our port ───────
set "KILLED=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    if "%%a" NEQ "0" (
        echo [PORT] PID %%a is listening on port %PORT%.
        taskkill /PID %%a /F >nul 2>&1
        set "KILLED=1"
    )
)
if "!KILLED!"=="1" (
    echo [PORT] Old process killed. Waiting for port release...
    timeout /t 2 /nobreak >nul
)

:: ── Verify port is now free ────────────────────────────────────
netstat -aon 2>nul | findstr /r /c:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [ERROR] Port %PORT% is STILL in use after kill attempt.
    echo         Run: netstat -aon ^| findstr :%PORT%
    pause
    exit /b 1
)

:: ── Find Python ────────────────────────────────────────────────
set "PYTHON="
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=py -3"
    goto :found_python
)
python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=python"
    goto :found_python
)
echo.
echo [ERROR] Neither 'py -3' nor 'python' found on PATH.
echo         Install Python 3 from https://python.org
pause
exit /b 1

:found_python
echo [OK] Using: %PYTHON%

:: ── Start HTTP server in background ────────────────────────────
echo [OK] Starting server on http://localhost:%PORT% ...
start "OHS-Checklist-Server" /B %PYTHON% -m http.server %PORT% --bind 127.0.0.1

:: Give the OS a moment to spawn the process
timeout /t 1 /nobreak >nul

:: ── Find the server PID so we can kill it later ────────────────
set "SERVER_PID="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    if "%%a" NEQ "0" set "SERVER_PID=%%a"
)
if not defined SERVER_PID (
    echo.
    echo [ERROR] Server did not start. Port %PORT% has no listener.
    echo         Try: %PYTHON% -m http.server %PORT%
    pause
    exit /b 1
)
echo [OK] Server PID: %SERVER_PID%

:: ── Poll until server responds ─────────────────────────────────
echo [..] Waiting for server to respond...
set "POLL_COUNT=0"

:poll_loop
set /a "POLL_COUNT+=1"
if %POLL_COUNT% gtr %MAX_WAIT% goto :poll_timeout
curl -s -o nul -w "%%{http_code}" http://localhost:%PORT%/package.json 2>nul | findstr "200" >nul 2>&1
if not errorlevel 1 goto :poll_ok
timeout /t 1 /nobreak >nul
goto :poll_loop

:poll_timeout
echo.
echo [ERROR] Server started (PID %SERVER_PID%) but did not respond
echo         within %MAX_WAIT% seconds. Killing and exiting.
taskkill /PID %SERVER_PID% /F >nul 2>&1
pause
exit /b 1

:poll_ok
echo [OK] Server responding on http://localhost:%PORT%
echo.

:: ── Open browser with cache-bust query string ──────────────────
set "CACHEBUST=%RANDOM%%RANDOM%"
start "" "http://localhost:%PORT%/?v=%CACHEBUST%"
echo [OK] Browser opened: http://localhost:%PORT%/?v=%CACHEBUST%

:: ── Keep console open; stop server on keypress ─────────────────
echo.
echo ========================================
echo   Server is running. Press any key to
echo   stop the server and exit.
echo ========================================
pause >nul

echo.
echo [..] Stopping server (PID %SERVER_PID%)...
taskkill /PID %SERVER_PID% /F >nul 2>&1
echo [OK] Server stopped.
timeout /t 1 /nobreak >nul

endlocal
