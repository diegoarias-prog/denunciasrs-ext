// ============================================================================
//  Service worker: hace CLICS REALES (de confianza) con chrome.debugger (CDP).
//  Los formularios React (FB/IG/WhatsApp/TikTok) rechazan los clics sintéticos
//  de una extensión para marcar radios/casillas; solo aceptan clics reales.
//  El popup envía una lista de selectores y aquí se hace un clic real en cada uno.
//  Solo marca (clic) cuando el elemento NO está ya marcado, para no des-marcar.
// ============================================================================

// Motor de relleno compartido (define APLICAR en el ámbito del service worker) para
// poder RE-INYECTARLO nosotros mismos en la pestaña durante el autorrelleno persistente.
importScripts("motor.js");

function cmd(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}
function attach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
function detach(tabId) {
  return new Promise((resolve) => { chrome.debugger.detach({ tabId }, () => resolve()); });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Devuelve las coordenadas del centro del control a clicar (su label visible si lo
// tiene). Devuelve null si el elemento no existe o YA está marcado (no re-clicar).
function exprCoords(sel) {
  return "(function(){var e=document.querySelector(" + JSON.stringify(sel) + ");" +
    "if(!e) return null;" +
    "if((e.type==='radio'||e.type==='checkbox') && e.checked) return null;" +
    "var l=null; try{ if(e.id) l=document.querySelector('label[for=\"'+(window.CSS?CSS.escape(e.id):e.id)+'\"]'); }catch(x){}" +
    "var t=(l && l.getBoundingClientRect().width>1)? l : e;" +
    "try{ t.scrollIntoView({block:'center'}); }catch(x){}" +
    "var r=t.getBoundingClientRect();" +
    "if(r.width<1||r.height<1){ r=e.getBoundingClientRect(); }" +
    "if(r.width<1||r.height<1) return null;" +
    "return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};})()";
}

async function clicReal(tabId, sel) {
  const r = await cmd(tabId, "Runtime.evaluate", { expression: exprCoords(sel), returnByValue: true });
  const c = r && r.result && r.result.value;
  if (!c) return false; // no existe o ya estaba marcado
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
  return true;
}

async function hacerClics(tabId, selectores) {
  let ok = 0;
  let attached = false;
  try {
    await attach(tabId);
    attached = true;
    await cmd(tabId, "Runtime.enable").catch(() => {});
    for (const sel of selectores) {
      try { if (await clicReal(tabId, sel)) ok++; } catch (e) { /* sigue con el resto */ }
      await dormir(180);
    }
  } catch (e) {
    return { ok, error: String((e && e.message) || e) };
  } finally {
    if (attached) await detach(tabId);
  }
  return { ok };
}

// ============================================================================
//  AUTORRELLENO PERSISTENTE de la 2.ª etapa (TikTok Copyright/Marca).
//  Problema real (confirmado con los volcados del DOM del formulario): tras elegir los
//  desplegables y el correo, el formulario SOLO muestra el campo del correo; el resto
//  (Tipo de obra, Origen, Descripción, firma, casillas, URL) NO existe hasta VERIFICAR
//  el correo. Por eso antes había que pulsar "Rellenar" por 2.ª vez al volver del correo.
//  Solución: tras el primer clic, el service worker REPITE por su cuenta lo mismo que hacía
//  ese 2.º clic —re-inyecta APLICAR (una pasada) + clics reales— cada pocos segundos, hasta
//  ~5 min o hasta que el formulario quede completo. Vive en el service worker: sobrevive a
//  cerrar el popup y a irse a verificar el correo. Un solo "Rellenar" basta.
// ============================================================================
const AUTORRELLENO = {}; // tabId -> { cancelar: bool }

async function autorelleno(tabId, pasos) {
  if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; // cancela un bucle previo del mismo tab
  const estado = { cancelar: false };
  AUTORRELLENO[tabId] = estado;
  const fin = Date.now() + 300000; // 5 min (cubre el ida y vuelta de verificar el correo)
  let limpias = 0;
  while (!estado.cancelar && Date.now() < fin) {
    let res = null;
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: APLICAR,
        args: [pasos, { unaPasada: true }]
      });
      res = (r && r[0] && r[0].result) || null;
    } catch (e) {
      break; // la pestaña se cerró o navegó fuera del formulario: paramos
    }
    if (res && res.clicsReales && res.clicsReales.length) {
      try { await hacerClics(tabId, res.clicsReales); } catch (e) { /* seguimos igual */ }
    }
    // Parada anticipada: 3 rondas seguidas sin campos faltantes = formulario ya completo.
    // Durante la espera de verificación del correo, faltan.length > 0 (los campos de la 2.ª
    // etapa aún no existen), así que el bucle NO se corta antes de tiempo.
    if (res && (!res.faltan || res.faltan.length === 0)) { if (++limpias >= 3) break; }
    else limpias = 0;
    await dormir(2500);
  }
  if (AUTORRELLENO[tabId] === estado) delete AUTORRELLENO[tabId];
}

// Si se cierra la pestaña, cancela su bucle de autorrelleno.
chrome.tabs.onRemoved.addListener((tabId) => { if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; });

// Captura la PÁGINA COMPLETA (no solo el viewport) de la pestaña indicada, usando
// el permiso `debugger` que la extensión ya tiene. Devuelve { dataUrl } o { error }.
async function capturarCompleta(tabId) {
  let attached = false;
  try {
    await attach(tabId);
    attached = true;
    await cmd(tabId, "Page.enable").catch(() => {});
    await cmd(tabId, "Runtime.enable").catch(() => {});

    // 1) Forzar el render del contenido diferido (lazy) de Facebook: recorremos
    //    la página de arriba abajo en pasos, dando tiempo a que los
    //    IntersectionObserver rendericen todas las cajas (URLs, enlaces, etc.).
    for (let i = 0; i < 20; i++) {
      await cmd(tabId, "Runtime.evaluate", {
        expression: "window.scrollTo(0, " + i + " * window.innerHeight);",
      }).catch(() => {});
      await dormir(150);
      // Si ya llegamos al final del documento, dejamos de bajar.
      try {
        const fin = await cmd(tabId, "Runtime.evaluate", {
          expression:
            "(function(){var d=document.documentElement;" +
            "return (window.innerHeight + window.scrollY) >= d.scrollHeight;})()",
          returnByValue: true,
        });
        if (fin && fin.result && fin.result.value === true) break;
      } catch (x) { /* seguimos recorriendo */ }
    }
    // Volvemos arriba y damos un respiro para que se estabilice el layout.
    await cmd(tabId, "Runtime.evaluate", { expression: "window.scrollTo(0,0);" }).catch(() => {});
    await dormir(300);

    // 2) Medir la altura REAL combinando dos fuentes y tomando el MÁXIMO.
    //    (a) Page.getLayoutMetrics.
    let anchoMetrics = 0, altoMetrics = 0;
    try {
      const m = await cmd(tabId, "Page.getLayoutMetrics");
      const size = (m && (m.cssContentSize || m.contentSize)) || null;
      if (size) {
        anchoMetrics = size.width || 0;
        altoMetrics = size.height || 0;
      }
    } catch (x) { /* usamos solo el DOM si falla */ }
    //    (b) Medición vía DOM.
    let anchoDom = 0, altoDom = 0;
    try {
      const r = await cmd(tabId, "Runtime.evaluate", {
        expression:
          "(function(){var d=document;return {" +
          "w: Math.max(d.documentElement.scrollWidth, d.body?d.body.scrollWidth:0, d.documentElement.clientWidth)," +
          "h: Math.max(d.documentElement.scrollHeight, d.body?d.body.scrollHeight:0, d.documentElement.offsetHeight)" +
          "};})()",
        returnByValue: true,
      });
      const v = r && r.result && r.result.value;
      if (v) { anchoDom = v.w || 0; altoDom = v.h || 0; }
    } catch (x) { /* usamos solo metrics si falla */ }

    let width = Math.max(anchoMetrics, anchoDom);
    let height = Math.max(altoMetrics, altoDom);
    // Acotamos la altura a 30000 px máximo (evita capturas gigantes).
    if (height > 30000) height = 30000;

    // 3) Ampliar el viewport para que TODO el contenido quede "visible" y
    //    renderizado a la vez (si falla, seguimos sin override).
    let overrideOk = false;
    if (width > 0 && height > 0) {
      try {
        await cmd(tabId, "Emulation.setDeviceMetricsOverride", {
          mobile: false,
          width: Math.ceil(width),
          height: Math.ceil(height),
          deviceScaleFactor: 1,
          screenWidth: Math.ceil(width),
          screenHeight: Math.ceil(height),
        });
        overrideOk = true;
        await dormir(500);
      } catch (x) { /* seguimos sin override del viewport */ }
    }

    // 4) Capturar la página completa. Antes ocultamos NUESTRO botón flotante para
    //    que no salga en el comprobante; después lo restauramos.
    await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.dataset.prevDisplay=b.style.display; b.style.display='none';}})()" }).catch(() => {});
    const params = { format: "jpeg", quality: 70, captureBeyondViewport: true };
    if (width > 0 && height > 0) {
      params.clip = { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height), scale: 1 };
    }
    const shot = await cmd(tabId, "Page.captureScreenshot", params);
    // Restaurar el botón flotante tras la captura.
    await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.style.display=b.dataset.prevDisplay||'';}})()" }).catch(() => {});

    // 5) Limpiar el override del viewport antes de soltar el debugger.
    if (overrideOk) await cmd(tabId, "Emulation.clearDeviceMetricsOverride").catch(() => {});

    return { dataUrl: "data:image/jpeg;base64," + shot.data };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  } finally {
    // Por si la captura falló tras aplicar el override / ocultar el botón, lo
    // limpiamos y restauramos igualmente antes de soltar el debugger.
    if (attached) {
      await cmd(tabId, "Runtime.evaluate", { expression: "(function(){var b=document.getElementById('denuncias_rs_boton_captura'); if(b){b.style.display=b.dataset.prevDisplay||'';}})()" }).catch(() => {});
      await cmd(tabId, "Emulation.clearDeviceMetricsOverride").catch(() => {});
      await detach(tabId);
    }
  }
}

// ============================================================================
//  ATAJO DE TECLADO (Alt+Shift+S por defecto): dispara la captura del formulario
//  en el CONTENT SCRIPT (captura_flotante.js), que sí tiene DOM y reutiliza el
//  método probado del popup (Image + canvas). El worker ya NO redimensiona ni
//  guarda: solo produce el screenshot de página completa vía `capturarCompleta`.
// ============================================================================

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "capturar_comprobante") return;
  // Pestaña del formulario (la activa de la ventana enfocada).
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && tab.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { accion: "disparaCaptura" });
    } catch (e) { /* pestaña sin content script (chrome://, PDF, etc.) */ }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Solo aceptamos mensajes de los propios contextos de la extensión
  // (popup/options/content script propio), nunca de páginas o extensiones
  // externas (blindaje ante futuros cambios de config).
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (msg && msg.accion === "clicsReales") {
    // El popup manda `msg.tabId`; el VIGILANTE (mundo isolated) no lo conoce, así que
    // usamos la pestaña del emisor (`sender.tab.id`), igual que en `capturaCompleta`.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) { hacerClics(tabId, msg.selectores || []).then(sendResponse); return true; } // respuesta asíncrona
    return; // sin pestaña: nada que clicar
  }
  if (msg && msg.accion === "capturaCompleta") {
    // El popup manda `msg.tabId`; el content script no lo conoce, así que
    // usamos la pestaña del emisor (`sender.tab.id`).
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) { capturarCompleta(tabId).then(sendResponse); return true; }
    return; // sin pestaña: nada que capturar
  }
  if (msg && msg.accion === "iniciarAutorelleno") {
    // El popup pide que el service worker siga rellenando la 2.ª etapa por su cuenta.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId && Array.isArray(msg.pasos)) autorelleno(tabId, msg.pasos); // bucle en segundo plano
    sendResponse({ ok: true });
    return; // no necesitamos mantener el canal abierto
  }
  if (msg && msg.accion === "detenerAutorelleno") {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId && AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true;
    return;
  }
});
