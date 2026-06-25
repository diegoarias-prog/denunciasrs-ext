@echo off
title Denuncias RS - Instalar / Actualizar
setlocal
REM La extension se baja en una carpeta JUNTO A ESTE .bat (a la vista, facil de encontrar)
set "DEST=%~dp0DenunciasRS_extension"
set "ZIP=%TEMP%\denunciasrs.zip"
set "TMPX=%TEMP%\denunciasrs_x"

echo ============================================================
echo    DENUNCIAS RS  -  Descargando la ultima version (GitHub)
echo ============================================================
echo.

if exist "%ZIP%" del /q "%ZIP%"
if exist "%TMPX%" rmdir /s /q "%TMPX%"

curl -L --fail -o "%ZIP%" https://github.com/diegoarias-prog/denunciasrs-ext/archive/refs/heads/main.zip
if not exist "%ZIP%" (
  echo.
  echo  ERROR: no se pudo descargar. Revisa tu conexion a internet e intenta de nuevo.
  echo.
  pause & exit /b 1
)

powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPX%' -Force"

if not exist "%DEST%" mkdir "%DEST%"
robocopy "%TMPX%\denunciasrs-ext-main\extension" "%DEST%" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS >nul

del /q "%ZIP%" 2>nul
rmdir /s /q "%TMPX%" 2>nul

echo.
echo ============================================================
echo   LISTO. Se creo la carpeta  "DenunciasRS_extension"
echo   JUSTO AL LADO de este archivo .bat:
echo.
echo       %DEST%
echo.
echo ============================================================
echo.
echo  PRIMERA VEZ en esta PC:
echo    1) Abre   chrome://extensions
echo    2) Activa "Modo de desarrollador" (arriba a la derecha)
echo    3) Clic en "Cargar descomprimida"
echo    4) Elige la carpeta  DenunciasRS_extension  (la que aparecio aqui al lado)
echo.
echo  PARA ACTUALIZAR (si ya la cargaste antes):
echo    Corre este .bat otra vez y luego CIERRA y abre Chrome.
echo.
pause
endlocal
