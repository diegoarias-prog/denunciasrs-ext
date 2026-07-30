# Denuncias RS - Extension

Auto-llenado de formularios de denuncia (Facebook, Instagram, WhatsApp, LinkedIn, X, TikTok, Telegram, YouTube, Google).

## Instalar (una vez por PC y una vez por NAVEGADOR)

1. Descarga **DENUNCIAS_RS.bat**.
2. Ponlo en una carpeta (ej. Escritorio) y dale **doble clic**.
   Aparece la carpeta **DenunciasRS_extension** al lado del .bat y la ruta queda
   COPIADA en el portapapeles.
3. En cada navegador que uses:

   | Navegador | Direccion |
   |-----------|-----------|
   | Chrome    | `chrome://extensions`  |
   | Edge      | `edge://extensions`    |
   | Brave     | `brave://extensions`   |
   | Opera     | `opera://extensions`   |
   | Vivaldi   | `vivaldi://extensions` |

   Activa **Modo de desarrollador** -> **Cargar descomprimida** -> pega la ruta
   (Ctrl+V) en el campo "Carpeta:" -> Aceptar.

   Hay que hacerlo en CADA navegador por separado (cargarla en Chrome no la mete en
   Edge), pero **todos leen la MISMA carpeta**: a partir de ahi cualquier cambio les
   llega solo a todos.

## Se actualiza SOLA (sin reiniciar nada)

Tres piezas encadenadas:

1. Al publicar un cambio, los archivos llegan a este repo.
2. En cada PC, una tarea programada ejecuta el .bat **al iniciar sesion y cada hora**:
   descarga lo nuevo y reemplaza la carpeta `DenunciasRS_extension` (la que leen
   todos los navegadores). El propio .bat tambien se actualiza solo.
3. La extension comprueba cada hora si hay una version mas nueva y **se recarga
   sola** cuando la encuentra en la carpeta: ya no hace falta reiniciar el navegador.
   Nunca se recarga en mitad de una denuncia.

En el popup, abajo, se ve la version instalada:
`v1.2.78 · al dia` (o `v1.2.78 -> v1.2.79 (actualizando...)` mientras llega la nueva).

No muevas ni borres el .bat ni su carpeta.

Este repo solo contiene la extension distribuible; el codigo de desarrollo esta en un repo privado.
