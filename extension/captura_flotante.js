// ============================================================================
//  Botón flotante "📸 Capturar comprobante" (content script).
//  Aparece SOLO cuando hay una denuncia en curso (ultima_denuncia_registro) y,
//  al pulsarlo, pide al service worker que capture el formulario y lo adjunte al
//  comprobante. Alternativa al atajo de teclado y al botón del popup.
// ============================================================================
(function () {
  "use strict";

  // Guarda contra doble init (el content script podría inyectarse dos veces).
  if (window.__denunciasRSBoton) return;
  window.__denunciasRSBoton = true;

  var boton = null;

  function crear_boton() {
    if (boton) return;
    boton = document.createElement("button");
    boton.id = "denuncias_rs_boton_captura";
    boton.type = "button";
    boton.textContent = "📸 Capturar comprobante";
    // Abajo-IZQUIERDA para no chocar con el toast (abajo-derecha). z-index un
    // punto por debajo del toast para que el aviso quede por encima.
    boton.style.cssText =
      "position:fixed;z-index:2147483646;bottom:20px;left:20px;display:none;" +
      "padding:10px 14px;border:0;border-radius:10px;background:#1d4ed8;color:#fff;" +
      "font:600 13px 'Segoe UI',Arial,sans-serif;cursor:pointer;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25);";
    boton.addEventListener("click", al_hacer_clic);

    var destino = document.body || document.documentElement;
    if (destino) {
      destino.appendChild(boton);
      actualizar();
    } else {
      // document.body aún no existe: reintento breve.
      setTimeout(function () {
        var d = document.body || document.documentElement;
        if (d) { d.appendChild(boton); actualizar(); }
      }, 300);
    }
  }

  // Muestra u oculta el botón según haya (o no) una denuncia en curso.
  function actualizar() {
    if (!boton) return;
    try {
      chrome.storage.local.get("ultima_denuncia_registro", function (x) {
        if (!boton) return;
        var tiene = !!(x && x.ultima_denuncia_registro);
        // No pisar el estado "capturando" (botón deshabilitado/oculto temporal).
        if (boton.disabled) return;
        boton.style.display = tiene ? "block" : "none";
      });
    } catch (e) { /* contexto de extensión no disponible */ }
  }

  function al_hacer_clic(e) {
    // Solo clics REALES del usuario: evita que el JS de la página sintetice
    // `.click()` sobre nuestro botón para forzar capturas.
    if (e && e.isTrusted === false) return;
    if (!boton || boton.disabled) return;
    // Oculta y deshabilita el botón para que no salga en la foto ni se doble-dispare.
    boton.disabled = true;
    boton.style.display = "none";

    var restaurado = false;
    function restaurar() {
      if (restaurado) return;
      restaurado = true;
      if (!boton) return;
      boton.disabled = false;
      actualizar(); // vuelve a mostrarlo si sigue habiendo denuncia en curso
    }

    // Respaldo por si no llega respuesta del service worker.
    var respaldo = setTimeout(restaurar, 10000);

    try {
      chrome.runtime.sendMessage({ accion: "capturarComprobante" }, function () {
        clearTimeout(respaldo);
        restaurar();
      });
    } catch (e) {
      clearTimeout(respaldo);
      restaurar();
    }
  }

  // Reacciona a cambios de la denuncia en curso (aparece al pulsar Rellenar,
  // desaparece si se limpia).
  try {
    chrome.storage.onChanged.addListener(function (cambios, area) {
      if (area === "local" && cambios && cambios.ultima_denuncia_registro) actualizar();
    });
  } catch (e) { /* sin acceso a storage */ }

  crear_boton();
})();
