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

// Los archivos de datos (marcas/justificaciones/politicas/formularios) usan `window.*`
// para exponer sus globales. En el service worker no existe `window`, así que lo
// apuntamos a `self` (globalThis) ANTES de cargarlos. Ninguno usa el DOM al cargarse
// (solo definen objetos de datos), por eso funcionan también aquí. Esto permite armar
// el "plan de relleno" desde el MENÚ CONTEXTUAL (clic derecho) igual que en el popup.
self.window = self;
importScripts(
  "datos/marcas.js",           // window.MARCAS_BASE, window.CORREO_PERSONA
  "datos/justificaciones.js",  // window.JUSTIF
  "datos/politicas_generales.js", // window.POLITICAS_GENERALES
  "datos/formularios.js"       // window.FORMULARIOS (usa JUSTIF y POLITICAS al ejecutar)
);

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

// ============================================================================
//  MENÚ CONTEXTUAL (clic derecho) — aparece en CUALQUIER página del navegador.
//  Estructura:  🚩 Denuncias RS ▸ [cada MARCA] ▸ ("✍ Rellenar ESTA página" + TODOS
//  los formularios).  "Rellenar ESTA página" autodetecta el formulario por la URL de
//  la pestaña actual y lo rellena.  Cada formulario ABRE la denuncia (los web en una
//  pestaña nueva y la rellena; los de correo generan el borrador) con esa marca — así
//  se denuncia desde donde sea, no solo estando en el formulario.
//  Reutiliza los mismos planes (FORMULARIOS), datos de marca (MARCAS = base + editadas
//  − eliminadas) y URLs del Excel que el popup. Justificación: ESPAÑOL en formularios
//  web (regla del proyecto); en los correos se conserva el bilingüe en/es.
// ============================================================================
const CLAVE_URLS_CTX = "urls_denuncia";        // misma clave que el popup (CLAVE_URLS)
const RS_CONTEXTS = ["page", "frame", "selection", "link", "image", "editable"];
const rsEnc = (s) => encodeURIComponent(String(s)); // marca -> id de menú (nunca lleva '|')
const rsDec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

// Marcas: base + editadas − eliminadas (idéntico a obtener_marcas() del popup).
async function ctxObtenerMarcas() {
  const d = await chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"]);
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  const PELIGROSA = (k) => k === "__proto__" || k === "constructor" || k === "prototype";
  const todas = Object.assign({}, self.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    if (PELIGROSA(m)) return; // evita contaminación de prototipo por un nombre de marca malicioso
    const base = self.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => { if (PELIGROSA(k)) return; if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k]; });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  return todas;
}

// Detecta qué formulario web corresponde a la URL de la pestaña (mismo dominio raíz
// + la ruta del formulario más específica que sea prefijo de la ruta de la pestaña).
function ctxDetectarForm(urlTab) {
  let host = "", path = "";
  try { const u = new URL(urlTab); host = u.host.replace(/^www\./, ""); path = (u.pathname || "").toLowerCase(); }
  catch (e) { return null; }
  let mejor = null, mejorLargo = -1;
  Object.keys(self.FORMULARIOS).forEach((k) => {
    const f = self.FORMULARIOS[k];
    if (!f.url || f.tipo === "email") return; // los reportes por correo no se rellenan en página
    let fh = "", fp = "";
    try { const fu = new URL(f.url); fh = fu.host.replace(/^www\./, ""); fp = (fu.pathname || "").toLowerCase(); }
    catch (e) { return; }
    const raiz = fh.split(".").slice(-2).join("."); // p.ej. tiktok.com
    if (host.indexOf(raiz) < 0 && fh.indexOf(host.split(".").slice(-2).join(".")) < 0) return;
    if (fp && fp.length > 1 && path.indexOf(fp) === 0) {         // ruta distintiva coincide
      if (fp.length > mejorLargo) { mejor = k; mejorLargo = fp.length; }
    } else if (mejorLargo < 0) {                                  // solo coincide el dominio
      mejor = mejor || k;
    }
  });
  return mejor;
}

// Registra —o reutiliza— una entrada "pendiente" (anti doble-clic), igual que el popup.
async function ctxRegistrarDenuncia(marca, form, urlDen) {
  const CLAVE = "denuncias_registro";
  const g = await chrome.storage.local.get([CLAVE]);
  const lista = Array.isArray(g[CLAVE]) ? g[CLAVE] : [];
  const plataforma = form.red;
  const tipo = form.tipo === "email" ? "correo" : "formulario";
  const categoria = form.nombre;
  const VENTANA = 60 * 1000, ahora = Date.now();
  const existente = lista.find((d) =>
    d.estado === "pendiente" && d.marca === marca && d.plataforma === plataforma &&
    d.categoria === categoria && (ahora - new Date(d.fecha).getTime()) < VENTANA);
  if (existente) {
    if (urlDen && !existente.url_denunciada) existente.url_denunciada = urlDen; // guarda el enlace clicado
    await chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: existente.id });
    return existente.id;
  }
  const consecutivo = lista.filter((d) => d.marca === marca)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({ id, marca, plataforma, tipo, categoria, url_denunciada: urlDen || "", numero_caso: "",
    estado: "pendiente", consecutivo, notas: "", fecha: new Date().toISOString() });
  await chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: id });
  return id;
}

// Muestra un aviso breve DENTRO de la página (toast), sin permiso de notificaciones.
function ctxAvisar(tabId, texto, esError) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (t, err) => {
      try {
        const id = "rs_toast_denuncias";
        let d = document.getElementById(id);
        if (!d) { d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
        d.textContent = t;
        d.style.cssText = "position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);" +
          "max-width:90vw;padding:12px 18px;border-radius:10px;font:600 14px system-ui,Arial,sans-serif;" +
          "color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);background:" + (err ? "#c0392b" : "#1e824c") + ";";
        clearTimeout(window.__rs_toast_t);
        window.__rs_toast_t = setTimeout(() => { try { d.remove(); } catch (e) {} }, 6000);
      } catch (e) {}
    },
    args: [String(texto), !!esError]
  }).catch(() => {});
}

// Adjunta a la denuncia el CONTENIDO del correo generado (para verlo/copiarlo en el
// Registro), igual que guardar_correo_en_denuncia() del popup.
async function ctxGuardarCorreo(id, em) {
  if (!id || !em) return;
  const CLAVE = "denuncias_registro";
  const g = await chrome.storage.local.get([CLAVE]);
  const lista = Array.isArray(g[CLAVE]) ? g[CLAVE] : [];
  const d = lista.find((x) => String(x.id) === String(id));
  if (!d) return;
  d.correo = { to: em.to || "", asunto: em.asunto || "", cuerpo: em.cuerpo || "",
    asunto_es: em.asunto_es || "", cuerpo_es: em.cuerpo_es || "", enviado: false, fecha: new Date().toISOString() };
  await chrome.storage.local.set({ [CLAVE]: lista });
}

// Espera a que la pestaña `tabId` termine de cargar (o 15 s como tope).
function ctxEsperarCarga(tabId) {
  return new Promise((resolve) => {
    const l = (id, info) => { if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
    setTimeout(() => { try { chrome.tabs.onUpdated.removeListener(l); } catch (e) {} resolve(); }, 15000);
  });
}

// Arma el contexto (marca + formulario). Justificación en ESPAÑOL para formularios
// web (regla del proyecto); para los reportes por CORREO se conserva el bilingüe
// (justif=en, justif_es=es) porque Telegram y otros usan ambos. Devuelve {ctx, form,
// datos} o null si falta la marca o el formulario.
async function ctxArmar(marca, formKey, urlsOverride) {
  const form = self.FORMULARIOS[formKey];
  const MARCAS = await ctxObtenerMarcas();
  const datos = MARCAS[marca];
  if (!form || !datos) return null;
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  const esCorreo = form.tipo === "email";
  const justif = self.JUSTIF.conPolitica(
    self.JUSTIF.justificacion(form.cat, redCode, marca, pais, esCorreo ? "en" : "es"), formKey, esCorreo ? "en" : "es");
  const justif_es = self.JUSTIF.conPolitica(
    self.JUSTIF.justificacion(form.cat, redCode, marca, pais, "es"), formKey, "es");
  const g = await chrome.storage.local.get([CLAVE_URLS_CTX]);
  const urlsExcel = Array.isArray(g[CLAVE_URLS_CTX]) ? g[CLAVE_URLS_CTX] : [];
  // Si el usuario hizo clic derecho SOBRE un enlace (o imagen/selección con URL), ESE
  // enlace es el que se denuncia; si no, se usan las URLs cargadas del Excel.
  const urls = (Array.isArray(urlsOverride) && urlsOverride.length) ? urlsOverride : urlsExcel;
  const ctx = { marca, datos, justif, justif_es, correoPersona: self.CORREO_PERSONA, urls };
  return { ctx, form, datos };
}

// Ejecuta un plan (APLICAR + clics reales + autorrelleno persistente) en una pestaña.
async function ctxEjecutarPlan(tabId, plan, marca) {
  const r = await chrome.scripting.executeScript({ target: { tabId }, func: APLICAR, args: [plan.pasos] });
  const res = (r && r[0] && r[0].result) || { ok: 0, faltan: [], clicsReales: [] };
  if (res.clicsReales && res.clicsReales.length) { try { await hacerClics(tabId, res.clicsReales); } catch (e) {} }
  if (plan.autorepetir) autorelleno(tabId, plan.pasos.filter((p) => p.tipo !== "dropdown"));
  ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) rellenado(s) para «" + marca +
    "». Revisa y captura el comprobante antes de enviar.", false);
}

// "Rellenar ESTA página": autodetecta el formulario por la URL de la pestaña actual.
async function ctxRellenarPagina(tab, marca, objetivo) {
  const formKey = ctxDetectarForm(tab.url || "");
  if (!formKey) {
    ctxAvisar(tab.id, "Denuncias RS: esta página no es un formulario de denuncia. Usa la marca ▸ el formulario que quieras para abrirlo.", true);
    return;
  }
  const a = await ctxArmar(marca, formKey, objetivo);
  if (!a) { ctxAvisar(tab.id, "Denuncias RS: no encuentro la marca «" + marca + "».", true); return; }
  await ctxRegistrarDenuncia(marca, a.form, (objetivo && objetivo[0]) || "");
  try { await ctxEjecutarPlan(tab.id, a.form.construirPlan(a.ctx), marca); }
  catch (e) { ctxAvisar(tab.id, "Denuncias RS: no se pudo rellenar aquí (" + (e.message || e) + ").", true); }
}

// Abre la denuncia elegida con esa marca: los formularios WEB en una pestaña NUEVA (no
// pierdes la página actual) y los rellena; los de CORREO generan el borrador (correo.html).
async function ctxAbrirDenuncia(tabOrigen, marca, formKey, objetivo) {
  const a = await ctxArmar(marca, formKey, objetivo);
  if (!a) { if (tabOrigen && tabOrigen.id) ctxAvisar(tabOrigen.id, "Denuncias RS: no encuentro la marca «" + marca + "».", true); return; }
  const form = a.form, ctx = a.ctx, datos = a.datos;
  const urlDen = (objetivo && objetivo[0]) || "";
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    const idDen = await ctxRegistrarDenuncia(marca, form, urlDen);
    await ctxGuardarCorreo(idDen, em);
    await chrome.storage.local.set({ email_reporte: Object.assign({}, em, { from: datos.correo || "" }) });
    chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    return;
  }
  const plan = form.construirPlan(ctx);
  await ctxRegistrarDenuncia(marca, form, urlDen);
  let nueva;
  // active:false: abre la denuncia en una pestaña APARTE en segundo plano para NO sacar
  // al usuario de la pestaña que está viendo. El autorrelleno funciona igual (usa nueva.id).
  try { nueva = await chrome.tabs.create({ url: plan.url, active: false }); } catch (e) { return; }
  await ctxEsperarCarga(nueva.id);
  await dormir(1800); // deja aparecer los campos
  try { await ctxEjecutarPlan(nueva.id, plan, marca); }
  catch (e) { /* la pestaña abrió; el usuario puede rellenar con el clic derecho de nuevo */ }
}

// (Re)construye el menú: 🚩 Denuncias RS ▸ [cada marca] ▸ (Rellenar esta página + todos
// los formularios). Se arma una sola vez al instalar/arrancar y al cambiar las marcas.
let rsConstruyendo = false;
async function ctxConstruirMenus() {
  if (rsConstruyendo) return; rsConstruyendo = true;
  try {
    await new Promise((res) => chrome.contextMenus.removeAll(res));
    const base = { contexts: RS_CONTEXTS }; // sin documentUrlPatterns: aparece en TODA página
    chrome.contextMenus.create(Object.assign({ id: "rs_root", title: "🚩 Denuncias RS" }, base));
    const MARCAS = await ctxObtenerMarcas();
    const marcas = Object.keys(MARCAS).sort((a, b) => a.localeCompare(b, "es"));
    // Formularios ordenados por "Red: Nombre" (se listan dentro de cada marca).
    const forms = Object.keys(self.FORMULARIOS).sort((a, b) =>
      (self.FORMULARIOS[a].red + ": " + self.FORMULARIOS[a].nombre)
        .localeCompare(self.FORMULARIOS[b].red + ": " + self.FORMULARIOS[b].nombre, "es"));
    // Lista de redes sociales presentes (ordenadas), para agrupar los formularios.
    const redes = [];
    forms.forEach((fk) => { const r = self.FORMULARIOS[fk].red; if (redes.indexOf(r) < 0) redes.push(r); });
    redes.sort((a, b) => a.localeCompare(b, "es"));
    marcas.forEach((m) => {
      const pid = "rs_m|" + rsEnc(m);
      chrome.contextMenus.create(Object.assign({ id: pid, parentId: "rs_root", title: m }, base));
      chrome.contextMenus.create(Object.assign({ id: "rs_fill|" + rsEnc(m), parentId: pid, title: "✍ Rellenar ESTA página" }, base));
      chrome.contextMenus.create(Object.assign({ id: "rs_sep|" + rsEnc(m), parentId: pid, type: "separator" }, base));
      // Un submenú por RED SOCIAL; dentro, solo los formularios de esa red (así el menú
      // queda agrupado y legible en vez de una lista larga y plana).
      redes.forEach((red) => {
        const rid = "rs_red|" + rsEnc(m) + "|" + rsEnc(red);
        chrome.contextMenus.create(Object.assign({ id: rid, parentId: pid, title: red }, base));
        forms.filter((fk) => self.FORMULARIOS[fk].red === red).forEach((fk) => {
          const f = self.FORMULARIOS[fk];
          chrome.contextMenus.create(Object.assign({ id: "rs_open|" + rsEnc(m) + "|" + fk, parentId: rid, title: f.nombre }, base));
        });
      });
    });
  } catch (e) { /* si falla, el popup sigue funcionando igual */ }
  finally { rsConstruyendo = false; }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId || "");
  // Si el clic derecho fue SOBRE un enlace (o una imagen/media, o texto seleccionado que
  // es una URL), ese enlace es el que se denuncia; si no, se usan las URLs del Excel.
  const esUrl = (s) => /^https?:\/\//i.test((s || "").trim());
  let objetivo = [];
  if (esUrl(info.linkUrl)) objetivo = [info.linkUrl.trim()];
  else if (esUrl(info.srcUrl)) objetivo = [info.srcUrl.trim()];
  else if (esUrl(info.selectionText)) objetivo = [info.selectionText.trim()];
  if (id.indexOf("rs_fill|") === 0) {
    if (tab && tab.id) ctxRellenarPagina(tab, rsDec(id.slice("rs_fill|".length)), objetivo);
  } else if (id.indexOf("rs_open|") === 0) {
    const resto = id.slice("rs_open|".length);
    const i = resto.indexOf("|"); // "<marca URL-encoded>|<formKey>" — la marca no lleva '|'
    if (i > 0) ctxAbrirDenuncia(tab, rsDec(resto.slice(0, i)), resto.slice(i + 1), objetivo);
  }
});

// Reconstruye el menú al instalar/arrancar y cuando cambian las marcas (no en cada relleno).
chrome.runtime.onInstalled.addListener(ctxConstruirMenus);
chrome.runtime.onStartup.addListener(ctxConstruirMenus);
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== "local") return;
  if (cambios.marcas_usuario || cambios.marcas_eliminadas) ctxConstruirMenus();
});
