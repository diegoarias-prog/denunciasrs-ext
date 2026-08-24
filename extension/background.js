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
  "datos/correos_denuncia.js", // window.CORREOS_DENUNCIA (destinos fijos + memoria de correos)
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

async function autorelleno(tabId, pasos, opts) {
  opts = opts || {};
  if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; // cancela un bucle previo del mismo tab
  const estado = { cancelar: false };
  AUTORRELLENO[tabId] = estado;
  const fin = Date.now() + 300000; // 5 min (cubre el ida y vuelta de verificar el correo)
  let limpias = 0, completado = false;
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
    if (res && (!res.faltan || res.faltan.length === 0)) { if (++limpias >= 3) { completado = true; break; } }
    else limpias = 0;
    await dormir(2500);
  }
  if (AUTORRELLENO[tabId] === estado) delete AUTORRELLENO[tabId];
  // Al COMPLETARSE y si la red lo permite: enviar solo (con la cuenta atrás de 5 s).
  // enviarFormulario ya captura el comprobante antes de pulsar Enviar.
  if (completado && opts.autoenviar && !estado.cancelar) {
    try { await enviarFormulario(tabId, opts.marca || "", opts.enviarLabel); } catch (e) { /* el usuario puede enviar a mano */ }
    return;
  }
  // EN CUALQUIER OTRO CASO se captura igual: red con captcha, tiempo agotado o parada.
  // La captura es la prueba de la denuncia y no puede depender de que la red permita
  // autoenvío ni de que el formulario quedara perfecto (antes solo se capturaba en el
  // caso de autoenvío completado, así que en TikTok con captcha no salía comprobante).
  // Si se canceló porque la pestaña se cerró, guardarComprobante devuelve false y ya está.
  if (!estado.cancelar) {
    try { await activarPestana(tabId); await guardarComprobante(tabId); } catch (e) { /* sin comprobante: el usuario tiene el botón 📸 */ }
  }
}

// ============================================================================
//  OJO: AQUÍ NO SE INYECTA EN IFRAMES, Y ES A PROPÓSITO.
//  Hubo la tentación de probar el relleno en todos los marcos
//  (`executeScript({ allFrames: true })`) por si el formulario viniera dentro de un
//  iframe. NO se hace: `executeScript` no "mide", EJECUTA Y ESCRIBE. Y como toda la
//  rama del portal nuevo de Meta se detecta POR DESCARTE (`siNoHay: C`), esos pasos se
//  ejecutarían en CUALQUIER marco que no tenga los `name` del formulario clásico —por
//  ejemplo un iframe de login de Meta o de un tercero—, y ese marco recibiría el correo,
//  el teléfono, la dirección postal y la firma de la marca (setNative dispara
//  input/change con bubbles:true, así que su JS los lee en el acto). Es una fuga de
//  datos de la marca a páginas ajenas. Se inyecta SOLO en el marco principal, siempre.
// ============================================================================

// ¿La pestaña sigue en LA PÁGINA del formulario? Mismo host (o subdominio del host del
// formulario) y ruta compatible (una prefijo de la otra, por segmentos completos).
// Sirve para anclar el bucle de abajo: si Meta redirige al LOGIN —que es justo el caso
// que dispara el bucle—, la extensión NO debe escribir ahí los datos de la marca, ni
// darle clics reales con el depurador, ni guardar esa pantalla como comprobante.
function mismaPaginaDelFormulario(urlActual, urlForm) {
  try {
    const a = new URL(urlActual), b = new URL(urlForm);
    const ha = a.host.replace(/^www\./, ""), hb = b.host.replace(/^www\./, "");
    if (!(ha === hb || ha.endsWith("." + hb))) return false;
    // Rutas en MINÚSCULAS: hay formularios cuya URL lleva mayúsculas (TikTok:
    // /legal/report/Copyright) y el sitio puede redirigir a la versión en minúsculas;
    // sin esto la comparación fallaría y el bucle se cancelaría estando en la página buena.
    const pa = a.pathname.toLowerCase().replace(/\/+$/, ""), pb = b.pathname.toLowerCase().replace(/\/+$/, "");
    // UN SOLO SENTIDO: la ruta de la PESTAÑA tiene que empezar por la del FORMULARIO,
    // nunca al revés. Aceptarlo en los dos sentidos dejaba pasar una ruta MÁS CORTA
    // como si fuera el formulario: p. ej. help.meta.com/requests (el panel de
    // solicitudes del usuario, con sus datos personales) contaba como el formulario
    // /requests/1523801815366035, y ahí el bucle habría escrito los datos de la marca
    // y habría guardado esa pantalla como comprobante de la denuncia.
    if (!pb) return pa === pb; // formulario en la raíz del sitio: solo vale la raíz
    return pa === pb || pa.indexOf(pb + "/") === 0;
  } catch (e) { return false; }
}

// Comprueba, ANTES de cada reinyección, que la pestaña sigue en la página del formulario.
// Marca `seFue`/`cancelar` en el estado del bucle si se ha ido, para que quien llama solo
// tenga que salir. Si `chrome.tabs.get` lanza (pestaña cerrada), también se sale.
async function sigueEnElFormulario(tabId, urlForm, estado) {
  if (!urlForm) return true; // sin URL de referencia no hay nada que comparar
  let t = null;
  try { t = await chrome.tabs.get(tabId); } catch (e) { estado.cancelar = true; return false; }
  if (!t || !mismaPaginaDelFormulario(t.url || "", urlForm)) { estado.cancelar = true; estado.seFue = true; return false; }
  return true;
}

// ============================================================================
//  BUCLE "INSISTIR" (OJO: NO es el autorrelleno de arriba).
//  El autorrelleno de TikTok repite SIEMPRE, porque allí van apareciendo campos nuevos.
//  Aquí el caso es otro (Meta · Derechos de autor): el formulario a veces NO está pintado
//  todavía cuando el usuario pulsa Rellenar (pantalla intermedia del portal nuevo o carga
//  lenta), así que la 1.ª pasada no reconoce NADA.
//  Por eso este bucle solo insiste MIENTRAS NO SE HAYA RELLENADO NADA: en cuanto una
//  pasada consigue algo, hace una pasada completa, dispara los clics reales y se va. Así
//  nunca reabre desplegables ni pisa lo que el usuario esté escribiendo a mano.
//  "No se rellenó nada" se mide con `hechos` (campos de verdad escritos/marcados), NO con
//  `ok`: `ok` cuenta también el paso del botón "Siguiente" cuando el botón no existe, así
//  que una página vacía devuelve ok=1 y el bucle no arrancaría jamás.
// ============================================================================
async function insistirRelleno(tabId, pasos, opts) {
  opts = opts || {};
  const urlForm = opts.urlForm || "";
  if (AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true; // cancela un bucle previo del mismo tab
  const estado = { cancelar: false, seFue: false };
  AUTORRELLENO[tabId] = estado; // se comparte el registro: así "detenerAutorelleno" y onRemoved también lo paran

  // Si la pestaña NAVEGA fuera del formulario (lo típico: Meta manda al login), se corta
  // en el acto, sin esperar a la siguiente vuelta del bucle.
  const vigilarNavegacion = (id, info, tab) => {
    if (id !== tabId) return;
    const u = (info && info.url) || (tab && tab.url) || "";
    if (u && !mismaPaginaDelFormulario(u, urlForm)) { estado.cancelar = true; estado.seFue = true; }
  };
  if (urlForm) { try { chrome.tabs.onUpdated.addListener(vigilarNavegacion); } catch (e) {} }

  const fin = Date.now() + 180000; // 3 min de tope
  let ultimoFaltan = [], relleno = false, cortado = false;

  while (!estado.cancelar && Date.now() < fin) {
    await dormir(2500); // la 1.ª pasada ya la hizo el popup; aquí solo reintentamos
    if (estado.cancelar) break;
    if (!(await sigueEnElFormulario(tabId, urlForm, estado))) break; // ANCLA a la página del formulario
    let res = null;
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tabId }, // SOLO el marco principal (ver el aviso de los iframes, arriba)
        func: APLICAR,
        args: [pasos, { unaPasada: true }]
      });
      res = (r && r[0] && r[0].result) || null;
    } catch (e) {
      cortado = true; break; // la pestaña se cerró o navegó fuera: salimos sin romper nada
    }
    if (res && res.faltan) ultimoFaltan = res.faltan;
    const nada = res ? (res.hechos != null ? res.hechos === 0 : res.ok === 0) : true;
    if (!nada) { relleno = true; break; } // ya hay formulario: dejamos de insistir
  }

  // Ya apareció el formulario: UNA pasada completa (sin `unaPasada`, para que el motor
  // haga sus reintentos internos) + los clics reales de radios/casillas.
  if (relleno && !estado.cancelar && (await sigueEnElFormulario(tabId, urlForm, estado))) {
    try {
      const r2 = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: APLICAR, args: [pasos, {}] });
      const res2 = (r2 && r2[0] && r2[0].result) || null;
      if (res2) {
        if (res2.faltan) ultimoFaltan = res2.faltan;
        if (res2.clicsReales && res2.clicsReales.length) {
          try { await hacerClics(tabId, res2.clicsReales); } catch (e) { /* radios a mano y ya */ }
        }
      }
    } catch (e) { cortado = true; }
  }

  if (urlForm) { try { chrome.tabs.onUpdated.removeListener(vigilarNavegacion); } catch (e) {} }
  if (AUTORRELLENO[tabId] === estado) delete AUTORRELLENO[tabId];

  // La pestaña YA NO está en el formulario: ni comprobante ni envío. Esa pantalla (un
  // login, otra web…) no es la denuncia; guardarla como prueba falsearía el Registro y
  // además expondría lo que hubiera en ella. Solo se avisa.
  if (estado.seFue) {
    ctxAvisar(tabId, "Denuncias RS: la pestaña salió de la página del formulario, así que dejé de rellenar " +
      "(no se capturó comprobante ni se envió nada). Vuelve al formulario y pulsa Rellenar otra vez.", true);
    return;
  }
  if (cortado || estado.cancelar) return; // pestaña cerrada, o lo paró el usuario / otra denuncia

  // BLINDAJE ANTI FORMULARIO EN BLANCO: si no se rellenó nada, `faltan` puede venir vacío
  // (la pasada ni siquiera devolvió resultado). Se marca a mano para que finalizarEnvio
  // —que SOLO envía con `faltan` vacío— jamás mande un formulario vacío.
  if (!relleno && !ultimoFaltan.length) ultimoFaltan = ["el formulario nunca llegó a mostrarse"];

  // A partir de aquí, exactamente lo mismo que hace hoy el flujo NO progresivo.
  try {
    if (opts.autoenviar) {
      await finalizarEnvio(tabId, opts.marca || "", opts.enviarLabel, ultimoFaltan);
    } else {
      await activarPestana(tabId);
      await guardarComprobante(tabId);
      ctxAvisar(tabId, relleno
        ? "Denuncias RS: comprobante capturado. Resuelve el captcha y pulsa Enviar."
        : "Denuncias RS: la página no llegó a mostrar el formulario en 3 minutos. El comprobante se guardó igual; revísala y rellena a mano.",
        !relleno);
    }
  } catch (e) { /* sin comprobante: el usuario tiene el botón 📸 */ }
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
//  ENVÍO AUTOMÁTICO de formularios web. Tras rellenar, en las redes SIN captcha
//  (Facebook/Instagram/WhatsApp/TikTok) la extensión trae la pestaña al frente, captura el
//  comprobante, muestra una cuenta atrás de 5 s (cancelable) y pulsa "Enviar" por el usuario.
//  En las redes con captcha (X/YouTube/LinkedIn) NO se envía: solo se captura y se avisa.
// ============================================================================
// "Google" = formulario de publicidad maliciosa (support.google.com/ads/troubleshooter):
// no lleva captcha, así que se captura el comprobante y se envía solo.
const REDES_AUTOENVIO = ["Facebook", "Instagram", "WhatsApp", "TikTok", "Google"];
function permiteAutoenvio(form) { return !!form && REDES_AUTOENVIO.indexOf(form.red) >= 0; }
const ENVIAR_LABEL_DEFECTO = "enviar|enviar denuncia|enviar informe|enviar reporte|submit|send|send report|send feedback";

// Trae la pestaña del formulario al frente (durante el relleno estuvo en 2.º plano) para que
// el usuario VEA la cuenta atrás / el captcha y pueda actuar. Falla en silencio si no puede.
async function activarPestana(tabId) {
  try {
    const tb = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tb && tb.windowId != null) await chrome.windows.update(tb.windowId, { focused: true });
  } catch (e) { /* la pestaña pudo cerrarse; seguimos igual */ }
}

// Reduce una imagen dataURL (jpeg) a `maxW` de ancho con OffscreenCanvas (disponible en el
// service worker). Devuelve un dataURL más liviano o el original si algo falla.
async function redimensionarSW(dataUrl, maxW, calidad) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    let w = bmp.width, h = bmp.height;
    if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
    const canvas = new OffscreenCanvas(w, h);
    const cx = canvas.getContext("2d");
    cx.drawImage(bmp, 0, 0, w, h);
    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: calidad || 0.7 });
    const buf = new Uint8Array(await outBlob.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return "data:image/jpeg;base64," + btoa(bin);
  } catch (e) { return dataUrl; }
}

// Captura el formulario y lo adjunta (comprobante_img) a la denuncia en curso
// (ultima_denuncia_registro), igual que el botón "Capturar" del popup. Devuelve bool.
async function guardarComprobante(tabId) {
  try {
    const cap = await capturarCompleta(tabId);
    if (!cap || cap.error || !cap.dataUrl) return false;
    const img = await redimensionarSW(cap.dataUrl, 1280, 0.7);
    const g = await chrome.storage.local.get(["ultima_denuncia_registro", "denuncias_registro"]);
    const idDest = g.ultima_denuncia_registro;
    const lista = Array.isArray(g.denuncias_registro) ? g.denuncias_registro : [];
    const ent = lista.find((x) => String(x.id) === String(idDest));
    if (!ent) return false;
    ent.comprobante_img = img;
    await chrome.storage.local.set({ denuncias_registro: lista });
    return true;
  } catch (e) { return false; }
}

// Se INYECTA en la página (función autónoma, no usa nada externo): muestra una cuenta atrás
// con botones "Cancelar" y "Enviar ahora". Devuelve una promesa que resuelve {cancelado:bool}.
function overlayEnvio(segundos, titulo) {
  return new Promise((resolve) => {
    try {
      const idc = "rs_overlay_envio";
      const viejo = document.getElementById(idc); if (viejo) viejo.remove();
      const cont = document.createElement("div"); cont.id = idc;
      cont.style.cssText = "position:fixed;z-index:2147483647;right:18px;bottom:18px;max-width:360px;" +
        "padding:16px 18px;border-radius:12px;font:600 14px system-ui,Arial,sans-serif;color:#fff;" +
        "background:#1e824c;box-shadow:0 8px 30px rgba(0,0,0,.35);";
      const t = document.createElement("div"); t.textContent = titulo || "Enviando la denuncia…"; t.style.marginBottom = "10px";
      const c = document.createElement("div"); c.style.cssText = "font-weight:400;margin-bottom:12px;line-height:1.35;";
      const fila = document.createElement("div"); fila.style.cssText = "display:flex;gap:8px;";
      const bCancel = document.createElement("button"); bCancel.textContent = "Cancelar";
      bCancel.style.cssText = "flex:1;padding:8px;border:0;border-radius:8px;background:#c0392b;color:#fff;font-weight:700;cursor:pointer;";
      const bYa = document.createElement("button"); bYa.textContent = "Enviar ahora";
      bYa.style.cssText = "flex:1;padding:8px;border:0;border-radius:8px;background:#145a32;color:#fff;font-weight:700;cursor:pointer;";
      fila.appendChild(bCancel); fila.appendChild(bYa);
      cont.appendChild(t); cont.appendChild(c); cont.appendChild(fila);
      document.body.appendChild(cont);
      let queda = segundos, terminado = false;
      const fin = (cancelado) => { if (terminado) return; terminado = true; clearInterval(iv); try { cont.remove(); } catch (e) {} resolve({ cancelado: cancelado }); };
      const pinta = () => { c.textContent = "Se enviará en " + queda + " s. Pulsa Cancelar para revisarlo y enviarlo tú."; };
      pinta();
      const iv = setInterval(() => { queda--; if (queda <= 0) fin(false); else pinta(); }, 1000);
      bCancel.onclick = () => fin(true);
      bYa.onclick = () => fin(false);
    } catch (e) { resolve({ cancelado: false }); }
  });
}

// Expresión (string) que localiza el BOTÓN de envío por su texto visible, excluyendo botones
// intermedios (siguiente/continuar/cancelar/adjuntar). Devuelve las coordenadas de su centro
// o null. Se elige el ÚLTIMO que coincide (el botón de envío suele ir al final del formulario).
function exprCoordsEnviar(labelRegexSrc) {
  return "(function(){" +
    "var norm=function(s){return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();};" +
    "var ok=new RegExp(" + JSON.stringify(labelRegexSrc) + ");" +
    "var no=/(siguiente|next|continuar|continue|cancel|cancelar|atras|back|volver|adjuntar|upload|examinar|browse|guardar borrador|save draft|anadir|add)/;" +
    "var els=Array.prototype.slice.call(document.querySelectorAll('button,input[type=submit],input[type=button],[role=button],a[role=button]'));" +
    "var cand=null;" +
    "for(var i=0;i<els.length;i++){var e=els[i];" +
      "if(e.disabled) continue;" +
      "var ar=e.getAttribute&&e.getAttribute('aria-disabled'); if(ar==='true') continue;" +
      "var txt=norm(e.innerText||e.value||(e.getAttribute&&e.getAttribute('aria-label'))||'');" +
      "if(!txt||!ok.test(txt)||no.test(txt)) continue;" +
      "var r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;" +
      "cand=e;" +
    "}" +
    "if(!cand) return null;" +
    "try{cand.scrollIntoView({block:'center'});}catch(x){}" +
    "var r2=cand.getBoundingClientRect();" +
    "return {x:Math.round(r2.left+r2.width/2), y:Math.round(r2.top+r2.height/2)};})()";
}

// Clic REAL (de confianza, vía debugger) sobre el botón de envío. React exige clics reales.
async function clicRealEnviar(tabId, labelRegexSrc) {
  let attached = false;
  try {
    await attach(tabId); attached = true;
    await cmd(tabId, "Runtime.enable").catch(() => {});
    const r = await cmd(tabId, "Runtime.evaluate", { expression: exprCoordsEnviar(labelRegexSrc), returnByValue: true });
    const c = r && r.result && r.result.value;
    if (!c) return false;
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
    await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
    return true;
  } catch (e) { return false; }
  finally { if (attached) await detach(tabId); }
}

// FLUJO DE ENVÍO: activar pestaña -> capturar comprobante -> cuenta atrás 5 s -> clic Enviar.
async function enviarFormulario(tabId, marca, enviarLabel) {
  try {
    await activarPestana(tabId);
    await guardarComprobante(tabId); // el comprobante queda en el Registro antes de enviar
    let cancelado = false;
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId }, func: overlayEnvio, args: [5, "Denuncias RS: enviando la denuncia de «" + marca + "»"] });
      cancelado = !!(r && r[0] && r[0].result && r[0].result.cancelado);
    } catch (e) { cancelado = false; }
    if (cancelado) { ctxAvisar(tabId, "Denuncias RS: envío cancelado. Revísalo y pulsa Enviar cuando quieras (el comprobante ya se guardó).", false); return; }
    const ok = await clicRealEnviar(tabId, enviarLabel || ENVIAR_LABEL_DEFECTO);
    ctxAvisar(tabId, ok
      ? "Denuncias RS: denuncia enviada. El comprobante quedó guardado en el Registro."
      : "Denuncias RS: no encontré el botón «Enviar». Revisa y envíalo tú (el comprobante ya se guardó).", !ok);
  } catch (e) { /* si algo falla, el usuario envía a mano */ }
}

// Formulario NO progresivo ya rellenado: si faltan campos requeridos, avisa; si no, envía.
async function finalizarEnvio(tabId, marca, enviarLabel, faltan) {
  if (faltan && faltan.length) {
    // SIEMPRE se captura el comprobante, aunque falten campos: la captura es la prueba de
    // la denuncia y el usuario la necesita igual (antes esto se salía sin capturar, y como
    // casi siempre falta algún campo, parecía que la extensión había dejado de capturar).
    await activarPestana(tabId);
    await guardarComprobante(tabId);
    ctxAvisar(tabId, "Denuncias RS: para «" + marca + "» faltan datos (" + faltan.join(", ") +
      "). Complétalos y pulsa Enviar tú. El comprobante ya se capturó.", true);
    return;
  }
  await enviarFormulario(tabId, marca, enviarLabel);
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
    if (tabId && Array.isArray(msg.pasos)) autorelleno(tabId, msg.pasos, { autoenviar: !!msg.autoenviar, marca: msg.marca, enviarLabel: msg.enviarLabel }); // bucle en segundo plano; envía al completar si procede
    sendResponse({ ok: true });
    return; // no necesitamos mantener el canal abierto
  }
  if (msg && msg.accion === "insistirRelleno") {
    // La 1.ª pasada del popup no reconoció NINGÚN campo (Meta · Derechos de autor suele
    // tardar en pintar el formulario, o lo mete en un iframe). El service worker reintenta
    // solo hasta 3 min: el usuario NO tiene que volver a pulsar Rellenar.
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    // `urlForm` ANCLA el bucle a la página del formulario: sin ella el bucle escribiría en
    // lo que la pestaña muestre en ese momento (p. ej. el login al que redirige Meta).
    if (tabId && Array.isArray(msg.pasos)) insistirRelleno(tabId, msg.pasos, { autoenviar: !!msg.autoenviar, marca: msg.marca, enviarLabel: msg.enviarLabel, urlForm: msg.urlForm || "" });
    sendResponse({ ok: true });
    return; // no necesitamos mantener el canal abierto
  }
  if (msg && msg.accion === "finalizar") {
    // Formulario NO progresivo ya rellenado: en redes sin captcha, captura + envía solo;
    // en las de captcha, captura + avisa. Corre en el service worker (sobrevive a cerrar el popup).
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) {
      (async () => {
        if (msg.autoenviar) await finalizarEnvio(tabId, msg.marca || "", msg.enviarLabel, msg.faltan || []);
        else { await activarPestana(tabId); await guardarComprobante(tabId); ctxAvisar(tabId, "Denuncias RS: comprobante capturado. Resuelve el captcha y pulsa Enviar.", false); }
      })().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true; // respuesta asíncrona
    }
    return;
  }
  if (msg && msg.accion === "detenerAutorelleno") {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId && AUTORRELLENO[tabId]) AUTORRELLENO[tabId].cancelar = true;
    return;
  }
  // El popup abrió/rellenó una denuncia en esta pestaña: queda MARCADA como pestaña de
  // denuncia para que el botón "📸 Capturar comprobante" se vea aquí (y siga viéndose
  // al avanzar el formulario, que recarga la página). Ver marcarPestanaDeDenuncia.
  // El popup pregunta si esta PC/navegador tiene la última versión (y fuerza la
  // comprobación al abrirse, para no esperar a la ronda de cada hora).
  if (msg && msg.accion === "comprobarActualizacion") {
    comprobarActualizacion("popup").then(
      () => chrome.storage.local.get("estado_version").then((g) => sendResponse(g.estado_version || null)),
      () => sendResponse(null));
    return true; // respuesta asíncrona
  }
  if (msg && msg.accion === "activarCaptura") {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (tabId) marcarPestanaDeDenuncia(tabId);
    sendResponse({ ok: true });
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
const CLAVE_URLS_MANUALES_CTX = "urls_manuales"; // las 1-2 URLs escritas a mano en el popup
const RS_CONTEXTS = ["page", "frame", "selection", "link", "image", "editable"];
const rsEnc = (s) => encodeURIComponent(String(s)); // marca -> id de menú (nunca lleva '|')
const rsDec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

// Limpia una lista de correos EXACTAMENTE igual que ⚙ Marcas (depurar_lista_de_correos de
// opciones.js) y que depurar_correos_de_marca del popup: parte los pegados con coma o punto
// y coma, quita los caracteres de control (un "\r\n" en el remitente permitiría colar
// cabeceras de correo), recorta, tira los vacíos y quita los repetidos SIN distinguir
// mayúsculas conservando el PRIMERO (para no cambiar cuál es el principal).
function ctxDepurarCorreosDeMarca(lista) {
  const vistos = new Set();   // Set y no objeto: un correo "__proto__" no debe romper nada
  const limpia = [];
  (lista || []).forEach((crudo) => {
    String(crudo == null ? "" : crudo).split(/[,;]+/).forEach((trozo) => {
      const texto = trozo.replace(/[\x00-\x1f\x7f]/g, "").trim();
      if (!texto) return;
      const llave = texto.toLowerCase();
      if (vistos.has(llave)) return;
      vistos.add(llave);
      limpia.push(texto);
    });
  });
  return limpia;
}

// Deja `correos` (array con TODOS, el 1.º el principal) y `correo` (string) coherentes.
// Si `correos` NO EXISTE se deriva partiendo `correo` por comas (MARCAS_BASE y las marcas
// guardadas antes de que se creara el campo). Si EXISTE manda ella aunque esté vacía:
// vacía = el usuario borró todos los correos en ⚙ Marcas, y entonces tampoco se hereda el
// `correo` de la base (si no, el menú del clic derecho seguiría usando un correo borrado).
// El principal es SIEMPRE el primero de la lista, la misma regla que ⚙ Marcas (insignia
// «Principal») y que normalizar_correos_de_marca() del popup: si cada parte lo decidiera
// a su manera, la denuncia se firmaría con un correo distinto del que enseña el panel.
function ctxNormalizarCorreosDeMarca(o) {
  o.correos = ctxDepurarCorreosDeMarca(Array.isArray(o.correos) ? o.correos : [o.correo]);
  o.correo = o.correos[0] || "";
  return o;
}

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
    Object.keys(g).forEach((k) => {
      if (PELIGROSA(k)) return;
      // `correos` es una LISTA que el usuario puede DEJAR VACÍA en ⚙ Marcas: si el campo
      // está guardado se respeta tal cual. Con la regla general ("lo vacío no pisa") un
      // correo borrado reaparecía y el menú del clic derecho lo volvía a usar.
      if (k === "correos") { o.correos = g[k]; return; }
      if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k];
    });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  Object.keys(todas).forEach((m) => { todas[m] = ctxNormalizarCorreosDeMarca(Object.assign({}, todas[m])); });
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
    // Sitio del formulario, p.ej. tiktok.com. OJO al añadir formularios: si alguno llegara
    // a estar en un dominio de DOS niveles (algo.com.mx, algo.co.uk), este slice(-2) daría
    // "com.mx" y valdría CUALQUIER web de ese país -> habría que tratarlo aparte.
    // Hoy todos los formularios son .com planos (facebook, instagram, meta, tiktok,
    // google, linkedin, github, x), así que la raíz de dos etiquetas es correcta.
    const raiz = fh.split(".").slice(-2).join(".");
    // La pestaña tiene que SER ese sitio o un subdominio suyo. Antes se comparaba por
    // subcadena (y en los dos sentidos), y así colaban webs falsas como
    // "instagram.com.tienda-falsa.ru", "notfacebook.com" o "facebook.com.cdn-x.io":
    // la extensión creía estar en el formulario bueno y escribía en ESA página los datos
    // de la marca (correo, teléfono, país, perfiles oficiales, N.º de registro). Y es el
    // caso normal, porque el usuario suele estar en la web que va a denunciar.
    if (host !== raiz && !host.endsWith("." + raiz)) return;
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
  // "Enviado a" (columna del Registro): el sitio concreto del enlace denunciado.
  const destino = (self.CORREOS_DENUNCIA && urlDen) ? self.CORREOS_DENUNCIA.dominio_de(urlDen) : "";
  const VENTANA = 60 * 1000, ahora = Date.now();
  const existente = lista.find((d) =>
    d.estado === "pendiente" && d.marca === marca && d.plataforma === plataforma &&
    d.categoria === categoria && (ahora - new Date(d.fecha).getTime()) < VENTANA);
  if (existente) {
    if (urlDen && !existente.url_denunciada) existente.url_denunciada = urlDen; // guarda el enlace clicado
    if (destino && !existente.destino) existente.destino = destino;
    await chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: existente.id });
    return existente.id;
  }
  const consecutivo = lista.filter((d) => d.marca === marca)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({ id, marca, plataforma, tipo, categoria, destino, url_denunciada: urlDen || "", numero_caso: "",
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
  // El service worker se duerme y al despertar solo tiene los formularios de fábrica:
  // si la denuncia es de una plataforma creada por el usuario, hay que recargarla.
  if (!self.FORMULARIOS[formKey]) await ctxCargarPlataformasDeUsuario();
  const form = self.FORMULARIOS[formKey];
  const MARCAS = await ctxObtenerMarcas();
  const datos = MARCAS[marca];
  if (!form || !datos) return null;
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  const esCorreo = form.tipo === "email";
  // Toda descripción lleva: justificación + política infringida + PERFIL OFICIAL de la
  // marca en la red que se está denunciando (para que la plataforma sepa cuál es la
  // cuenta auténtica). Ver JUSTIF.conPerfilOficial.
  const lang = esCorreo ? "en" : "es";
  const justif = self.JUSTIF.conPerfilOficial(
    self.JUSTIF.conPolitica(self.JUSTIF.justificacion(form.cat, redCode, marca, pais, lang), formKey, lang),
    form.red, marca, datos, lang);
  const justif_es = self.JUSTIF.conPerfilOficial(
    self.JUSTIF.conPolitica(self.JUSTIF.justificacion(form.cat, redCode, marca, pais, "es"), formKey, "es"),
    form.red, marca, datos, "es");
  const g = await chrome.storage.local.get([CLAVE_URLS_CTX, CLAVE_URLS_MANUALES_CTX]);
  const urlsExcel = Array.isArray(g[CLAVE_URLS_CTX]) ? g[CLAVE_URLS_CTX] : [];
  const urlsManuales = Array.isArray(g[CLAVE_URLS_MANUALES_CTX]) ? g[CLAVE_URLS_MANUALES_CTX] : [];
  // Prioridad: 1) clic derecho SOBRE un enlace (o imagen/selección con URL) — ese enlace
  // es el que se denuncia; 2) las URLs escritas a mano en el popup; 3) la lista del Excel.
  const urls = (Array.isArray(urlsOverride) && urlsOverride.length) ? urlsOverride
             : (urlsManuales.length ? urlsManuales : urlsExcel);
  const ctx = { marca, datos, justif, justif_es, correoPersona: self.CORREO_PERSONA, urls };
  return { ctx, form, datos };
}

// ¿Tenemos permiso de Chrome para escribir en el sitio de ESE formulario? Sin él,
// executeScript falla con "Cannot access contents of the page..." y no se rellena nada.
// Desde el service worker NO se puede PEDIR el permiso (Chrome exige un gesto del
// usuario en una página), así que aquí solo se comprueba: si falta, se avisa y se
// manda al popup, que sí puede pedirlo.
async function ctxHayPermisoPara(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    return await chrome.permissions.contains({ origins: [u.origin + "/*"] });
  } catch (e) { return true; }   // ante la duda, que lo intente
}

// El REMITENTE (datos.correo) es el correo de contacto que va en el formulario y el "De:"
// del correo de denuncia. Desde que una marca puede quedarse SIN correos (se borran todos
// en ⚙ Marcas) esto podía salir vacío y la denuncia se iba sin forma de contactar a quien
// denuncia, sin avisar. Devuelve true si falta (y entonces NO se denuncia).
// La comprobación se hace SIEMPRE, haya o no pestaña donde pintar el aviso: en
// chrome.contextMenus.onClicked el parámetro `tab` es OPCIONAL, y cuando llega vacío una
// guardia condicionada a él se saltaba entera y el correo salía igual, sin remitente.
// Lo único que depende de la pestaña es el aviso.
function ctxFaltaElCorreo(tabId, marca, datos) {
  if (String((datos || {}).correo || "").trim()) return false;
  if (tabId) {
    ctxAvisar(tabId, "Denuncias RS: la marca «" + marca + "» no tiene correo desde el que denunciar. " +
      "Agrégalo en ⚙ Marcas (o con el botón + del popup) y vuelve a intentarlo.", true);
  }
  return true;
}

// ============================================================================
//  BOTÓN FLOTANTE "📸 Capturar comprobante": pestañas de DENUNCIA
//  El botón NO debe salir mientras uno solo navega por la red social, pero SÍ
//  durante toda la denuncia (es la prueba de que se hizo). Por eso la pestaña
//  donde se abre/rellena un formulario queda MARCADA: se le avisa al content
//  script ahora y CADA VEZ que esa pestaña termine de cargar, porque el
//  formulario navega entre pasos y cada carga reinyecta el content script (que
//  arranca oculto). La marca vive en storage.session para sobrevivir a que el
//  service worker se duerma, y se borra al cerrar la pestaña.
// ============================================================================
const CLAVE_PESTANAS_DENUNCIA = "pestanas_de_denuncia";

async function pestanasDeDenuncia() {
  try {
    const g = await chrome.storage.session.get([CLAVE_PESTANAS_DENUNCIA]);
    return Array.isArray(g[CLAVE_PESTANAS_DENUNCIA]) ? g[CLAVE_PESTANAS_DENUNCIA] : [];
  } catch (e) { return []; }
}

// Avisa al content script de una pestaña de que la extensión se ha ACTIVADO ahí, para que
// muestre el botón flotante de capturar comprobante. Silencioso si la página no lo tiene.
// Se reintenta un par de veces: si la página acaba de cargar, el content script puede
// tardar un instante en registrar su listener (run_at: document_idle).
function activarBotonCaptura(tabId, intentos) {
  const quedan = (typeof intentos === "number") ? intentos : 3;
  try {
    chrome.tabs.sendMessage(tabId, { accion: "activarBotonCaptura" }, () => {
      const err = chrome.runtime.lastError; // aún sin content script escuchando
      if (err && quedan > 0) setTimeout(() => activarBotonCaptura(tabId, quedan - 1), 700);
    });
  } catch (e) { /* la pestaña no admite content scripts */ }
}

// Marca la pestaña como "pestaña de denuncia" y muestra ya el botón en ella.
async function marcarPestanaDeDenuncia(tabId) {
  if (!tabId) return;
  activarBotonCaptura(tabId);
  try {
    const lista = await pestanasDeDenuncia();
    if (lista.indexOf(tabId) < 0) {
      lista.push(tabId);
      await chrome.storage.session.set({ [CLAVE_PESTANAS_DENUNCIA]: lista });
    }
  } catch (e) { /* sin storage.session: el botón igual se activó arriba */ }
}

// Cada vez que una pestaña MARCADA termina de cargar (el formulario avanza de paso,
// se recarga o se navega dentro del asistente), se vuelve a mostrar el botón.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  pestanasDeDenuncia().then((lista) => {
    if (lista.indexOf(tabId) >= 0) activarBotonCaptura(tabId);
  });
});

// Al cerrar la pestaña se olvida (los ids de pestaña se reutilizan).
chrome.tabs.onRemoved.addListener((tabId) => {
  pestanasDeDenuncia().then((lista) => {
    const i = lista.indexOf(tabId);
    if (i < 0) return;
    lista.splice(i, 1);
    try { chrome.storage.session.set({ [CLAVE_PESTANAS_DENUNCIA]: lista }); } catch (e) {}
  });
});

// Ejecuta un plan (APLICAR + clics reales + autorrelleno persistente) en una pestaña.
// Si la marca no tiene PAÍS (campo obligatorio en los formularios de Meta y compañía) se
// avisa y no se sigue: sin él el formulario no deja avanzar y el usuario se queda con un
// "This field is required" sin explicación.
// `urlEsperada` es la página en la que TIENE que estar la pestaña para rellenar. Por
// defecto es la del plan (la que la extensión acaba de abrir); "Rellenar ESTA página"
// pasa la URL que el usuario tenía y que ctxDetectarForm ya validó, porque ahí el
// formulario bueno puede estar en otra ruta del mismo sitio.
async function ctxEjecutarPlan(tabId, plan, marca, form, datos, urlEsperada) {
  // ANCLA A LA PÁGINA DEL FORMULARIO (misma razón que en insistirRelleno).
  // Hasta aquí se abría la pestaña, se esperaba a "complete" + 1,8 s y se inyectaba el
  // plan SIN mirar en qué URL había acabado. Si Meta redirige al LOGIN, el paso
  // fillLabel «correo electronico|email address» casa con "Correo electrónico o número
  // de teléfono" de esa pantalla: se escribiría ahí el correo de la marca, se le darían
  // clics reales con el depurador y se guardaría esa pantalla como comprobante de la
  // denuncia. Si la pestaña no está donde debe: se avisa y no se toca NADA.
  const urlDeReferencia = urlEsperada || (plan && plan.url) || "";
  if (urlDeReferencia) {
    let t = null;
    try { t = await chrome.tabs.get(tabId); } catch (e) { return; } // pestaña cerrada
    if (!t || !mismaPaginaDelFormulario(t.url || "", urlDeReferencia)) {
      ctxAvisar(tabId, "Denuncias RS: la página no es el formulario (puede que te haya mandado a iniciar sesión), " +
        "así que NO se rellenó nada ni se capturó comprobante. Inicia sesión, vuelve al formulario y repite.", true);
      return;
    }
  }
  // Denunciar en esta pestaña = activar la extensión aquí: se muestra el botón flotante
  // de capturar comprobante (que por defecto está oculto mientras solo se navega) y la
  // pestaña queda marcada para que el botón siga visible al avanzar el formulario.
  marcarPestanaDeDenuncia(tabId);
  if (datos && !(datos.pais || "").trim() && form && form.tipo !== "email") {
    ctxAvisar(tabId, "Denuncias RS: la marca «" + marca + "» no tiene PAÍS configurado y el formulario lo exige. " +
      "Ábrela en Marcas (⚙ Opciones), escribe el país y vuelve a intentarlo.", true);
    return;
  }
  // {informe:true}: guarda también el paso a paso para el botón "📋 Copiar informe"
  // del popup, igual que cuando se rellena desde ahí (aquí se llega por el clic derecho).
  const r = await chrome.scripting.executeScript({ target: { tabId }, func: APLICAR, args: [plan.pasos, { informe: true }] });
  const res = (r && r[0] && r[0].result) || { ok: 0, faltan: [], clicsReales: [] };
  try {
    const inf = res.informe || {};
    chrome.storage.local.set({ ultimo_informe: {
      fecha: new Date().toLocaleString(), version: chrome.runtime.getManifest().version,
      form: (form.red || "") + " · " + (form.nombre || "") + " (clic derecho)", marca: marca,
      ok: res.ok, faltan: res.faltan || [], pasos: inf.pasos || [], inventario: inf.inventario || null
    } });
  } catch (e) { /* el informe es solo ayuda */ }
  if (res.clicsReales && res.clicsReales.length) { try { await hacerClics(tabId, res.clicsReales); } catch (e) {} }
  const autoenv = permiteAutoenvio(form);
  if (plan.autorepetir) {
    autorelleno(tabId, plan.pasos.filter((p) => p.tipo !== "dropdown"), { autoenviar: autoenv, marca: marca, enviarLabel: plan.enviarLabel });
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». " +
      (autoenv ? "Cuando el formulario quede completo se capturará y enviará solo (5 s para cancelar)." : "Resuelve el captcha y envíalo tú."), false);
    return;
  }
  if (autoenv) {
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». Capturando y enviando (5 s para cancelar)…", false);
    await finalizarEnvio(tabId, marca, plan.enviarLabel, res.faltan);
  } else {
    await activarPestana(tabId);
    await guardarComprobante(tabId);
    ctxAvisar(tabId, "Denuncias RS: " + res.ok + " campo(s) para «" + marca + "». Comprobante capturado. Resuelve el captcha y pulsa Enviar.", false);
  }
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
  if (ctxFaltaElCorreo(tab.id, marca, a.datos)) return;
  await ctxRegistrarDenuncia(marca, a.form, (objetivo && objetivo[0]) || "");
  // La referencia es la URL que el usuario TENÍA (la que ctxDetectarForm reconoció como
  // formulario), no la del plan: Meta sirve el mismo formulario en dos direcciones
  // distintas, y aquí el usuario ya estaba en una de ellas. Aun así se comprueba, para
  // cortar si la página se fue al login entre el clic del menú y la inyección.
  try { await ctxEjecutarPlan(tab.id, a.form.construirPlan(a.ctx), marca, a.form, a.datos, tab.url || ""); }
  catch (e) { ctxAvisar(tab.id, "Denuncias RS: no se pudo rellenar aquí (" + (e.message || e) + ").", true); }
}

// Abre la denuncia elegida con esa marca: los formularios WEB en una pestaña NUEVA (no
// pierdes la página actual) y los rellena; los de CORREO generan el borrador (correo.html).
async function ctxAbrirDenuncia(tabOrigen, marca, formKey, objetivo) {
  const a = await ctxArmar(marca, formKey, objetivo);
  if (!a) { if (tabOrigen && tabOrigen.id) ctxAvisar(tabOrigen.id, "Denuncias RS: no encuentro la marca «" + marca + "».", true); return; }
  if (ctxFaltaElCorreo(tabOrigen && tabOrigen.id, marca, a.datos)) return;
  const form = a.form, ctx = a.ctx, datos = a.datos;
  const urlDen = (objetivo && objetivo[0]) || "";
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    const idDen = await ctxRegistrarDenuncia(marca, form, urlDen);
    await ctxGuardarCorreo(idDen, em);
    // red/cat/urls viajan para la MEMORIA DE CORREOS (ver datos/correos_denuncia.js).
    await chrome.storage.local.set({ email_reporte: Object.assign({}, em, {
      from: datos.correo || "", red: form.red || "", cat: form.cat || "",
      urls: (ctx.urls || []).concat(urlDen && (ctx.urls || []).indexOf(urlDen) < 0 ? [urlDen] : [])
    }) });
    chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    return;
  }
  const plan = form.construirPlan(ctx);
  // Sin permiso sobre ese sitio no se puede rellenar: se abre igual el formulario (para
  // no perder el viaje) pero se dice CLARO qué hay que hacer, en vez de dejar la página
  // en blanco sin explicación.
  const hayPermiso = await ctxHayPermisoPara(plan.url);
  if (!hayPermiso) {
    try { await chrome.tabs.create({ url: plan.url, active: true }); } catch (e) {}
    if (tabOrigen && tabOrigen.id) {
      ctxAvisar(tabOrigen.id, "Denuncias RS: falta el permiso de Chrome para escribir en " +
        (new URL(plan.url).host) + ". Abre la extensión en esa pestaña y pulsa «Rellenar formulario» una vez: " +
        "Chrome te lo pedirá y ya queda dado para siempre.", true);
    }
    return;
  }
  await ctxRegistrarDenuncia(marca, form, urlDen);
  let nueva;
  // active:false: abre la denuncia en una pestaña APARTE en segundo plano para NO sacar
  // al usuario de la pestaña que está viendo. El autorrelleno funciona igual (usa nueva.id).
  try { nueva = await chrome.tabs.create({ url: plan.url, active: false }); } catch (e) { return; }
  await ctxEsperarCarga(nueva.id);
  await dormir(1800); // deja aparecer los campos
  try { await ctxEjecutarPlan(nueva.id, plan, marca, form, datos); }
  catch (e) { /* la pestaña abrió; el usuario puede rellenar con el clic derecho de nuevo */ }
}

// ============================================================================
//  MENÚ DEL CLIC DERECHO: 🚩 Denuncias RS ▸ [marca] ▸ [red] ▸ [formulario]
//
//  POR QUÉ ESTÁ ESCRITO ASÍ (bug recurrente: "solo salen 2 marcas"):
//  el menú completo son ~64 items POR MARCA (marca + rellenar + separador + 17 redes
//  + 44 formularios). Con 20 marcas eso pasa de 1.200 items y el navegador deja de
//  crearlos. Antes TODO el bucle estaba dentro de un solo try/catch, así que el
//  PRIMER item que fallaba abortaba el bucle entero y se perdían todas las marcas que
//  faltaban por recorrer: por eso sobrevivían solo las primeras del alfabeto.
//
//  Ahora se construye en DOS PASADAS:
//   · Pasada 1 (garantizada): root + por cada marca su nodo, "✍ Rellenar ESTA página"
//     y el separador. Son ~3 items por marca (~61 en total). Al acabar esta pasada
//     TODAS las marcas ya están visibles y se pueden usar.
//   · Pasada 2: TODAS las redes con TODOS sus formularios, recorriendo EN ANCHURA
//     (bucle externo por RED, interno por MARCA), de principio a fin y SIN cortarse.
//     La anchura importa por si algún navegador se plantara a mitad: el reparto queda
//     parejo entre marcas en vez de dejar completas las primeras y vacías las últimas.
//
//  REGLA QUE MANDA SOBRE TODO LO DEMÁS: aquí no se borra ni se descarta NADA.
//  Se intentan crear SIEMPRE los 1.281 items del menú completo (con 20 marcas), uno por
//  uno, hasta el final. Un item que falle se cuenta y se anota en el diagnóstico, pero
//  NO hace que se retire nada ya creado ni que se deje de intentar lo que viene después.
//
//  MEDIDO EN CHROME REAL (2026-08-12) — por eso el código es tan simple:
//   · chrome.contextMenus no tiene límite práctico: 20.000 items, 0 fallos, ~3 s.
//   · El caso real (1.281 items) se crea entero en 0,3 s, sin un solo fallo.
//   · create() NUNCA lanza excepción: los errores (id duplicado, padre inexistente,
//     title vacío…) llegan SOLO por chrome.runtime.lastError.
//   · Tras un error, create() SIGUE funcionando: en un bucle de 200 items con el 3.º
//     fallando, los otros 199 se crean sin problema. Por eso abortar sería absurdo:
//     solo serviría para perder todo lo que venía detrás.
//  El try/catch de ctxCrearItemDeMenu se queda igualmente como red de seguridad barata,
//  por si otro Chromium (Edge, Brave, Opera) se comporta distinto.
// ============================================================================

// ---- FRENO ANTIBUCLE. NO ES UNA POLÍTICA DE "ESTO NO CABE" ----
// Único papel: cortar por lo sano si algún día los datos se descontrolan (una marca
// duplicada en bucle, un formulario que se multiplica) y la construcción se volviera
// interminable. Está MUY por encima de lo que el menú necesita de verdad (con 20 marcas,
// 17 redes y 44 formularios son 1.281 items) y de lo que aguanta el navegador (medido:
// 20.000 items sin un fallo), así que en uso normal NUNCA llega a actuar y NUNCA descarta
// contenido. Si algún día hiciera falta tocarlo, se cambia AQUÍ: es el único sitio donde
// vive el número. PROHIBIDO usarlo para dejar redes o reportes fuera del menú: si no
// cupieran, se rediseña o se pregunta al usuario, no se recorta por nuestra cuenta.
// Al cambiarlo, volver a pasar: python pruebas\probar_menu_contextual.py
const RS_MAXIMO_DE_ITEMS_DE_MENU = 20000;

// Cuántos ids fallidos se guardan en el diagnóstico. Con una muestra basta para saber QUÉ
// falló; guardarlos todos podría meter miles de cadenas en chrome.storage.local.
const RS_MAXIMO_DE_IDS_FALLIDOS = 20;

// Contadores de la construcción en curso; se vuelcan a chrome.storage.local para que el
// usuario/QA pueda ver el estado REAL del menú sin adivinar (clave diagnostico_menu_contextual).
let rsDiagnosticoMenu = { intentados: 0, creados: 0, fallidos: 0, primerError: "", idsFallidos: [] };

function ctxAnotarFalloDeMenu(id, mensaje) {
  rsDiagnosticoMenu.fallidos++;
  rsDiagnosticoMenu.creados--; // se había contado como creado de forma optimista
  const texto = String(mensaje || "desconocido");
  if (!rsDiagnosticoMenu.primerError) rsDiagnosticoMenu.primerError = texto;
  // Solo una muestra: qué items concretos fallaron, para poder investigarlo después.
  if (rsDiagnosticoMenu.idsFallidos.length < RS_MAXIMO_DE_IDS_FALLIDOS) {
    rsDiagnosticoMenu.idsFallidos.push(String(id) + " → " + texto);
  }
}

// Crea UN item de menú sin que un fallo pueda propagarse. Devuelve true/false.
// El error llega por chrome.runtime.lastError, y hay que LEERLO: si no, Chrome lo apunta
// como "error no comprobado" y ensucia la consola. El try/catch es red de seguridad: en
// Chrome create() no lanza nunca (medido), pero otro Chromium podría hacerlo.
function ctxCrearItemDeMenu(opciones) {
  rsDiagnosticoMenu.intentados++;
  try {
    chrome.contextMenus.create(opciones, () => {
      const err = chrome.runtime.lastError;
      if (err) ctxAnotarFalloDeMenu(opciones.id, err.message || err);
    });
    rsDiagnosticoMenu.creados++;
    return true;
  } catch (e) {
    ctxAnotarFalloDeMenu(opciones.id, e && e.message ? e.message : e);
    return false;
  }
}

// Los callbacks de create() son asíncronos: este respiro deja que lleguen los lastError
// pendientes antes de dar por cerrada una tanda y anotar el resultado.
const ctxEsperarCallbacksDeMenu = () => dormir(0);

// Mezcla en self.FORMULARIOS las plataformas que el usuario creó desde el popup
// (chrome.storage.local -> plataformas_usuario). Se llama ANTES de armar el menú y
// antes de preparar una denuncia, para que salgan igual que las de fábrica en el
// clic derecho. Las de fábrica nunca se pisan (lo garantiza formularios.js).
async function ctxCargarPlataformasDeUsuario() {
  try {
    if (typeof self.APLICAR_PLATAFORMAS_DE_USUARIO !== "function") return;
    const d = await chrome.storage.local.get(["plataformas_usuario"]);
    self.APLICAR_PLATAFORMAS_DE_USUARIO(d.plataformas_usuario || {});
  } catch (e) { /* sin ellas, el menú sale con las de fábrica */ }
}

async function ctxConstruirMenusUnaVez() {
  await ctxCargarPlataformasDeUsuario();
  rsDiagnosticoMenu = { intentados: 0, creados: 0, fallidos: 0, primerError: "", idsFallidos: [] };
  // redesConItemsRechazados: aquellas en las que el NAVEGADOR rechazó algún item. Es solo
  // información para el diagnóstico: la red se queda en el menú con lo que sí se creó.
  // frenoAntibucle: ver RS_MAXIMO_DE_ITEMS_DE_MENU.
  let marcas = [], redes = [], pasada2Completa = true, redesCreadas = 0;
  const redesConItemsRechazados = [];
  let frenoAntibucle = false;
  try {
    await new Promise((res) => chrome.contextMenus.removeAll(res));
    const base = { contexts: RS_CONTEXTS }; // sin documentUrlPatterns: aparece en TODA página
    ctxCrearItemDeMenu(Object.assign({ id: "rs_root", title: "🚩 Denuncias RS" }, base));
    const MARCAS = await ctxObtenerMarcas();
    marcas = Object.keys(MARCAS).sort((a, b) => a.localeCompare(b, "es"));
    // Formularios ordenados por "Red: Nombre" (se listan dentro de cada marca).
    const forms = Object.keys(self.FORMULARIOS).sort((a, b) =>
      (self.FORMULARIOS[a].red + ": " + self.FORMULARIOS[a].nombre)
        .localeCompare(self.FORMULARIOS[b].red + ": " + self.FORMULARIOS[b].nombre, "es"));
    // Lista de redes sociales presentes (ordenadas), para agrupar los formularios.
    forms.forEach((fk) => { const r = self.FORMULARIOS[fk].red; if (redes.indexOf(r) < 0) redes.push(r); });
    redes.sort((a, b) => a.localeCompare(b, "es"));

    // ---- PASADA 1: lo imprescindible de cada marca, y va PRIMERO. Nada la frena: si un
    // item falla se anota y se sigue con la marca siguiente, nunca se corta el bucle.
    // Al acabar aquí, las 20 marcas ya están en el menú pase lo que pase después.
    marcas.forEach((m) => {
      const pid = "rs_m|" + rsEnc(m);
      ctxCrearItemDeMenu(Object.assign({ id: pid, parentId: "rs_root", title: m }, base));
      ctxCrearItemDeMenu(Object.assign({ id: "rs_fill|" + rsEnc(m), parentId: pid, title: "✍ Rellenar ESTA página" }, base));
      ctxCrearItemDeMenu(Object.assign({ id: "rs_sep|" + rsEnc(m), parentId: pid, type: "separator" }, base));
    });
    await ctxEsperarCallbacksDeMenu();

    // ---- PASADA 2: TODAS las redes con TODOS sus formularios, para TODAS las marcas.
    // Se recorre entera SIEMPRE, de la primera red a la última y de la primera marca a la
    // última. Aquí no hay ni un `break` ni una sola línea que borre algo ya creado:
    //   · No se elige qué crear: se crea todo.
    //   · Un item que falle NO retira nada (ni su red, ni sus hermanos): quitar contenido
    //     bueno para que todas las marcas queden simétricas sería destruir lo que sí se
    //     pudo crear. Manda que el usuario tenga TODO lo que el navegador acepte.
    //   · Un item que falle NO corta el recorrido: create() sigue funcionando después de
    //     un error (medido), así que abortar solo perdería lo que viene detrás.
    // El fallo se cuenta, se guarda su id en el diagnóstico, y se sigue.
    // Se va EN ANCHURA (bucle externo por RED, interno por MARCA): si algún navegador se
    // plantara, el reparto quedaría parejo entre marcas en vez de vaciar las últimas.
    for (const red of redes) {
      // Freno ANTIBUCLE, no un "esto no cabe": ver RS_MAXIMO_DE_ITEMS_DE_MENU. En uso
      // normal no salta nunca (el menú completo son 1.281 items y el tope son 20.000).
      if (rsDiagnosticoMenu.creados >= RS_MAXIMO_DE_ITEMS_DE_MENU) { frenoAntibucle = true; break; }
      const fallidosAntes = rsDiagnosticoMenu.fallidos;
      const susForms = forms.filter((fk) => self.FORMULARIOS[fk].red === red);
      for (const m of marcas) {
        const rid = "rs_red|" + rsEnc(m) + "|" + rsEnc(red);
        ctxCrearItemDeMenu(Object.assign({ id: rid, parentId: "rs_m|" + rsEnc(m), title: red }, base));
        for (const fk of susForms) {
          const f = self.FORMULARIOS[fk];
          ctxCrearItemDeMenu(Object.assign({ id: "rs_open|" + rsEnc(m) + "|" + fk, parentId: rid, title: f.nombre }, base));
        }
      }
      await ctxEsperarCallbacksDeMenu(); // que lleguen los lastError de esta tanda
      // Solo para el informe: qué redes salieron limpias y en cuáles rechazó algo el
      // navegador. Ninguna de las dos ramas toca el menú.
      if (rsDiagnosticoMenu.fallidos > fallidosAntes) redesConItemsRechazados.push(red);
      else redesCreadas++;
    }
    // "Completa" = el navegador no rechazó ni un item. Nunca es falso por decisión propia.
    pasada2Completa = rsDiagnosticoMenu.fallidos === 0 && !frenoAntibucle;

    // El aviso SOLO si de verdad hubo items rechazados por el navegador (con 0 fallos no
    // aparece). Va en cada marca para que el usuario sepa POR QUÉ le faltaría algo ahí y a
    // dónde ir: el popup los tiene todos, siempre.
    if (!pasada2Completa) {
      marcas.forEach((m) => {
        ctxCrearItemDeMenu(Object.assign({
          id: "rs_aviso|" + rsEnc(m), parentId: "rs_m|" + rsEnc(m),
          title: "⚠ El navegador no admitió más: usa el popup", enabled: false
        }, base));
      });
      await ctxEsperarCallbacksDeMenu();
    }
  } catch (e) {
    // Nunca debería llegar aquí (cada item se crea a prueba de fallos), pero si pasa se anota.
    ctxAnotarFalloDeMenu("(construcción del menú)", e && e.message ? e.message : e);
    pasada2Completa = false;
  }
  try {
    await chrome.storage.local.set({ diagnostico_menu_contextual: {
      fecha: new Date().toLocaleString(),
      marcas: marcas.length,
      redes_totales: redes.length,
      redes_creadas: redesCreadas, // las que salieron sin que el navegador rechazara nada
      // Redes donde el navegador rechazó ALGÚN item. Siguen en el menú con lo que sí se
      // creó: no se borra nada. `borrados_por_decision_propia` es 0 fijo y está aquí a
      // propósito, como constancia de que el programa nunca quita contenido; si algún día
      // no fuera 0, sería un fallo que corregir, no una política.
      redes_con_items_rechazados: redesConItemsRechazados,
      borrados_por_decision_propia: 0,
      freno_antibucle: frenoAntibucle,
      items_intentados: rsDiagnosticoMenu.intentados,
      items_creados: rsDiagnosticoMenu.creados,
      items_fallidos: rsDiagnosticoMenu.fallidos,
      pasada2_completa: pasada2Completa,
      primer_error: rsDiagnosticoMenu.primerError,
      ids_fallidos: rsDiagnosticoMenu.idsFallidos, // muestra, tope RS_MAXIMO_DE_IDS_FALLIDOS
      maximo_de_items_antibucle: RS_MAXIMO_DE_ITEMS_DE_MENU
    } });
  } catch (e) { /* el diagnóstico es solo ayuda, no puede romper el menú */ }
}

// (Re)construye el menú al instalar/arrancar y al cambiar las marcas.
// Antes, si llegaba un cambio mientras se estaba construyendo, se DESCARTABA (`return`) y
// el menú se quedaba viejo: agregar una marca en ese momento no se veía hasta reiniciar.
// Ahora se encola: al terminar se vuelve a construir una vez más con los datos nuevos.
let rsConstruyendo = false;
let rsReconstruirPendiente = false;
async function ctxConstruirMenus() {
  if (rsConstruyendo) { rsReconstruirPendiente = true; return; }
  rsConstruyendo = true;
  try {
    do {
      rsReconstruirPendiente = false; // lo que llegue a partir de aquí obliga a otra vuelta
      await ctxConstruirMenusUnaVez();
    } while (rsReconstruirPendiente);
  } finally { rsConstruyendo = false; }
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
  // plataformas_usuario: al crear (o quitar) una plataforma desde el popup, el menú
  // del clic derecho se rehace para que aparezca (o desaparezca) al momento.
  if (cambios.marcas_usuario || cambios.marcas_eliminadas || cambios.plataformas_usuario) ctxConstruirMenus();
});

// ============================================================================
//  ACTUALIZACIÓN AUTOMÁTICA — "lo que cambie llega solo a TODOS los navegadores
//  y a TODAS las computadoras".
//
//  Cómo funciona el conjunto (3 piezas):
//   1) Al publicar un cambio, los archivos van al repo PÚBLICO denunciasrs-ext.
//   2) En cada PC, DENUNCIAS_RS.bat (tarea programada: al iniciar sesión y cada
//      hora) descarga ese repo y REEMPLAZA la carpeta DenunciasRS_extension. Como
//      Chrome, Edge, Brave… cargan TODOS esa MISMA carpeta, el archivo nuevo les
//      llega a los tres a la vez.
//   3) Falta que el navegador RELEA esos archivos: hasta ahora eso solo pasaba al
//      reiniciarlo (por eso se veían cambios "que no llegaban"). De eso se encarga
//      este bloque: cada hora compara la versión que está corriendo con la
//      PUBLICADA y, cuando hay una nueva, recarga la extensión sola.
//
//  Seguridad: solo se LEE un archivo público del repo (la versión). No se descarga
//  ni se ejecuta código desde la red: el código lo instala el .bat en el disco, y
//  chrome.runtime.reload() se limita a releer la carpeta local ya instalada.
// ============================================================================
const URL_VERSION_PUBLICADA =
  "https://raw.githubusercontent.com/diegoarias-prog/denunciasrs-ext/main/extension/manifest.json";

// Compara "1.2.10" vs "1.2.9" por NÚMERO de cada parte (no como texto: "1.2.10"
// es MENOR que "1.2.9" al comparar cadenas, y nunca se actualizaría).
function versionMayor(a, b) {
  const pa = String(a || "0").split("."), pb = String(b || "0").split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = parseInt(pa[i] || "0", 10) || 0, nb = parseInt(pb[i] || "0", 10) || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

// ¿Está la extensión ocupada rellenando una denuncia? Nunca se recarga en medio de
// un formulario a medio llenar (se perdería el autorrelleno de la 2.ª etapa).
function ocupadaRellenando() {
  return Object.keys(AUTORRELLENO).some((t) => AUTORRELLENO[t] && !AUTORRELLENO[t].cancelar);
}

// Versión que hay AHORA MISMO en la carpeta del disco. Para una extensión cargada
// "descomprimida", los archivos se sirven del disco, así que si el .bat ya copió lo
// nuevo, aquí se ve la versión nueva aunque la que corre siga siendo la vieja: es la
// señal exacta de "ya se puede recargar". Si el navegador lo sirviera de memoria,
// devolverá la versión vieja y no pasa nada: queda el reintento por hora de abajo.
async function versionEnDisco() {
  try {
    const r = await fetch(chrome.runtime.getURL("version.json"), { cache: "no-store" });
    if (!r.ok) return "";
    return (await r.json()).version || "";
  } catch (e) { return ""; }
}

async function comprobarActualizacion(motivo) {
  const propia = chrome.runtime.getManifest().version;
  let publicada = "";
  try {
    const r = await fetch(URL_VERSION_PUBLICADA, { cache: "no-store" });
    if (r.ok) publicada = (await r.json()).version || "";
  } catch (e) { /* sin internet: se reintenta en la próxima ronda */ }

  const enDisco = await versionEnDisco();
  const hayNueva = !!publicada && versionMayor(publicada, propia);
  const listaEnDisco = !!enDisco && versionMayor(enDisco, propia); // ya bajada por el .bat

  await chrome.storage.local.set({
    estado_version: {
      propia: propia, publicada: publicada, enDisco: enDisco,
      hayNueva: hayNueva, listaEnDisco: listaEnDisco,
      revisado: Date.now(), motivo: motivo || ""
    }
  });
  // Aviso visible en el icono: "↑" = hay una versión más nueva esperando.
  try {
    await chrome.action.setBadgeText({ text: hayNueva ? "↑" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#e8402a" });
  } catch (e) {}

  if (!hayNueva && !listaEnDisco) return;
  if (ocupadaRellenando()) return; // se aplicará en la siguiente ronda

  // Con la versión nueva YA en el disco, recargar la aplica al instante.
  // Si aún no está (el .bat no ha corrido), se prueba igualmente una vez por hora:
  // la recarga es inofensiva (si los archivos siguen igual, se queda como estaba) y
  // así no depende de que el usuario reinicie el navegador.
  const g = await chrome.storage.local.get("reintento_recarga");
  const prev = g.reintento_recarga || {};
  const ahora = Date.now();
  const clave = publicada || enDisco;                 // versión a la que se quiere llegar
  const mismos = prev.version === clave;
  const veces = mismos ? (prev.veces || 0) : 0;
  // TOPES para no acabar recargando sin parar si algo impidiera aplicar la versión
  // nueva (la recarga solo sirve si los archivos nuevos ya están en la carpeta).
  if (listaEnDisco) {
    if (veces >= 3) return;                           // ya está en disco: 3 intentos bastan
  } else {
    if (mismos && (ahora - (prev.cuando || 0)) < 55 * 60 * 1000) return; // como mucho, uno por hora
    if (veces >= 24) return;                          // ~un día insistiendo: parar
  }
  await chrome.storage.local.set({
    reintento_recarga: { version: clave, cuando: ahora, veces: veces + 1 }
  });
  chrome.runtime.reload(); // relee la carpeta del disco: aplica lo nuevo sin reiniciar el navegador
}

chrome.alarms.create("buscar_actualizacion", { delayInMinutes: 1, periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a && a.name === "buscar_actualizacion") comprobarActualizacion("ronda por hora");
});
chrome.runtime.onStartup.addListener(() => comprobarActualizacion("arranque del navegador"));
chrome.runtime.onInstalled.addListener(() => {
  // Tras aplicarse una versión nueva: se limpia el aviso y se vuelve a comprobar.
  chrome.storage.local.remove("reintento_recarga");
  try { chrome.action.setBadgeText({ text: "" }); } catch (e) {}
  comprobarActualizacion("instalacion/actualizacion");
});
