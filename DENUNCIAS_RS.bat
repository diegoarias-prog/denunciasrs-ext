@echo off
title Denuncias RS - Instalar / Actualizar
setlocal enabledelayedexpansion
set "DEST=%LOCALAPPDATA%\DenunciasRS\extension"
set "BASE=%LOCALAPPDATA%\DenunciasRS"
set "ZIP=%TEMP%\denunciasrs.zip"
set "TMPX=%TEMP%\denunciasrs_x"

echo ============================================================
echo    DENUNCIAS RS  -  Descargando la ultima version (GitHub)
echo ============================================================
echo.

if exist "%ZIP%" del /q "%ZIP%"
if exist "%TMPX%" rmdir /s /q "%TMPX%"

REM 1) Descargar el repositorio publico (rama main)
curl -L --fail -o "%ZIP%" https://github.com/diegoarias-prog/denunciasrs-ext/archive/refs/heads/main.zip
if not exist "%ZIP%" (
  echo.
  echo  ERROR: no se pudo descargar. Revisa tu conexion a internet e intenta de nuevo.
  echo.
  pause & exit /b 1
)

REM 2) Extraer
powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TMPX%' -Force"

REM 3) Copiar SOLO la carpeta extension\ al destino fijo (se reemplaza por la nueva)
if not exist "%BASE%" mkdir "%BASE%"
robocopy "%TMPX%\denunciasrs-ext-main\extension" "%DEST%" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS >nul

REM 4) Limpieza
del /q "%ZIP%" 2>nul
rmdir /s /q "%TMPX%" 2>nul

echo.
echo ============================================================
echo    LISTO. Carpeta de la extension:
echo    %DEST%
echo ============================================================
echo.
echo  PRIMERA VEZ en esta PC:
echo     1) Abre   chrome://extensions
echo     2) Activa "Modo de desarrollador" (interruptor arriba a la derecha)
echo     3) Clic en "Cargar descomprimida"
echo     4) Selecciona la carpeta:
echo          %DEST%
echo.
echo  PARA ACTUALIZAR (si ya la cargaste antes):
echo     Ya quedo actualizada. Solo CIERRA y vuelve a abrir Chrome.
echo     (o en chrome://extensions pulsa el boton recargar de la extension)
echo.
pause
endlocal
