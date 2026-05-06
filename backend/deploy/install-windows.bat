@echo off
REM Install Uterine Ultrasound Diagnosis System as a Windows service using NSSM
REM Prerequisites: NSSM (https://nssm.cc/) must be on PATH

set SERVICE_NAME=UltrasoundDiagnosis
set APP_DIR=%~dp0..
set VENV_PYTHON=%APP_DIR%\venv\Scripts\python.exe
set UVICORN=%APP_DIR%\venv\Scripts\uvicorn.exe

echo Installing %SERVICE_NAME% ...

nssm install %SERVICE_NAME% "%UVICORN%" "app.main:app --host 0.0.0.0 --port 8000"
nssm set %SERVICE_NAME% AppDirectory "%APP_DIR%"
nssm set %SERVICE_NAME% DisplayName "Uterine Ultrasound AI Diagnosis"
nssm set %SERVICE_NAME% Description "Uterine Ultrasound AI-Assisted Diagnosis System"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppRestartDelay 5000
nssm set %SERVICE_NAME% AppStdout "%APP_DIR%\logs\service.log"
nssm set %SERVICE_NAME% AppStderr "%APP_DIR%\logs\service-error.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760

if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"

echo.
echo Service installed. Start with: nssm start %SERVICE_NAME%
echo Remove with:  nssm remove %SERVICE_NAME% confirm
pause
