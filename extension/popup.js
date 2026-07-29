// ============================================================================
//  Lógica del popup: arma el "plan de relleno" para (formulario, marca) y lo
//  inyecta en la pestaña activa con chrome.scripting (MV3). El motor de relleno
//  (función APLICAR) se ejecuta en el contexto de la página del formulario.
// ============================================================================

// Redes cuyos formularios se envían solos (sin captcha). En X/YouTube/LinkedIn hay captcha:
// solo se rellena y captura, el usuario resuelve el captcha y envía.
const REDES_AUTOENVIO_POPUP = ["Facebook", "Instagram", "WhatsApp", "TikTok", "Google"];

// El botón flotante "📸 Capturar comprobante" NO debe salir mientras uno simplemente
// navega por la red social: solo cuando se ACTIVA la extensión. Abrir este popup en una
// pestaña es justo eso, así que se lo avisamos al content script de esa pestaña.
(async function activar_boton_captura_en_pestana_actual() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { accion: "activarBotonCaptura" }, () => void chrome.runtime.lastError);
  } catch (e) { /* la página no admite content scripts: nada que activar */ }
})();

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
//  URLs escritas A MANO (1 o 2). Para denunciar un enlace suelto sin tener que
//  armar un Excel. Se guardan en storage para que las use TAMBIÉN el menú del
//  clic derecho, y TIENEN PRIORIDAD sobre la lista del Excel: si hay alguna
//  escrita, es la que se pone en los formularios y en los correos.
//  Orden de prioridad general: clic derecho sobre un enlace > estas cajas > Excel.
// ===========================================================================
const CLAVE_URLS_MANUALES = "urls_manuales";

function pintar_estado_urls_manuales(n) {
  const e = $("estado_urls_manuales");
  if (!e) return;
  e.textContent = (n && n > 0)
    ? (n + " URL" + (n === 1 ? "" : "s") + " a mano: se usa" + (n === 1 ? "" : "n") + " esta" + (n === 1 ? "" : "s") + " (el Excel se ignora)")
    : "Vacías: se usará la lista del Excel";
}

// Lee las cajas, se queda con las que parecen URL y las guarda.
function guardar_urls_manuales() {
  const vals = ["caja_url_1", "caja_url_2"]
    .map((id) => ($(id) ? normalizar_url($(id).value) : ""))
    .filter(Boolean);
  const unicas = vals.filter((u, i) => vals.indexOf(u) === i);
  return new Promise((res) =>
    chrome.storage.local.set({ [CLAVE_URLS_MANUALES]: unicas }, () => { pintar_estado_urls_manuales(unicas.length); res(unicas); }));
}

function obtener_urls_manuales() {
  return new Promise((res) =>
    chrome.storage.local.get([CLAVE_URLS_MANUALES], (x) =>
      res(Array.isArray(x[CLAVE_URLS_MANUALES]) ? x[CLAVE_URLS_MANUALES] : [])));
}

// URLs que se usarán en esta denuncia: las escritas a mano si las hay, si no el Excel.
async function obtener_urls_para_denuncia() {
  const manuales = await obtener_urls_manuales();
  if (manuales.length) return manuales;
  return await obtener_urls_guardadas();
}

["caja_url_1", "caja_url_2"].forEach((id) => {
  if ($(id)) $(id).addEventListener("input", () => { guardar_urls_manuales(); });
});
if ($("quitar_urls_manuales")) {
  $("quitar_urls_manuales").addEventListener("click", () => {
    ["caja_url_1", "caja_url_2"].forEach((id) => { if ($(id)) $(id).value = ""; });
    chrome.storage.local.remove([CLAVE_URLS_MANUALES], () => {
      pintar_estado_urls_manuales(0);
      mostrar_estado("aviso", "URLs escritas a mano borradas.");
    });
  });
}
// Al abrir el popup, las cajas de URL a mano salen SIEMPRE EN BLANCO: son de la
// denuncia que se está haciendo AHORA, no de la anterior. Si se quedaban con lo
// escrito la vez pasada, la siguiente denuncia se llevaba por error los enlaces
// viejos (lo pidió el usuario). Se borra también lo guardado en storage para que
// ni el menú contextual ni un Rellenar posterior los reutilicen.
["caja_url_1", "caja_url_2"].forEach((id) => { if ($(id)) $(id).value = ""; });
chrome.storage.local.remove([CLAVE_URLS_MANUALES], () => { pintar_estado_urls_manuales(0); });

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
  // El PAÍS es obligatorio en casi todos los formularios (Meta lo pide como primer campo y
  // sin él no deja avanzar). Se avisa ANTES de rellenar para no dejar al usuario delante de
  // un formulario a medias con un "This field is required" sin explicación.
  if (!pais.trim() && form.tipo !== "email") {
    mostrar_estado("aviso", "La marca «" + marca + "» no tiene <b>país</b> configurado y el formulario lo exige. " +
      "Ábrela en <b>⚙ Marcas</b>, escribe el país (ej. Ecuador) y vuelve a intentarlo.");
    return;
  }
  // Formularios web: justificación en ESPAÑOL (regla del proyecto, igual que en el menú
  // contextual); los correos van en inglés con la versión española de referencia. Toda
  // descripción termina con la política infringida + el PERFIL OFICIAL de la marca en la
  // red que se denuncia, para que la plataforma sepa cuál es la cuenta auténtica.
  const lang = form.tipo === "email" ? "en" : "es";
  const justif = window.JUSTIF.conPerfilOficial(
    window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, lang), formKey, lang),
    form.red, marca, datos, lang);
  const justif_es = window.JUSTIF.conPerfilOficial(
    window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, "es"), formKey, "es"),
    form.red, marca, datos, "es");

  // URLs a denunciar: las escritas a mano en el popup si las hay; si no, la lista del
  // Excel. Se usan tanto en los formularios (cajas "Enlace 1..30" / caja única) como en
  // los correos (donde sustituyen al "[ Pega aquí el/los enlace(s) ]").
  const urls = await obtener_urls_para_denuncia();
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

  // ¿Estamos ya en el formulario correcto? Si SÍ, se rellena esta misma pestaña.
  // Si NO, se abre el formulario en una pestaña APARTE en segundo plano (active:false)
  // y se rellena ESA, para NO sacar al usuario de la pestaña que está viendo.
  let objetivoTabId = tab.id;
  const hostForm = new URL(plan.url).host.replace(/^www\./, "");
  const hostTab = (() => { try { return new URL(tab.url).host.replace(/^www\./, ""); } catch (e) { return ""; } })();
  $("boton_rellenar").disabled = true;
  if (hostTab.indexOf(hostForm.split(".").slice(-2).join(".")) < 0) {
    mostrar_estado("aviso", "Abriendo el formulario en una pestaña aparte…");
    const nueva = await chrome.tabs.create({ url: plan.url, active: false });
    objetivoTabId = nueva.id;
    await esperar_carga(objetivoTabId);
    await new Promise((r) => setTimeout(r, 1800)); // tiempo para que aparezcan los campos
  }
  // La pestaña del FORMULARIO queda marcada como pestaña de denuncia: ahí sí debe verse
  // el botón flotante "📸 Capturar comprobante" (es la prueba de que se hizo la denuncia),
  // y debe seguir viéndose aunque el formulario avance de paso y recargue la página.
  // Sin esto el botón no aparecía nunca en la pestaña nueva. Ver background.js.
  try { await chrome.runtime.sendMessage({ accion: "activarCaptura", tabId: objetivoTabId }); }
  catch (e) { /* si el service worker no responde, queda el botón del popup */ }
  mostrar_estado("aviso", "Rellenando…");
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: objetivoTabId },
      func: APLICAR,
      args: [plan.pasos]
    });
    const r = (res && res[0] && res[0].result) || { ok: 0, faltan: [], clicsReales: [] };
    // Clics REALES de los radios/casillas (los sintéticos no "pegan" en React).
    if (r.clicsReales && r.clicsReales.length) {
      mostrar_estado("aviso", "Marcando opciones…");
      try { await chrome.runtime.sendMessage({ accion: "clicsReales", tabId: objetivoTabId, selectores: r.clicsReales }); }
      catch (e) { /* si falla el modo avanzado, los radios quedan manuales */ }
    }
    // AUTORRELLENO PERSISTENTE de la 2.ª etapa (TikTok): campos como "Tipo de obra",
    // "Origen", "Descripción", firma, casillas y URL solo aparecen DESPUÉS de verificar el
    // correo. El service worker repite APLICAR + clics reales cada pocos segundos hasta ~5 min
    // (o hasta completar), así el usuario NO tiene que volver a pulsar Rellenar. Vive en el
    // service worker (no en el popup ni en un timer de la página), así sobrevive a cerrar el
    // popup y a irse a verificar el correo. Ver autorelleno() en background.js.
    const autoEnviable = REDES_AUTOENVIO_POPUP.indexOf(form.red) >= 0;
    if (plan.autorepetir) {
      // La 1.ª etapa (los desplegables) ya quedó hecha en este primer clic; se excluye de la
      // repetición para NO reabrirlos cada pocos segundos. El bucle solo insiste en los campos
      // de la 2.ª etapa (Tipo de obra, Origen, Descripción, firma, casillas, URL). Al completar,
      // el service worker captura y envía solo si la red lo permite (autoenviar).
      const pasos2 = plan.pasos.filter(function (p) { return p.tipo !== "dropdown"; });
      try { await chrome.runtime.sendMessage({ accion: "iniciarAutorelleno", tabId: objetivoTabId, pasos: pasos2, autoenviar: autoEnviable, marca: marca, enviarLabel: plan.enviarLabel }); }
      catch (e) { /* si el service worker no responde, el usuario puede pulsar Rellenar otra vez */ }
    } else {
      // Formulario NO progresivo: el service worker captura y (si no hay captcha) envía solo.
      try { await chrome.runtime.sendMessage({ accion: "finalizar", tabId: objetivoTabId, marca: marca, autoenviar: autoEnviable, enviarLabel: plan.enviarLabel, faltan: (r.faltan || []) }); }
      catch (e) { /* el usuario puede enviar a mano */ }
    }
    let html = "✓ <b>" + r.ok + "</b> campo(s) rellenado(s)." +
      (objetivoTabId !== tab.id ? " El formulario se abrió en una <b>pestaña aparte</b>." : "");
    if (form.manual) html += "<br><br>📌 " + form.manual;
    if (r.faltan && r.faltan.length) html += "<br><br>No se encontraron (revisa a mano): " + r.faltan.join(", ");
    if (autoEnviable) {
      html += plan.autorepetir
        ? "<br><br>🚀 Cuando el formulario quede completo, la extensión <b>capturará el comprobante y lo enviará sola</b> (5 s para cancelar en la pestaña del formulario)."
        : "<br><br>🚀 La extensión está <b>capturando el comprobante y enviando</b> (5 s para cancelar en la pestaña del formulario).";
    } else {
      html += "<br><br>⚠ Este formulario tiene <b>captcha</b>: la extensión capturó el comprobante; <b>resuelve el captcha y pulsa Enviar</b> tú.";
    }
    html += "<br><br>📓 Registrada como pendiente — agrega el N.º de caso en Registro.";
    mostrar_estado(r.ok > 0 ? "ok" : "aviso", html);
  } catch (e) {
    mostrar_estado("error", "Error al rellenar: " + e.message + "<br>¿La pestaña es el formulario y está cargado?");
  } finally {
    $("boton_rellenar").disabled = false;
  }
}

// (El MOTOR DE RELLENO APLICAR() vive ahora en motor.js, compartido con el service worker.)


inicializar();
