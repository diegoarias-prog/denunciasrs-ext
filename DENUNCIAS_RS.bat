@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM  Denuncias RS - Instala la extension y ACTIVA ACTUALIZACION AUTOMATICA.
REM  - Doble clic = instala + crea la tarea que la actualiza sola (al iniciar
REM    sesion y CADA HORA).
REM  - El parametro /auto lo usa la tarea programada (descarga en silencio).
REM
REM  UNA sola carpeta para TODOS los navegadores: Chrome, Edge, Brave, Opera y
REM  Vivaldi cargan la MISMA carpeta DenunciasRS_extension, asi que al
REM  actualizarla se actualizan todos a la vez. La extension ademas se recarga
REM  sola cuando detecta que aqui hay una version nueva (ver background.js), sin
REM  necesidad de reiniciar el navegador.
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

REM ===================== AUTO-ACTUALIZACION DEL PROPIO .BAT ==================
REM  Este instalador tambien se actualiza solo. Antes no lo hacia: solo se copiaba
REM  la carpeta "extension", asi que una mejora del instalador (p.ej. pasar de una
REM  revision al dia a una cada hora) se quedaba sin llegar a las demas PCs.
REM  No se puede sobrescribir un .bat mientras se esta ejecutando, asi que la copia
REM  la hace un ayudante que arranca aparte y espera unos segundos.
set "NUEVOBAT=%TMPX%\denunciasrs-ext-main\DENUNCIAS_RS.bat"
if exist "%NUEVOBAT%" (
  fc /b "%NUEVOBAT%" "%~f0" >nul 2>&1
  if errorlevel 1 (
    copy /y "%NUEVOBAT%" "%~dp0DENUNCIAS_RS_nuevo.bat" >nul 2>&1
    > "%TEMP%\denunciasrs_selfupd.cmd" echo @echo off
    >>"%TEMP%\denunciasrs_selfupd.cmd" echo ping -n 5 127.0.0.1 ^>nul
    >>"%TEMP%\denunciasrs_selfupd.cmd" echo move /y "%~dp0DENUNCIAS_RS_nuevo.bat" "%~f0" ^>nul
    start "" /min cmd /c "%TEMP%\denunciasrs_selfupd.cmd"
  )
)

del /q "%ZIP%" 2>nul
rmdir /s /q "%TMPX%" 2>nul

REM ===================== Modo AUTO (tarea programada) ========================
REM  Ademas de descargar, se asegura de que las tareas esten como deben (crearlas
REM  con /f es inofensivo si ya existen). Asi, cuando a una PC le llega este .bat
REM  nuevo por la auto-actualizacion de arriba, la revision pasa a ser CADA HORA
REM  sin que nadie tenga que volver a ejecutar nada a mano.
if /I "%~1"=="/auto" (
  schtasks /create /tn "DenunciasRS_AutoUpdate"      /tr "wscript.exe \"%VBS%\"" /sc ONLOGON /f >nul 2>&1
  schtasks /delete /tn "DenunciasRS_AutoUpdate_Dia"  /f >nul 2>&1
  schtasks /create /tn "DenunciasRS_AutoUpdate_Hora" /tr "wscript.exe \"%VBS%\"" /sc HOURLY /mo 1 /f >nul 2>&1
  exit /b 0
)

REM ===================== Modo INSTALACION =====================
title Denuncias RS - Instalar
REM Lanzador oculto (sin ventana negra) que la tarea ejecutara:
>"%VBS%" echo CreateObject("WScript.Shell").Run """%~f0"" /auto", 0, False
REM Tareas: al iniciar sesion y CADA HORA (no requieren permisos de administrador).
REM  Antes era una sola vez al dia (13:00): un cambio hecho por la tarde no llegaba
REM  hasta el dia siguiente. Ahora, como mucho, tarda una hora.
schtasks /create /tn "DenunciasRS_AutoUpdate"     /tr "wscript.exe \"%VBS%\"" /sc ONLOGON /f >nul 2>&1
schtasks /delete /tn "DenunciasRS_AutoUpdate_Dia" /f >nul 2>&1
schtasks /create /tn "DenunciasRS_AutoUpdate_Hora" /tr "wscript.exe \"%VBS%\"" /sc HOURLY /mo 1 /f >nul 2>&1

REM La ruta de la carpeta queda COPIADA en el portapapeles: en el dialogo
REM "Cargar descomprimida" basta con pegarla en el campo "Carpeta:" (la carpeta
REM esta muy adentro y navegando hasta ella es facil no encontrarla).
echo %DEST%| clip

REM ---- Navegadores instalados en esta PC (todos los que admiten la extension) ----
set "NAVS="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"                set "NAVS=!NAVS! Chrome"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"           set "NAVS=!NAVS! Chrome"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"          set "NAVS=!NAVS! Edge"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"               set "NAVS=!NAVS! Edge"
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"   set "NAVS=!NAVS! Brave"
if exist "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"   set "NAVS=!NAVS! Brave"
if exist "%LOCALAPPDATA%\Programs\Opera\opera.exe"                            set "NAVS=!NAVS! Opera"
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"                     set "NAVS=!NAVS! Vivaldi"

echo ============================================================
echo    LISTO  +  ACTUALIZACION AUTOMATICA ACTIVADA
echo ============================================================
echo.
echo  Carpeta de la extension (ya COPIADA en el portapapeles):
echo    %DEST%
echo.
echo  Navegadores detectados en esta PC: !NAVS!
echo.
echo  CARGALA EN CADA NAVEGADOR (solo la PRIMERA vez en cada uno):
echo    Chrome   -^>  chrome://extensions
echo    Edge     -^>  edge://extensions   (activa "Modo de desarrollador" a la izquierda)
echo    Brave    -^>  brave://extensions
echo    Opera    -^>  opera://extensions
echo    Vivaldi  -^>  vivaldi://extensions
echo.
echo    1) Activa "Modo de desarrollador"
echo    2) Clic en "Cargar descomprimida"
echo    3) PEGA la ruta (Ctrl+V) en el campo "Carpeta:" y Aceptar
echo.
echo  Hay que hacerlo en CADA navegador por separado (cargarla en Chrome no la
echo  mete en Edge), pero los tres leen la MISMA carpeta: a partir de ahi, todo
echo  cambio les llega solo a los tres.
echo.
echo  DE AQUI EN ADELANTE se actualiza SOLA (al encender la PC y cada hora), y la
echo  extension se recarga sola cuando llega una version nueva.
echo.
echo  IMPORTANTE: NO muevas ni borres este .bat ni su carpeta.
echo.
choice /c SN /n /m "Quieres que abra ahora la pagina de extensiones de cada navegador? (S/N): "
if errorlevel 2 goto :fin
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"              start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "chrome://extensions"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"         start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "chrome://extensions"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"        start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "edge://extensions"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"             start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "edge://extensions"
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" start "" "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" "brave://extensions"
if exist "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" start "" "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" "brave://extensions"
if exist "%LOCALAPPDATA%\Programs\Opera\opera.exe"                          start "" "%LOCALAPPDATA%\Programs\Opera\opera.exe" "opera://extensions"
if exist "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"                   start "" "%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe" "vivaldi://extensions"

:fin
echo.
pause
exit /b 0

:error
echo.
echo  ERROR: no se pudo descargar. Revisa tu conexion a internet.
echo.
pause
exit /b 1
