// ============================================================================
//  Botón flotante "📸 Capturar comprobante" (content script).
//  Aparece SOLO cuando hay una denuncia en curso (ultima_denuncia_registro) y,
//  al pulsarlo (o con el atajo de teclado), CAPTURA aquí mismo el formulario y lo
//  adjunta al comprobante. La captura, la redimensión y el guardado ocurren en el
//  content script (que sí tiene DOM), reutilizando el método probado del popup;
//  el service worker solo produce el screenshot de página completa. Alternativa
//  al botón del popup (que se cierra al interactuar con el formulario).
// ============================================================================
(function () {
  "use strict";

  // Guarda contra doble init (el content script podría inyectarse dos veces).
  if (window.__denunciasRSBoton) return;
  window.__denunciasRSBoton = true;

  var boton = null;
  var capturando = false;

  // ------------------------------------------------------------------------
  //  Redimensión: COPIA del método probado de popup.js (`redimensionar_imagen`).
  //  Redimensiona un dataURL a 'maxAncho' px de ancho y lo recomprime a JPEG
  //  'calidad' (~0.7), para no llenar el storage con capturas enormes.
  // ------------------------------------------------------------------------
  function redimensionar(dataUrl, maxAncho, calidad) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxAncho) { h = Math.round(h * (maxAncho / w)); w = maxAncho; }
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", calidad));
      };
      img.onerror = function () { reject(new Error("imagen inválida")); };
      img.src = dataUrl;
    });
  }

  // ------------------------------------------------------------------------
  //  Toast de feedback (abajo-derecha), autodesechable a los 3.5 s.
  //  Colores: éxito #059669, aviso #b45309, error #dc2626.
  //  Usa textContent (NADA de innerHTML) para no inyectar HTML.
  // ------------------------------------------------------------------------
  function toast(texto, color) {
    try {
      var d = document.createElement("div");
      d.textContent = texto;
      d.style.cssText =
        "position:fixed;z-index:2147483647;bottom:20px;right:20px;max-width:320px;" +
        "padding:12px 16px;border-radius:10px;background:" + color + ";color:#fff;" +
        "font:600 13px 'Segoe UI',Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
        "opacity:0;transition:opacity .2s;";
      var destino = document.body || document.documentElement;
      if (!destino) return;
      destino.appendChild(d);
      requestAnimationFrame(function () { d.style.opacity = "1"; });
      setTimeout(function () {
        d.style.opacity = "0";
        setTimeout(function () { try { d.remove(); } catch (e) {} }, 300);
      }, 3500);
    } catch (e) { /* si no se puede mostrar el toast, no rompemos la captura */ }
  }

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
        // No re-mostrar mientras se está capturando (el botón está oculto para
        // no salir en la foto).
        if (capturando) return;
        var tiene = !!(x && x.ultima_denuncia_registro);
        boton.style.display = tiene ? "block" : "none";
      });
    } catch (e) { /* contexto de extensión no disponible */ }
  }

  // ------------------------------------------------------------------------
  //  Captura + redimensión + guardado, todo aquí (método probado del popup).
  // ------------------------------------------------------------------------
  async function hacer_captura() {
    if (capturando) return;
    capturando = true;
    try {
      // 1) ¿Hay una denuncia en curso a la que adjuntar?
      var store = await new Promise(function (res) {
        chrome.storage.local.get(["ultima_denuncia_registro"], function (x) { res(x || {}); });
      });
      var idDest = store.ultima_denuncia_registro;
      if (!idDest) {
        toast("Primero pulsa Rellenar para iniciar una denuncia.", "#b45309");
        capturando = false;
        return;
      }

      // 2) Ocultar el botón para que no salga en la foto.
      if (boton) boton.style.display = "none";

      // 3) Pedir al service worker la captura de página completa (sin tabId: el
      //    worker usa la pestaña del emisor).
      var resp = await new Promise(function (res) {
        var listo = false;
        // Timeout defensivo: si el service worker no respondiera, no dejamos
        // `capturando` pegado (bloquearía futuras capturas).
        var t = setTimeout(function () { if (!listo) { listo = true; res({ error: "tiempo de espera agotado" }); } }, 30000);
        chrome.runtime.sendMessage({ accion: "capturaCompleta" }, function (r) {
          if (!listo) { listo = true; clearTimeout(t); res(r); }
        });
      });
      if (!resp || resp.error || !resp.dataUrl) {
        toast("No se pudo capturar: " + ((resp && resp.error) || "sin imagen"), "#dc2626");
        capturando = false;
        actualizar();
        return;
      }

      // 4) Redimensionar; si falla, usar el original como respaldo.
      var img;
      try { img = await redimensionar(resp.dataUrl, 1280, 0.7); }
      catch (e) { img = resp.dataUrl; }

      // 5) Guardar en el comprobante de la denuncia en curso.
      var CLAVE = "denuncias_registro";
      var lista = await new Promise(function (res) {
        chrome.storage.local.get([CLAVE], function (x) {
          res(Array.isArray(x[CLAVE]) ? x[CLAVE] : []);
        });
      });
      var ent = lista.find(function (x) { return x.id === idDest; });
      if (!ent) {
        toast("No encuentro la denuncia para adjuntar la captura.", "#b45309");
      } else {
        ent.comprobante_img = img;
        await new Promise(function (res) {
          chrome.storage.local.set({ [CLAVE]: lista }, res);
        });
        toast("✓ Captura guardada en el comprobante.", "#059669");
      }
    } catch (e) {
      toast("No se pudo capturar: " + ((e && e.message) || e), "#dc2626");
    } finally {
      capturando = false;
      actualizar(); // re-muestra el botón si sigue habiendo denuncia en curso
    }
  }

  function al_hacer_clic(e) {
    // Solo clics REALES del usuario: evita que el JS de la página sintetice
    // `.click()` sobre nuestro botón para forzar capturas.
    if (e && e.isTrusted === false) return;
    hacer_captura();
  }

  // Disparo del atajo de teclado (llega desde background.js).
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      // Solo mensajes de la propia extensión (defensa en profundidad).
      if (!sender || sender.id !== chrome.runtime.id) return;
      if (msg && msg.accion === "disparaCaptura") {
        hacer_captura();
        if (sendResponse) sendResponse({ ok: true });
      }
    });
  } catch (e) { /* sin acceso a runtime */ }

  // Reacciona a cambios de la denuncia en curso (aparece al pulsar Rellenar,
  // desaparece si se limpia).
  try {
    chrome.storage.onChanged.addListener(function (cambios, area) {
      if (area === "local" && cambios && cambios.ultima_denuncia_registro) actualizar();
    });
  } catch (e) { /* sin acceso a storage */ }

  crear_boton();
})();
