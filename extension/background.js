// ============================================================================
//  Service worker: hace CLICS REALES (de confianza) con chrome.debugger (CDP).
//  Los formularios React (FB/IG/WhatsApp/TikTok) rechazan los clics sintéticos
//  de una extensión para marcar radios/casillas; solo aceptan clics reales.
//  El popup envía una lista de selectores y aquí se hace un clic real en cada uno.
//  Solo marca (clic) cuando el elemento NO está ya marcado, para no des-marcar.
// ============================================================================

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
//  ATAJO DE TECLADO (Alt+Shift+S por defecto): captura el formulario de la
//  pestaña activa y lo adjunta al comprobante de la denuncia en curso, SIN
//  depender del popup (que se cierra al interactuar con el formulario).
// ============================================================================

// Redimensiona un dataURL a 'maxAncho' px de ancho y lo recomprime a JPEG en el
// SERVICE WORKER (no hay DOM/Image/canvas aquí; usamos OffscreenCanvas y
// convertimos el blob a dataURL sin FileReader, que tampoco existe en el worker).
async function redimensionar_worker(dataUrl, maxAncho, calidad) {
  const blob0 = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob0);
  let w = bmp.width, h = bmp.height;
  if (w > maxAncho) { h = Math.round(h * maxAncho / w); w = maxAncho; }
  const oc = new OffscreenCanvas(w, h);
  oc.getContext("2d").drawImage(bmp, 0, 0, w, h);
  const blob = await oc.convertToBlob({ type: "image/jpeg", quality: calidad });
  if (bmp.close) bmp.close();
  // blob -> dataURL (sin FileReader, que no existe en el worker).
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  }
  return "data:image/jpeg;base64," + btoa(bin);
}

// Inyecta un toast autodesechable en la pestaña para dar feedback sin popup.
// Colores: éxito #059669, aviso #b45309, error #dc2626. Respaldo: badge en el ícono.
async function toast_en_pagina(tabId, texto, color) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t, c) => {
        const d = document.createElement("div");
        d.textContent = t;
        d.style.cssText = "position:fixed;z-index:2147483647;bottom:20px;right:20px;max-width:320px;padding:12px 16px;border-radius:10px;background:" + c + ";color:#fff;font:600 13px 'Segoe UI',Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;";
        document.body.appendChild(d);
        requestAnimationFrame(() => { d.style.opacity = "1"; });
        setTimeout(() => { d.style.opacity = "0"; setTimeout(() => d.remove(), 300); }, 3500);
      },
      args: [texto, color]
    });
  } catch (e) {
    // Pestaña no inyectable (chrome://, PDF, etc.): como respaldo, badge en el ícono.
    // El badge refleja la severidad del aviso (✓ solo para éxito verde; ! para el resto).
    try {
      chrome.action.setBadgeText({ text: color === "#059669" ? "✓" : "!" });
      chrome.action.setBadgeBackgroundColor({ color: color });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
    } catch (x) {}
  }
}

// Captura el formulario de la pestaña `tabId` y lo adjunta al comprobante de la
// denuncia en curso (`ultima_denuncia_registro`). Da feedback con toasts en la
// propia pestaña. Reutilizada por el atajo de teclado y por el botón flotante.
async function capturar_y_guardar(tabId) {
  if (!tabId) {
    try { chrome.action.setBadgeText({ text: "!" }); chrome.action.setBadgeBackgroundColor({ color: "#b45309" }); setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000); } catch (x) {}
    return;
  }

  // 1) ¿Hay una denuncia en curso a la que adjuntar?
  const store = await new Promise((res) =>
    chrome.storage.local.get(["ultima_denuncia_registro"], (x) => res(x || {})));
  const idDest = store.ultima_denuncia_registro;
  if (!idDest) {
    await toast_en_pagina(tabId, "Primero pulsa Rellenar para iniciar una denuncia.", "#b45309");
    return;
  }

  // 2) Capturar la página completa (función ya existente).
  let resp;
  try {
    resp = await capturarCompleta(tabId);
  } catch (e) {
    resp = { error: String((e && e.message) || e) };
  }
  if (!resp || resp.error || !resp.dataUrl) {
    await toast_en_pagina(tabId, "No se pudo capturar: " + ((resp && resp.error) || "sin imagen"), "#dc2626");
    return;
  }

  // 3) Redimensionar en el worker; si falla, usar el original como respaldo.
  let imagen;
  try {
    imagen = await redimensionar_worker(resp.dataUrl, 1280, 0.7);
  } catch (e) {
    imagen = resp.dataUrl;
  }

  // 4) Guardar en el comprobante de la denuncia en curso.
  const CLAVE = "denuncias_registro";
  const lista = await new Promise((res) =>
    chrome.storage.local.get([CLAVE], (x) => res(Array.isArray(x[CLAVE]) ? x[CLAVE] : [])));
  const ent = lista.find((x) => x.id === idDest);
  if (!ent) {
    await toast_en_pagina(tabId, "No encuentro la denuncia para adjuntar la captura.", "#b45309");
    return;
  }
  ent.comprobante_img = imagen;
  await new Promise((res) => chrome.storage.local.set({ [CLAVE]: lista }, res));

  await toast_en_pagina(tabId, "✓ Captura guardada en el comprobante.", "#059669");
}

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== "capturar_comprobante") return;
  // Pestaña del formulario (la activa de la ventana enfocada).
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await capturar_y_guardar(tab && tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Solo aceptamos mensajes de los propios contextos de la extensión (popup/options),
  // nunca de páginas o extensiones externas (blindaje ante futuros cambios de config).
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (msg && msg.accion === "clicsReales" && msg.tabId) {
    hacerClics(msg.tabId, msg.selectores || []).then(sendResponse);
    return true; // respuesta asíncrona
  }
  if (msg && msg.accion === "capturaCompleta" && msg.tabId) {
    capturarCompleta(msg.tabId).then(sendResponse);
    return true; // respuesta asíncrona
  }
  if (msg && msg.accion === "capturarComprobante") {
    // El botón flotante (content script) manda esto; usamos la pestaña del emisor.
    const tabId = (sender && sender.tab && sender.tab.id) || msg.tabId;
    capturar_y_guardar(tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // respuesta asíncrona
  }
});
