// ============================================================================
//  Lógica del popup: arma el "plan de relleno" para (formulario, marca) y lo
//  inyecta en la pestaña activa con chrome.scripting (MV3). El motor de relleno
//  (función APLICAR) se ejecuta en el contexto de la página del formulario.
// ============================================================================

// --- Marcas: base + las editadas/agregadas en Opciones − las eliminadas ---
async function obtener_marcas() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  // Combina POR CAMPO: lo guardado por el usuario pisa a la base, pero los campos
  // que la copia guardada no tenga (ej. play/appstore/dominio agregados después)
  // se heredan de MARCAS_BASE en vez de perderse.
  const todas = Object.assign({}, window.MARCAS_BASE);
  Object.keys(guardadas).forEach((m) => {
    const base = window.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    // Lo guardado pisa a la base, PERO si el usuario lo dejó vacío se conserva la base
    // (así no se pierde el teléfono/links/etc. agregados después en una copia vieja).
    Object.keys(g).forEach((k) => { if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k]; });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  return todas;
}

const $ = (id) => document.getElementById(id);

function mostrar_estado(clase, html) {
  const e = $("estado");
  e.className = "estado " + clase;
  e.innerHTML = html;
}

function llenar_select(sel, items, placeholder) {
  sel.innerHTML = "";
  if (placeholder) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = placeholder; sel.appendChild(o);
  }
  items.forEach((it) => {
    const o = document.createElement("option");
    o.value = it.value; o.textContent = it.texto; sel.appendChild(o);
  });
}

function redes_disponibles() {
  const reds = [];
  Object.keys(window.FORMULARIOS).forEach((k) => {
    const f = window.FORMULARIOS[k];
    if (reds.indexOf(f.red) < 0) reds.push(f.red);
  });
  return reds.sort((a, b) => a.localeCompare(b, "es"));
}

function formularios_de_red(red) {
  return Object.keys(window.FORMULARIOS)
    .filter((k) => window.FORMULARIOS[k].red === red)
    .map((k) => ({ value: k, texto: window.FORMULARIOS[k].nombre }));
}

let MARCAS = {};

async function inicializar() {
  MARCAS = await obtener_marcas();
  llenar_select($("sel_red"), redes_disponibles().map((r) => ({ value: r, texto: r })));
  llenar_select($("sel_marca"), Object.keys(MARCAS).sort().map((m) => ({ value: m, texto: m })));
  refrescar_formularios();
}

function refrescar_formularios() {
  llenar_select($("sel_form"), formularios_de_red($("sel_red").value));
}

$("sel_red").addEventListener("change", refrescar_formularios);
$("abrir_opciones").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$("abrir_politicas").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("politicas.html") }); });
$("abrir_plantilla").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("plantilla.html") }); });
$("abrir_registro").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("registro.html") }); });

$("boton_rellenar").addEventListener("click", rellenar);
$("boton_capturar").addEventListener("click", capturar_pantalla);

// Habilita el botón de captura si ya hay una denuncia en curso de una sesión previa.
chrome.storage.local.get(["ultima_denuncia_registro"], (x) => {
  if (x.ultima_denuncia_registro) $("boton_capturar").disabled = false;
});

// ===========================================================================
//  Lista de URLs a denunciar (Excel) — se autollenan en las cajas "Enlace 1..30"
// ===========================================================================
const CLAVE_URLS = "urls_denuncia";

// Muestra en #estado_urls cuántas URLs hay cargadas (o "Sin lista cargada").
function pintar_estado_urls(n) {
  const e = $("estado_urls");
  if (!e) return;
  e.textContent = (n && n > 0) ? (n + " URL" + (n === 1 ? "" : "s") + " cargada" + (n === 1 ? "" : "s")) : "Sin lista cargada";
}

// Lee las URLs guardadas en storage (array vacío si no hay).
function obtener_urls_guardadas() {
  return new Promise((res) =>
    chrome.storage.local.get([CLAVE_URLS], (x) => res(Array.isArray(x[CLAVE_URLS]) ? x[CLAVE_URLS] : [])));
}

// Lee un .xlsx con ExcelJS, detecta la columna "URL" (o la 1.ª), recoge las URLs
// válidas (no vacías, sin duplicados, que empiecen por http) y las guarda.
// Extrae el texto de una celda (ExcelJS puede devolver objetos para hipervínculo/texto enriquecido).
function valor_celda(celda) {
  let v = celda ? celda.value : null;
  if (v && typeof v === "object") v = v.text || v.hyperlink || v.result || (v.richText && v.richText.map((t) => t.text).join("")) || "";
  return (v == null ? "" : v.toString()).trim();
}

// Normaliza un valor a URL: si ya trae http(s):// se respeta; si parece una URL/dominio
// SIN esquema (ej. "www.facebook.com/..." o "facebook.com/...") se le antepone "https://".
// También corrige esquemas mal escritos ("http:/...", "//..."). Devuelve "" si no parece URL.
function normalizar_url(v) {
  v = (v == null ? "" : v.toString()).trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const m = v.match(/^(https?):\/+(.*)$/i);   // "http:/dominio" o "https:///dominio"
  if (m) return m[1].toLowerCase() + "://" + m[2];
  if (/^\/\//.test(v)) return "https:" + v;   // "//dominio/..."
  if (/^www\./i.test(v)) return "https://" + v;
  if (/^[^\s]+\.[a-z]{2,}([\/?#].*)?$/i.test(v)) return "https://" + v; // dominio.tld[/ruta]
  return "";
}

// Rótulos de encabezado que NO son datos (para saber si la fila 1 es título o URL).
const ROTULOS_ENCABEZADO = { "url": 1, "urls": 1, "enlace": 1, "enlaces": 1, "link": 1, "links": 1, "liga": 1, "ligas": 1, "direccion": 1, "dirección": 1 };

async function cargar_archivo_urls(file) {
  if (!file) return;
  try {
    if (typeof ExcelJS === "undefined") throw new Error("no se cargó la librería ExcelJS.");
    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const hoja = wb.worksheets[0];
    if (!hoja) throw new Error("el archivo no tiene hojas.");

    // Detecta la columna cuyo encabezado (fila 1) sea "URL" (insensible a may/min/espacios).
    const norm_enc = (s) => (s == null ? "" : s.toString().trim().toLowerCase());
    let colUrl = 0, tieneEncabezadoUrl = false;
    const fila1 = hoja.getRow(1);
    fila1.eachCell({ includeEmpty: false }, (celda, col) => {
      if (colUrl === 0 && norm_enc(celda.value) === "url") { colUrl = col; tieneEncabezadoUrl = true; }
    });
    if (colUrl === 0) colUrl = 1; // si no la encuentra, usa la primera columna

    // ¿La fila 1 es un ENCABEZADO (rótulo) o YA es un dato? Antes se saltaba SIEMPRE la
    // fila 1, así que un Excel con la URL en A1 (sin título) daba 0 resultados. Ahora:
    // solo se salta si hay encabezado "URL" o la 1.ª celda es un rótulo conocido.
    let inicio = 2;
    if (!tieneEncabezadoUrl && !ROTULOS_ENCABEZADO[norm_enc(valor_celda(fila1.getCell(colUrl)))]) inicio = 1;

    const urls = [];
    const vistas = {};
    const total = hoja.actualRowCount || hoja.rowCount || 0;
    for (let r = inicio; r <= total; r++) {
      const url = normalizar_url(valor_celda(hoja.getRow(r).getCell(colUrl)));
      if (!url) continue; // vacío o no parece una URL
      const clave = url.toLowerCase();
      if (vistas[clave]) continue;
      vistas[clave] = true;
      urls.push(url);
    }

    await new Promise((res) => chrome.storage.local.set({ [CLAVE_URLS]: urls }, res));
    pintar_estado_urls(urls.length);
    if (urls.length === 0) mostrar_estado("aviso", "No se encontraron URLs en el Excel. Revisa que la columna tenga los enlaces de las publicaciones (con o sin https).");
    else mostrar_estado("ok", "✓ " + urls.length + " URL(s) cargadas. Se pondrán en las cajas Enlace 1.." + urls.length + " al Rellenar.");
  } catch (e) {
    // El mensaje del parser es dato NO confiable: se escapa (mostrar_estado usa innerHTML).
    const msg = String((e && e.message) || e).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    mostrar_estado("error", "No se pudo leer el Excel: " + msg);
  }
}

if ($("archivo_urls")) {
  $("archivo_urls").addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    cargar_archivo_urls(file);
  });
}
if ($("quitar_urls")) {
  $("quitar_urls").addEventListener("click", () => {
    chrome.storage.local.remove([CLAVE_URLS], () => {
      if ($("archivo_urls")) $("archivo_urls").value = "";
      pintar_estado_urls(0);
      mostrar_estado("aviso", "Lista de URLs eliminada.");
    });
  });
}
// Al abrir el popup, muestra el conteo de URLs ya cargadas.
obtener_urls_guardadas().then((u) => pintar_estado_urls(u.length));

// ===========================================================================
//  Registro automático de la denuncia (para no cargarla a mano)
// ===========================================================================
// Crea —o reutiliza— una entrada "pendiente" en `denuncias_registro` al iniciar
// la denuncia. Anti-duplicado: si ya existe una pendiente con la misma
// marca+plataforma+categoria, la reutiliza (pulsar Rellenar varias veces para la
// misma denuncia NO llena el registro). Devuelve el id de la entrada y guarda
// `ultima_denuncia_registro` para que la captura sepa a cuál adjuntar.
async function registrar_denuncia_auto(marca, form) {
  const CLAVE = "denuncias_registro";
  const lista = await new Promise((res) =>
    chrome.storage.local.get([CLAVE], (x) => res(Array.isArray(x[CLAVE]) ? x[CLAVE] : [])));
  const plataforma = form.red;
  const tipo = form.tipo === "email" ? "correo" : "formulario";
  const categoria = form.nombre;

  // Anti DOBLE-CLIC (no anti-duplicado general): solo reutiliza una pendiente
  // idéntica creada hace MUY POCO (ventana corta). Antes fusionaba TODAS las
  // pendientes del mismo tipo, por lo que denuncias DISTINTAS del mismo tipo
  // (ej. varios posts de la misma marca en la misma red) NO se registraban como
  // filas separadas. Ahora cada Rellenar crea su propia denuncia; solo un
  // doble-clic inmediato (< 60 s) reutiliza la anterior.
  const VENTANA_ANTIDOBLE_MS = 60 * 1000;
  const ahora = Date.now();
  const existente = lista.find((d) =>
    d.estado === "pendiente" && d.marca === marca &&
    d.plataforma === plataforma && d.categoria === categoria &&
    (ahora - new Date(d.fecha).getTime()) < VENTANA_ANTIDOBLE_MS);
  if (existente) {
    await new Promise((res) => chrome.storage.local.set({ ultima_denuncia_registro: existente.id }, res));
    return existente.id;
  }

  // Consecutivo correlativo POR MARCA (máximo existente + 1), igual que registro.js.
  const consecutivo = lista.filter((d) => d.marca === marca)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({
    id: id, marca: marca, plataforma: plataforma, tipo: tipo, categoria: categoria,
    url_denunciada: "", numero_caso: "", estado: "pendiente", consecutivo: consecutivo,
    notas: "", fecha: new Date().toISOString()
  });
  await new Promise((res) =>
    chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: id }, res));
  return id;
}

// Adjunta a la denuncia el CONTENIDO del correo generado (asunto + cuerpo, en/es),
// para poder VERLO y COPIARLO luego desde el Registro. Se guarda el texto plano
// bilingüe generado; cuando el usuario lo envía desde correo.html, ese archivo lo
// actualiza con el texto FINAL (por si lo editó).
async function guardar_correo_en_denuncia(id, em) {
  if (!id || !em) return;
  const CLAVE = "denuncias_registro";
  const lista = await new Promise((res) =>
    chrome.storage.local.get([CLAVE], (x) => res(Array.isArray(x[CLAVE]) ? x[CLAVE] : [])));
  const d = lista.find((x) => String(x.id) === String(id));
  if (!d) return;
  d.correo = {
    to: em.to || "", asunto: em.asunto || "", cuerpo: em.cuerpo || "",
    asunto_es: em.asunto_es || "", cuerpo_es: em.cuerpo_es || "",
    enviado: false, fecha: new Date().toISOString()
  };
  await new Promise((res) => chrome.storage.local.set({ [CLAVE]: lista }, res));
}

// Redimensiona un dataURL (img) a 'maxAncho' px de ancho y lo recomprime a JPEG
// 'calidad' (~0.7), para no llenar el storage con capturas enormes.
function redimensionar_imagen(dataUrl, maxAncho, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxAncho) { h = Math.round(h * (maxAncho / w)); w = maxAncho; }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", calidad));
    };
    img.onerror = function () { reject(new Error("imagen inválida")); };
    img.src = dataUrl;
  });
}

// Captura la pestaña visible y la adjunta (campo `comprobante_img`) a la denuncia
// apuntada por `ultima_denuncia_registro`.
async function capturar_pantalla() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["ultima_denuncia_registro"], (x) => res(x)));
  const idDest = d.ultima_denuncia_registro;
  if (!idDest) {
    mostrar_estado("aviso", "Primero inicia una denuncia (Rellenar) para asociarle la captura.");
    return;
  }
  $("boton_capturar").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("no se encontró la pestaña del formulario.");
    const resp = await chrome.runtime.sendMessage({ accion: "capturaCompleta", tabId: tab.id });
    if (!resp || resp.error || !resp.dataUrl) throw new Error((resp && resp.error) || "no se obtuvo la imagen");
    const dataUrl = resp.dataUrl;
    const reducida = await redimensionar_imagen(dataUrl, 1280, 0.7);
    const CLAVE = "denuncias_registro";
    const lista = await new Promise((res) =>
      chrome.storage.local.get([CLAVE], (x) => res(Array.isArray(x[CLAVE]) ? x[CLAVE] : [])));
    const ent = lista.find((x) => x.id === idDest);
    if (!ent) { mostrar_estado("aviso", "No encuentro la denuncia para adjuntar la captura."); return; }
    ent.comprobante_img = reducida;
    await new Promise((res) => chrome.storage.local.set({ [CLAVE]: lista }, res));
    mostrar_estado("ok", "✓ Captura guardada en el comprobante.");
  } catch (e) {
    mostrar_estado("error", "No se pudo capturar esta página: " + e.message);
  } finally {
    $("boton_capturar").disabled = false;
  }
}

// Espera a que la pestaña termine de cargar (o 15 s como tope).
function esperar_carga(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) {} resolve(); }, 15000);
  });
}

async function rellenar() {
  const formKey = $("sel_form").value;
  const marca = $("sel_marca").value;
  if (!formKey || !marca) { mostrar_estado("aviso", "Elige red, formulario y marca."); return; }

  const form = window.FORMULARIOS[formKey];
  const datos = MARCAS[marca] || {};
  // Código de red para la justificación de difamación (fb/ig/tk).
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  // Formularios web: justificación en INGLÉS. Para los correos también la versión española.
  const justif = window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, "en"), formKey, "en");
  const justif_es = window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, "es"), formKey, "es");

  // Lista de URLs (Excel) a autollenar en las cajas "Enlace 1..30" (vacío si no hay).
  const urls = await obtener_urls_guardadas();
  const ctx = { marca: marca, datos: datos, justif: justif, justif_es: justif_es, correoPersona: window.CORREO_PERSONA, urls: urls };

  // Redes SIN formulario web (Telegram): se genera un CORREO en una pestaña aparte.
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    const idDen = await registrar_denuncia_auto(marca, form);
    await guardar_correo_en_denuncia(idDen, em); // adjunta el contenido para verlo/copiarlo en el Registro
    $("boton_capturar").disabled = false;
    // 'from' = correo de contacto de la marca; si es una cuenta de Google Workspace
    // propia, correo.html abre el borrador de Gmail DESDE esa cuenta (envío directo).
    chrome.storage.local.set({ email_reporte: Object.assign({}, em, { from: datos.correo || "" }) }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    });
    mostrar_estado("ok", "Correo de " + form.red + " generado: revisa la pestaña, pega el/los enlace(s) y envíalo." +
      "<br><br>📓 Registrada como pendiente — agrega el N.º de caso en Registro.");
    return;
  }

  const plan = form.construirPlan(ctx);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { mostrar_estado("error", "No encuentro la pestaña activa."); return; }

  // La acción procede: registramos la denuncia como pendiente (anti-duplicado).
  await registrar_denuncia_auto(marca, form);
  $("boton_capturar").disabled = false;

  // ¿Estamos en el formulario correcto? Si no, lo abrimos, esperamos a que cargue
  // y rellenamos solo (sin tener que pulsar dos veces).
  const hostForm = new URL(plan.url).host.replace(/^www\./, "");
  const hostTab = (() => { try { return new URL(tab.url).host.replace(/^www\./, ""); } catch (e) { return ""; } })();
  $("boton_rellenar").disabled = true;
  if (hostTab.indexOf(hostForm.split(".").slice(-2).join(".")) < 0) {
    mostrar_estado("aviso", "Abriendo el formulario…");
    await chrome.tabs.update(tab.id, { url: plan.url });
    await esperar_carga(tab.id);
    await new Promise((r) => setTimeout(r, 1800)); // tiempo para que aparezcan los campos
  }
  mostrar_estado("aviso", "Rellenando…");
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: APLICAR,
      args: [plan.pasos]
    });
    const r = (res && res[0] && res[0].result) || { ok: 0, faltan: [], clicsReales: [] };
    // Clics REALES de los radios/casillas (los sintéticos no "pegan" en React).
    if (r.clicsReales && r.clicsReales.length) {
      mostrar_estado("aviso", "Marcando opciones…");
      try { await chrome.runtime.sendMessage({ accion: "clicsReales", tabId: tab.id, selectores: r.clicsReales }); }
      catch (e) { /* si falla el modo avanzado, los radios quedan manuales */ }
    }
    let html = "✓ <b>" + r.ok + "</b> campo(s) rellenado(s).";
    if (form.manual) html += "<br><br>📌 " + form.manual;
    if (r.faltan && r.faltan.length) html += "<br><br>No se encontraron (revisa a mano): " + r.faltan.join(", ");
    html += "<br><br>⚠ <b>IMPORTANTE:</b> toma el PANTALLAZO del formulario terminado y adjúntalo con el botón «Capturar». Toda denuncia por formulario debe quedar con su captura en el Registro.";
    html += "<br><br>📓 Registrada como pendiente — agrega el N.º de caso en Registro.";
    mostrar_estado(r.ok > 0 ? "ok" : "aviso", html);
  } catch (e) {
    mostrar_estado("error", "Error al rellenar: " + e.message + "<br>¿La pestaña es el formulario y está cargado?");
  } finally {
    $("boton_rellenar").disabled = false;
  }
}

// ===========================================================================
//  MOTOR DE RELLENO — se inyecta y ejecuta DENTRO de la página del formulario.
//  Debe ser autónomo (sin variables externas): se serializa con executeScript.
// ===========================================================================
async function APLICAR(pasos) {
  const dur = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function setNative(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Marca un radio/checkbox de forma robusta (sirve para formularios React de FB/IG/
  // WhatsApp/TikTok): secuencia de puntero + clic + setter nativo de 'checked' + eventos.
  function marcarRadioEl(target) {
    if (!target) return false;
    if (target.checked) return true;
    let lab = null;
    try { if (target.id) lab = document.querySelector('label[for="' + (window.CSS ? CSS.escape(target.id) : target.id) + '"]'); } catch (e) {}
    try { target.scrollIntoView({ block: "center" }); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); } catch (e) {}
    try { (lab || target).click(); } catch (e) {}
    try {
      const tipo = target.type === "checkbox" ? "checked" : "checked";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, tipo).set.call(target, true);
    } catch (e) { try { target.checked = true; } catch (e2) {} }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return !!target.checked;
  }
  function setSelect(name, texto, suf) {
    const s = document.querySelector('select[name' + (suf ? "$" : "") + '="' + (name + "").replace(/"/g, '\\"') + '"]');
    if (!s) return false;
    const t = norm(texto);
    for (let i = 0; i < s.options.length; i++) {
      if (norm(s.options[i].text).indexOf(t) >= 0) {
        s.selectedIndex = i; s.dispatchEvent(new Event("change", { bubbles: true })); return true;
      }
    }
    return false;
  }
  let ok = 0; const faltan = []; const clicsReales = [];
  // Etiqueta un radio/checkbox para que el service worker le dé un CLIC REAL después.
  function marcarParaClicReal(el) {
    if (!el) return;
    const attr = "data-cr-" + clicsReales.length; // atributo ÚNICO (no se sobrescribe)
    try { el.setAttribute(attr, "1"); } catch (e) { return; }
    clicsReales.push("[" + attr + "]");
  }
  // VARIAS PASADAS automáticas: TikTok revela partes del formulario con retraso, así
  // que en vez de obligar al usuario a volver a pulsar "Rellenar", la propia extensión
  // repite la pasada (hasta 4 veces, esperando entre cada una) reintentando SOLO los
  // pasos que quedaron pendientes, hasta completar todo lo automatizable.
  let pendientes = pasos.slice();
  for (let pasada = 0; pasada < 4 && pendientes.length; pasada++) {
    if (pasada > 0) await dur(1500); // deja que aparezca la sección que faltaba
    faltan.length = 0;               // en cada pasada solo cuentan los fallos de AHORA
    const reintentar = [];
    for (const p of pendientes) {
    const antesFaltan = faltan.length;
    try {
      if (p.tipo === "select" || p.tipo === "selectPais") {
        const texto = p.tipo === "selectPais" ? p.valor : p.texto;
        if (texto != null && texto !== "") { if (setSelect(p.name, texto, p.suf)) ok++; else faltan.push(p.name); }
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "radio") {
        const sel = 'input[type=radio][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]';
        const partes = p.texto ? norm(p.texto).split("|").filter(Boolean) : null;
        const buscar = () => {
          const radios = Array.prototype.slice.call(document.querySelectorAll(sel));
          if (!radios.length) return null;
          if (!partes) return radios[0];
          return radios.find((r) => {
            let lab = r.id ? (document.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && r.nextElementSibling) lab = r.nextElementSibling.innerText || "";
            if (!lab && r.parentElement && (r.parentElement.innerText || "").length < 40) lab = r.parentElement.innerText || "";
            const v = norm(r.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          }) || null;
        };
        let marcado = false, destinoFinal = null;
        for (let it = 0; it < 4 && !marcado; it++) {
          const destino = buscar(); // re-buscar fresco cada intento (React reemplaza el nodo)
          if (destino) { destinoFinal = destino; marcado = marcarRadioEl(destino); }
          if (!marcado) await dur(300);
        }
        if (destinoFinal) { marcarParaClicReal(destinoFinal); ok++; } else faltan.push(p.name);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "radioVal") {
        // Marca radio por NAME+VALUE exactos, como autorrelleno.py (clic en label,
        // dispatch change, reintentos porque React lo revierte).
        let okR = false, targetFinal = null;
        for (let intento = 0; intento < 4 && !okR; intento++) {
          const els = document.querySelectorAll('input[name="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          let target = null;
          for (let i = 0; i < els.length; i++) { if (els[i].value === p.value) { target = els[i]; break; } }
          if (target) targetFinal = target;
          okR = marcarRadioEl(target);
          if (!okR) await dur(300);
        }
        if (targetFinal) { marcarParaClicReal(targetFinal); ok++; } else faltan.push("radioVal:" + p.name);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "check") {
        const cbs = Array.prototype.slice.call(
          document.querySelectorAll('input[type=checkbox][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]'));
        let el = null;
        if (!p.texto) {
          el = cbs[0]; // sin texto => la (única) casilla
        } else {
          const partes = norm(p.texto).split("|").filter(Boolean);
          el = cbs.find((c) => {
            let lab = c.id ? (document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && c.parentElement) lab = c.parentElement.innerText || "";
            const v = norm(c.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          });
        }
        if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; } else faltan.push(p.name);
      } else if (p.tipo === "fillName") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector('[name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.name);
        }
      } else if (p.tipo === "fillCss") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector(p.css);
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.css);
        }
      } else if (p.tipo === "fillAny") {
        if (p.valor != null && p.valor !== "") {
          let hecho = false;
          for (const nm of (p.names || [])) {
            const el = document.querySelector('[name="' + (nm + "").replace(/"/g, '\\"') + '"]');
            if (el) { setNative(el, p.valor); ok++; hecho = true; break; }
          }
          if (!hecho) faltan.push((p.names || []).join("|"));
        }
      } else if (p.tipo === "dropdown") {
        // Menú-botón de TikTok: abre el desplegable (por su pregunta o índice) y
        // elige la opción cuyo texto contenga 'opcion'.
        const ds = Array.prototype.slice.call(document.querySelectorAll('[aria-haspopup="listbox"],[role="combobox"]'));
        // Preferimos los menús AÚN SIN SELECCIONAR (muestran "Select"/"Seleccionar"):
        // el siguiente a llenar es el primero sin selección.
        const sinSel = ds.filter((d) => {
          const t = norm(d.innerText);
          return !t || t.indexOf("select") >= 0 || t.indexOf("seleccion") >= 0 || t.indexOf("elegir") >= 0 || t.indexOf("choose") >= 0;
        });
        const pool = sinSel.length ? sinSel : ds;
        let btn = null;
        if (p.pregunta) {
          const partes = norm(p.pregunta).split("|");
          btn = pool.find((d) => {
            let ctx = "", par = d.parentElement, k = 0;
            while (par && k < 2) { ctx += " " + (par.innerText || ""); par = par.parentElement; k++; }
            const c = norm(ctx);
            return partes.some((kw) => kw && c.indexOf(kw) >= 0);
          });
        }
        if (!btn) btn = pool[p.indice || 0] || pool[0];
        if (btn) {
          btn.click();
          const ops = norm(p.opcion).split("|").filter(Boolean); // varias alternativas (es|en)
          let o = null;
          for (let intento = 0; intento < 7 && !o; intento++) {
            await dur(400);
            o = Array.prototype.slice.call(document.querySelectorAll('[role=option],li,[role=menuitem]'))
              .find((x) => { const t = norm(x.innerText); return ops.some((kw) => t.indexOf(kw) >= 0); });
          }
          if (o) { o.click(); ok++; } else { faltan.push("opcion:" + p.opcion); try { document.body.click(); } catch (e) {} }
        } else faltan.push("menu:" + (p.pregunta || p.indice));
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "fillLabel") {
        // Rellena el primer campo VISIBLE y vacío cuyo texto cercano contenga la etiqueta.
        // REINTENTA unos segundos: TikTok (y otros SPA React) pintan la sección un
        // instante después, así que un solo escaneo la perdía y marcaba todo como
        // "no encontrado". Reintentamos hasta que el campo aparezca.
        if (p.valor != null && p.valor !== "") {
          const kws = (p.label || "").split("|").map(norm).filter(Boolean);
          let yaLleno = false; // el campo que coincide ya tenía valor (p.ej. correo verificado)
          const buscarCampo = () => {
            const els = Array.prototype.slice.call(
              document.querySelectorAll('textarea,input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],input:not([type])'));
            for (const e of els) {
              const r = e.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
              if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
              // GitHub asocia el rótulo por aria-labelledby (referencia por id), no por label[for].
              const lblby = e.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
              // El rótulo suele ser un hermano ANTERIOR directo del campo (formularios de GitHub).
              let prevE = e.previousElementSibling, je = 0;
              while (prevE && je < 4) { ctx += " " + (prevE.innerText || ""); prevE = prevE.previousElementSibling; je++; }
              // En TikTok el título del campo suele ser el hermano ANTERIOR de un ancestro.
              let par = e.parentElement, k = 0;
              while (par && k < 6) {
                const ps = par.previousElementSibling;
                if (ps) ctx += " " + (ps.innerText || "");
                par = par.parentElement; k++;
              }
              const c = norm(ctx);
              if (kws.some((kw) => c.indexOf(kw) >= 0)) {
                if (e.value) { yaLleno = true; continue; } // coincide pero ya tiene valor
                return e;
              }
            }
            return null;
          };
          let hit = null;
          for (let intentoFL = 0; intentoFL < (p.reintentos || 6) && !hit && !yaLleno; intentoFL++) {
            hit = buscarCampo();
            if (!hit && !yaLleno) await dur(400);
          }
          if (hit) { setNative(hit, p.valor); ok++; }
          else if (yaLleno) { ok++; } // ya estaba relleno (correo verificado, etc.)
          else faltan.push("etiqueta:" + p.label);
        }
      } else if (p.tipo === "fillUrlsUnaCaja") {
        // TikTok: UNA sola caja para TODAS las URLs, una por línea. Se llena por partes,
        // así que si la caja aún no está visible NO rompe (la llenará un Rellenar posterior).
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (!urls.length) {
          // nada que poner
        } else {
          const etiquetas = (p.label || "").split("|").map(norm).filter(Boolean);
          const placeholders = (p.placeholder || "").split("|").map(norm).filter(Boolean);
          const campos = Array.prototype.slice.call(
            document.querySelectorAll("textarea, input[type=text], input:not([type])"));
          let hit = null;
          for (const e of campos) {
            const r = e.getBoundingClientRect();
            if (r.width <= 2 || r.height <= 2 || e.value) continue;
            const ph = norm(e.placeholder || "");
            let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
            if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
            const lblby = e.getAttribute("aria-labelledby");
            if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
            if (e.previousElementSibling) ctx += " " + (e.previousElementSibling.innerText || "");
            if (e.parentElement) ctx += " " + (e.parentElement.innerText || "");
            const c = norm(ctx);
            const porEtiqueta = etiquetas.some((kw) => c.indexOf(kw) >= 0);
            const porPlaceholder = placeholders.some((kw) => ph.indexOf(kw) >= 0);
            if (porEtiqueta || porPlaceholder) { hit = e; break; }
          }
          if (hit) { setNative(hit, urls.join("\n")); ok++; } else faltan.push("urls_caja_tiktok");
        }
      } else if (p.tipo === "selectLabel") {
        // Como fillLabel pero para <select> nativos: encuentra el menú por su etiqueta
        // cercana (placeholder/aria-label/label-for/hermano anterior/ancestro) y elige
        // la opción cuyo texto contenga 'opcion'. Para formularios GitHub (sin name).
        const kws = (p.label || "").split("|").map(norm).filter(Boolean);
        const sels = Array.prototype.slice.call(document.querySelectorAll("select"));
        let hit = null;
        for (const s of sels) {
          const r = s.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          let ctx = " " + (s.getAttribute("aria-label") || "") + " ";
          if (s.id) { const lf = document.querySelector('label[for="' + s.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
          const lblbyS = s.getAttribute("aria-labelledby");
          if (lblbyS) lblbyS.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
          let prevS = s.previousElementSibling, js = 0;
          while (prevS && js < 4) { ctx += " " + (prevS.innerText || ""); prevS = prevS.previousElementSibling; js++; }
          let par = s.parentElement, k = 0;
          while (par && k < 6) { const ps = par.previousElementSibling; if (ps) ctx += " " + (ps.innerText || ""); par = par.parentElement; k++; }
          if (kws.some((kw) => norm(ctx).indexOf(kw) >= 0)) { hit = s; break; }
        }
        if (hit) {
          const t = norm(p.opcion);
          let done = false;
          if (t) for (let i = 0; i < hit.options.length; i++) {
            if (norm(hit.options[i].text).indexOf(t) >= 0) {
              hit.selectedIndex = i;
              hit.dispatchEvent(new Event("input", { bubbles: true }));
              hit.dispatchEvent(new Event("change", { bubbles: true }));
              done = true; break;
            }
          }
          if (done) ok++; else faltan.push("opcion:" + p.opcion);
        } else faltan.push("selectLabel:" + p.label);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "clickOpcion") {
        // Hace clic en la OPCIÓN VISIBLE cuyo texto coincide (como un humano). Útil
        // para casillas/radios con widget no estándar (TikTok). Reintenta por React.
        const kws = norm(p.texto).split("|").filter(Boolean);
        let okC = false;
        for (let intento = 0; intento < 3 && !okC; intento++) {
          const cands = Array.prototype.slice.call(
            document.querySelectorAll("label,span,div,p,button,li,[role=radio],[role=checkbox]"))
            .filter((e) => {
              const t = norm(e.innerText || e.textContent || "");
              const r = e.getBoundingClientRect();
              return t && t.length < 32 && r.width > 1 && r.height > 1 && kws.some((kw) => t === kw);
            });
          // el más interno (sin hijos con el mismo texto) para no clicar el contenedor
          const el = cands.find((e) => !cands.some((o) => o !== e && e.contains(o))) || cands[0];
          if (el) { el.click(); okC = true; }
          if (!okC) await dur(300);
        }
        if (okC) ok++; else faltan.push("opcion:" + p.texto);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "checkVarios") {
        // Marca TODAS las casillas cuyo texto coincida con alguna etiqueta (p.ej. las
        // 3 de "Declaración" de TikTok), hasta 'max'. Las deja para clic real.
        // REINTENTA: la sección "Declaración" también se pinta con retraso.
        const kws = norm(p.etiquetas).split("|").filter(Boolean);
        const max = p.max || 99;
        const marcarCasillas = () => {
          const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
          let n = 0;
          for (const c of cbs) {
            if (n >= max) break;
            if (c.checked) { n++; continue; }
            let t = " " + (c.getAttribute("aria-label") || "") + " ";
            let par = c.parentElement, k = 0;
            while (par && k < 4) { t += " " + (par.innerText || ""); par = par.parentElement; k++; }
            const ct = norm(t);
            if (kws.some((kw) => ct.indexOf(kw) >= 0)) {
              marcarRadioEl(c); marcarParaClicReal(c); ok++; n++;
            }
          }
          return n;
        };
        let n = 0;
        for (let intentoCV = 0; intentoCV < (p.reintentos || 6) && n === 0; intentoCV++) {
          n = marcarCasillas();
          if (n === 0) await dur(400);
        }
        if (n === 0) faltan.push("checkVarios:" + p.etiquetas);
      } else if (p.tipo === "checkLabel") {
        // Marca UNA casilla por su etiqueta cercana (sin name): usa el rótulo AJUSTADO
        // (aria-label / aria-labelledby / label-for / padre corto / hermano) para no
        // confundirse con casillas vecinas que comparten contenedor (formularios GitHub).
        const kws = (p.texto || "").split("|").map(norm).filter(Boolean);
        const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
        let el = null;
        for (const c of cbs) {
          if (c.checked) continue;
          let lab = " " + (c.getAttribute("aria-label") || "") + " ";
          const lb = c.getAttribute("aria-labelledby");
          if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) lab += " " + (le.innerText || ""); });
          if (c.id) { const lf = document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]'); if (lf) lab += " " + (lf.innerText || ""); }
          if (c.parentElement && (c.parentElement.innerText || "").length < 240) lab += " " + (c.parentElement.innerText || "");
          if (c.nextElementSibling) lab += " " + (c.nextElementSibling.innerText || "");
          if (kws.some((kw) => norm(lab).indexOf(kw) >= 0)) { el = c; break; }
        }
        if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; } else faltan.push("checkLabel:" + p.texto);
      } else if (p.tipo === "clickBoton") {
        // Pulsa un botón por su texto (p. ej. "Siguiente"/"Next"). Evita Enviar/Submit.
        const kws = norm(p.texto).split("|").filter(Boolean);
        const btns = Array.prototype.slice.call(
          document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a'));
        const btn = btns.find((b) => {
          const t = norm(b.innerText || b.value || b.textContent || "");
          const r = b.getBoundingClientRect();
          return t && r.width > 1 && r.height > 1 && !b.disabled &&
            t.indexOf("enviar") < 0 && t.indexOf("submit") < 0 &&
            kws.some((kw) => t === kw || t.indexOf(kw) >= 0);
        });
        if (btn) { btn.click(); ok++; } else faltan.push("boton:" + p.texto);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "fillUrlList") {
        // Autollena las cajas "Enlace 1..30" de Meta (FB/IG) con la lista de URLs del
        // Excel. Si hay más URLs que cajas y existe el checkbox "Tengo enlaces
        // adicionales...", lo marca para que aparezcan las cajas 11..30.
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (urls.length) {
          const dom = norm(p.dominio || "");
          // Devuelve, en orden del DOM, las cajas de URL visibles y vacías cuyo
          // placeholder contenga el dominio (facebook.com / instagram.com).
          const buscarCajas = () => Array.prototype.slice.call(
            document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || ph.indexOf(dom) < 0) return false;
              if (e.value) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          let cajas = buscarCajas();
          // ¿Faltan cajas? Marca el checkbox de "enlaces adicionales" y espera a que
          // el formulario revele las cajas 11..30 (React las agrega de forma asíncrona).
          if (urls.length > cajas.length && p.checkLabel) {
            const kws = (p.checkLabel || "").split("|").map(norm).filter(Boolean);
            const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
            let cb = null;
            for (const c of cbs) {
              let lab = " " + (c.getAttribute("aria-label") || "") + " ";
              const lb = c.getAttribute("aria-labelledby");
              if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) lab += " " + (le.innerText || ""); });
              if (c.id) { const lf = document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]'); if (lf) lab += " " + (lf.innerText || ""); }
              if (c.parentElement && (c.parentElement.innerText || "").length < 240) lab += " " + (c.parentElement.innerText || "");
              if (kws.some((kw) => norm(lab).indexOf(kw) >= 0)) { cb = c; break; }
            }
            if (cb && !cb.checked) {
              marcarRadioEl(cb); marcarParaClicReal(cb);
              let previo = cajas.length;
              for (let it = 0; it < 8; it++) {
                await dur(400);
                const ahora = buscarCajas();
                if (ahora.length >= urls.length || ahora.length === previo) { cajas = ahora; if (ahora.length >= urls.length) break; }
                previo = ahora.length; cajas = ahora;
              }
            }
            cajas = buscarCajas();
          }
          // Rellena en orden: URL i -> caja i.
          let puestas = 0;
          for (let i = 0; i < urls.length && i < cajas.length; i++) { setNative(cajas[i], urls[i]); puestas++; }
          if (puestas > 0) ok++;
          if (puestas < urls.length) faltan.push("urls:" + puestas + "/" + urls.length + " (FB tope 30)");
        }
      } else if (p.tipo === "fillDifamUrls") {
        // Formulario de difamación (FB/IG): primero elige en el <select> nativo
        // "¿Cuántas URL quieres denunciar?" la cantidad N (= número de URLs del Excel),
        // espera a que el formulario revele los N bloques, llena cada "URL n.º i" con su
        // URL y pone el MISMO texto de difamación (ctx.justif) en cada "Motivo:".
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        const motivo = (p.motivo || "").toString();
        const cant = Math.max(urls.length, 1);
        // Cuenta los inputs/textarea de URL visibles (placeholder contiene "url (http").
        const buscarUrlInputs = () => Array.prototype.slice.call(
          document.querySelectorAll('input, textarea'))
          .filter((e) => {
            const ph = norm(e.placeholder || "");
            if (!ph || ph.indexOf("url (http") < 0) return false;
            const r = e.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
          });
        // a) Ubica el <select> de cantidad por su rótulo cercano.
        const selects = Array.prototype.slice.call(document.querySelectorAll('select'));
        let selCant = null;
        for (const s of selects) {
          let rot = "";
          try { if (s.id) { const lf = document.querySelector('label[for="' + (s.id + "").replace(/"/g, '\\"') + '"]'); if (lf) rot += " " + (lf.innerText || ""); } } catch (e) {}
          if (s.parentElement) rot += " " + (s.parentElement.innerText || "");
          if (s.previousElementSibling) rot += " " + (s.previousElementSibling.innerText || "");
          const nr = norm(rot);
          if (nr.indexOf("cuantas url") >= 0 || nr.indexOf("how many url") >= 0) { selCant = s; break; }
        }
        // b) Elige la opción = cant (match exacto por text/value; si no, la que lo contenga).
        if (selCant) {
          const objetivo = String(cant);
          let idx = -1, idxContiene = -1;
          for (let i = 0; i < selCant.options.length; i++) {
            const op = selCant.options[i];
            const tx = (op.text || "").trim();
            const vl = (op.value || "").trim();
            if (tx === objetivo || vl === objetivo) { idx = i; break; }
            if (idxContiene < 0 && ((tx.match(/\d+/) && tx.match(/\d+/)[0] === objetivo) || (vl.match(/\d+/) && vl.match(/\d+/)[0] === objetivo))) idxContiene = i;
          }
          if (idx < 0) idx = idxContiene;
          if (idx >= 0) {
            selCant.selectedIndex = idx;
            selCant.dispatchEvent(new Event("change", { bubbles: true }));
          }
          // c) Espera (máx. 10 iteraciones) a que aparezcan los bloques de URL.
          for (let it = 0; it < 10; it++) {
            if (buscarUrlInputs().length >= cant) break;
            await dur(300);
          }
        }
        // d) Llena las URLs en orden: URL i -> caja i.
        const urlInputs = buscarUrlInputs();
        let puestasU = 0;
        for (let i = 0; i < urls.length && i < urlInputs.length; i++) { setNative(urlInputs[i], urls[i]); puestasU++; }
        // e) Llena los Motivos con el MISMO texto de difamación en cada uno.
        let puestasM = 0;
        if (motivo) {
          const motTextareas = Array.prototype.slice.call(document.querySelectorAll('textarea'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || (ph.indexOf("perjudica tu reputacion") < 0 && ph.indexOf("afirmaciones concretas") < 0)) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          for (let i = 0; i < cant && i < motTextareas.length; i++) { setNative(motTextareas[i], motivo); puestasM++; }
        }
        // f) Resultado.
        if (puestasU > 0 || puestasM > 0) ok++;
        if (urls.length > urlInputs.length) faltan.push("difam_urls:" + puestasU + "/" + urls.length);
      }
    } catch (e) { faltan.push((p.name || p.css || "?") + ": " + e.message); }
      if (faltan.length > antesFaltan) reintentar.push(p); // no se completó: reintentar en la próxima pasada
    }
    pendientes = reintentar;
  }
  return { ok: ok, faltan: faltan, clicsReales: clicsReales };
}

inicializar();
