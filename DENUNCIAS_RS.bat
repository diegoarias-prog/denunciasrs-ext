@echo off
setlocal
REM ============================================================================
REM  Denuncias RS - Instala la extension y ACTIVA ACTUALIZACION AUTOMATICA.
REM  - Doble clic = instala + crea tarea que se actualiza sola (logon + diario).
REM  - El parametro /auto lo usa la tarea programada (descarga en silencio).
REM ============================================================================
set "DEST=%~dp0DenunciasRS_extension"
set "VBS=%~dp0DenunciasRS_update.vbs"
set "ZIP=%TEMP%\denunciasrs.zip"
set "TMPX=%TEMP%\denunciasrs_x"

REM ===================== DESCARGA (comun a ambos modos) =====================
if exist "%ZIP%" del /q "%ZIP%"
if exist "%TMPX%" rmdir /s /q "%TMPX%"
curl -L --fail -o "%ZIP%" https://github.com/diegoarias-prog/denunciasrs-ext/archive/refs/heads/main.zip
if not exist "%ZIP%" goto :error
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPX%' -Force"
if not exist "%DEST%" mkdir "%DEST%"
robocopy "%TMPX%\denunciasrs-ext-main\extension" "%DEST%" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS >nul
del /q "%ZIP%" 2>nul
rmdir /s /q "%TMPX%" 2>nul

REM ===================== Modo AUTO (tarea programada): salir en silencio =====
if /I "%~1"=="/auto" exit /b 0

REM ===================== Modo INSTALACION =====================
title Denuncias RS - Instalar
REM Lanzador oculto (sin ventana negra) que la tarea ejecutara:
>"%VBS%" echo CreateObject("WScript.Shell").Run """%~f0"" /auto", 0, False
REM Tareas: al iniciar sesion y todos los dias (no requiere admin):
schtasks /create /tn "DenunciasRS_AutoUpdate"     /tr "wscript.exe \"%VBS%\"" /sc ONLOGON /f >nul 2>&1
schtasks /create /tn "DenunciasRS_AutoUpdate_Dia" /tr "wscript.exe \"%VBS%\"" /sc DAILY /st 13:00 /f >nul 2>&1

echo ============================================================
echo    LISTO  +  ACTUALIZACION AUTOMATICA ACTIVADA
echo ============================================================
echo.
echo  Se creo la carpeta  "DenunciasRS_extension"  (aqui al lado).
echo.
echo  CARGALA EN CHROME (solo la PRIMERA vez):
echo    1) Abre   chrome://extensions
echo    2) Activa "Modo de desarrollador"
echo    3) Clic en "Cargar descomprimida"
echo    4) Elige la carpeta  DenunciasRS_extension
echo.
echo  DE AQUI EN ADELANTE se actualiza SOLA (al encender la PC y a diario).
echo  Solo reinicia Chrome de vez en cuando para aplicar lo nuevo.
echo.
echo  IMPORTANTE: NO muevas ni borres este .bat ni su carpeta.
echo.
pause
exit /b 0

:error
echo.
echo  ERROR: no se pudo descargar. Revisa tu conexion a internet.
echo.
pause
exit /b 1
