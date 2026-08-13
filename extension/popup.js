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

// Claves que NUNCA se copian a un objeto de marca: un nombre de marca o un campo
// llamado así contaminaría el prototipo de todos los objetos. Mismo guardián que
// usa background.js (se replica en vez de compartir archivo: son tres cargas).
function clave_peligrosa(k) {
  return k === "__proto__" || k === "constructor" || k === "prototype";
}

// Limpia una lista de correos EXACTAMENTE igual que ⚙ Marcas (depurar_lista_de_correos
// de opciones.js): parte los que vengan pegados con coma o punto y coma, quita los
// caracteres de control —un "\r\n" en el remitente permitiría colar cabeceras de correo—,
// recorta, tira los vacíos y quita los repetidos SIN distinguir mayúsculas conservando el
// PRIMERO (para no cambiarle al usuario cuál es el principal).
// Las tres implementaciones tienen que coincidir: cuando aquí no se deduplicaba, una marca
// vieja con el mismo correo repetido con otra capitalización lo mostraba dos veces en el
// desplegable del remitente mientras ⚙ Marcas lo enseñaba una sola vez.
function depurar_correos_de_marca(lista) {
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

// Deja la marca con `correos` (array con TODOS sus correos, el 1.º es el principal) y
// `correo` (string, el principal) siempre coherentes:
//   - Si `correos` NO EXISTE (MARCAS_BASE y las marcas guardadas antes de que se
//     creara el campo), se deriva partiendo `correo` por comas: así el código viejo
//     sigue funcionando y el selector del popup encuentra la lista igual.
//   - Si EXISTE, manda ella aunque esté vacía. Vacía = el usuario borró todos los
//     correos en ⚙ Marcas, y entonces tampoco se hereda el `correo` de la base: si
//     se heredara, el popup y el menú del clic derecho volverían a ofrecer como
//     remitente un correo que el usuario acaba de borrar.
//   - Si la lista tiene datos, el principal es SIEMPRE el primero. Es la regla que
//     enseña ⚙ Marcas (la insignia «Principal» va en la primera fila) y la que aplica
//     al guardar. Antes aquí se respetaba cualquier `correo` que estuviera en la lista,
//     y un registro tocado a mano (o traído de otra parte) con correo = el segundo hacía
//     que la denuncia se firmara con un correo distinto del que el panel presenta como
//     principal. Las tres implementaciones tienen que decidirlo igual.
// En los dos casos la lista pasa por depurar_correos_de_marca (sin repetidos).
function normalizar_correos_de_marca(o) {
  o.correos = depurar_correos_de_marca(Array.isArray(o.correos) ? o.correos : [o.correo]);
  o.correo = o.correos[0] || "";
  return o;
}

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
    if (clave_peligrosa(m)) return;
    const base = window.MARCAS_BASE[m] || {}, g = guardadas[m] || {}, o = Object.assign({}, base);
    Object.keys(g).forEach((k) => {
      if (clave_peligrosa(k)) return;
      // `correos` es una LISTA que el usuario ordena y puede DEJAR VACÍA en ⚙ Marcas.
      // Si el campo está guardado se respeta tal cual: aquí no vale la regla de abajo
      // ("lo vacío no pisa"), porque una lista vacía es una decisión, no un descuido,
      // y con la otra regla un correo borrado reaparecía solo.
      if (k === "correos") { o.correos = g[k]; return; }
      // El resto de campos sí: si el usuario lo dejó vacío se conserva la base (así no
      // se pierde el teléfono/links/etc. agregados después en una copia vieja).
      if (g[k] !== "" && g[k] != null) o[k] = g[k]; else if (!(k in o)) o[k] = g[k];
    });
    todas[m] = o;
  });
  eliminadas.forEach((n) => delete todas[n]);
  // Todas las marcas (base incluida) salen de aquí con la lista `correos` lista para usar.
  Object.keys(todas).forEach((m) => { todas[m] = normalizar_correos_de_marca(Object.assign({}, todas[m])); });
  return todas;
}

const $ = (id) => document.getElementById(id);

function mostrar_estado(clase, html) {
  const e = $("estado");
  e.className = "estado " + clase;
  e.innerHTML = html;
}

// mostrar_estado pinta con innerHTML: TODO dato del usuario (marca, correo escrito…)
// que se meta ahí tiene que pasar antes por aquí.
function escapar_html(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Correo válido: solo los caracteres que de verdad aparecen en una dirección (nada de
// <, >, comillas ni espacios) y como mucho 254 caracteres, el máximo que admite el
// estándar. Cerrado a propósito: lo escrito aquí se guarda y luego se usa como
// remitente en formularios y correos.
const PATRON_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const LARGO_MAXIMO_CORREO = 254;

function correo_valido(c) {
  const t = String(c == null ? "" : c).trim();
  return t.length > 0 && t.length <= LARGO_MAXIMO_CORREO && PATRON_CORREO.test(t);
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

// ===========================================================================
//  CÓMO SE DENUNCIA: "formulario" (se rellena en la página) o "correo" (se genera
//  un borrador de email). Es lo único que decide qué redes y qué reportes se ven:
//  una sola caja, sin cuadros duplicados.
// ===========================================================================
function tipo_de_denuncia() {
  return $("tipo_correo").checked ? "correo" : "formulario";
}

// ¿Este reporte es del tipo elegido? Los de tipo "email" son los que se envían por
// correo; el resto se rellenan en la página del formulario.
function form_es_del_tipo(f, tipo) {
  if (!f) return false;
  return tipo === "correo" ? f.tipo === "email" : f.tipo !== "email";
}

function redes_disponibles(tipo) {
  const reds = [];
  Object.keys(window.FORMULARIOS).forEach((k) => {
    const f = window.FORMULARIOS[k];
    if (!form_es_del_tipo(f, tipo)) return;
    if (reds.indexOf(f.red) < 0) reds.push(f.red);
  });
  return reds.sort((a, b) => a.localeCompare(b, "es"));
}

// ===========================================================================
//  PLATAFORMAS QUE CREA EL USUARIO
//  Para denunciar en un sitio que la extensión todavía no conoce sin esperar a
//  que se programe campo por campo. Se guardan en chrome.storage.local
//  (plataformas_usuario) y datos/formularios.js las convierte en formularios
//  normales, así salen en el desplegable junto a las de fábrica y también en el
//  menú del clic derecho.
// ===========================================================================
// Un listener `async` que revienta deja la promesa rechazada y NO pasa nada visible:
// el botón parece no hacer nada y no hay forma de saber por qué. Esto envuelve al
// manejador para que cualquier error salga en el estado del popup.
// ===========================================================================
//  PERMISO SOBRE EL SITIO DEL FORMULARIO
//  Chrome no deja tocar una página si su dominio no está en el manifest: falla
//  con "Cannot access contents of the page. Extension manifest must request
//  permission to access the respective host" y no se rellena NADA. Los sitios de
//  siempre van en `host_permissions`, pero una plataforma que cree el usuario
//  puede ser cualquiera, así que el manifest declara `optional_host_permissions`
//  y aquí se pide el permiso EN EL MOMENTO, con el clic del usuario (Chrome
//  exige que la petición salga de un gesto suyo). Se acepta una vez por sitio.
// ===========================================================================
function origen_de(url) {
  try { const u = new URL(url); return (u.protocol === "https:" || u.protocol === "http:") ? (u.origin + "/*") : ""; }
  catch (e) { return ""; }
}

function tiene_permiso_para(origen) {
  return new Promise((res) => {
    try { chrome.permissions.contains({ origins: [origen] }, (ok) => res(!!ok && !chrome.runtime.lastError)); }
    catch (e) { res(false); }
  });
}

// Devuelve true si al final hay permiso (ya lo había o el usuario lo acaba de dar).
async function asegurar_permiso_para(url) {
  const origen = origen_de(url);
  if (!origen) return true;                       // no es http(s): que siga el flujo normal
  if (await tiene_permiso_para(origen)) return true;
  const dado = await new Promise((res) => {
    try { chrome.permissions.request({ origins: [origen] }, (ok) => res(!!ok && !chrome.runtime.lastError)); }
    catch (e) { res(false); }
  });
  return dado;
}

function al_pulsar(fn) {
  return function () {
    Promise.resolve()
      .then(fn)
      .catch((e) => mostrar_estado("error", "No se pudo completar: " + escapar_html(e && e.message ? e.message : e)));
  };
}

const CLAVE_PLATAFORMAS = "plataformas_usuario";
const OPCION_NUEVA_PLATAFORMA = "__NUEVA_PLATAFORMA__";
let PLATAFORMAS_DE_USUARIO = {};

function leer_plataformas_de_usuario() {
  return new Promise((res) => chrome.storage.local.get([CLAVE_PLATAFORMAS], (d) => res(d[CLAVE_PLATAFORMAS] || {})));
}

// Carga las plataformas guardadas y las mezcla con FORMULARIOS. Se llama UNA vez
// al abrir el popup y después de cada alta/baja.
async function cargar_plataformas_de_usuario() {
  PLATAFORMAS_DE_USUARIO = await leer_plataformas_de_usuario();
  if (typeof window.APLICAR_PLATAFORMAS_DE_USUARIO === "function") {
    window.APLICAR_PLATAFORMAS_DE_USUARIO(PLATAFORMAS_DE_USUARIO);
  }
}

// ¿Esta red la creó el usuario? (para saber si se puede quitar)
function clave_de_plataforma_de_usuario(red, tipo) {
  return Object.keys(PLATAFORMAS_DE_USUARIO).find((k) => {
    const p = PLATAFORMAS_DE_USUARIO[k] || {};
    const suyoTipo = (p.tipo === "email") ? "correo" : "formulario";
    return p.red === red && suyoTipo === tipo;
  }) || "";
}

// Clave interna única y previsible a partir del nombre ("Mercado Libre" ->
// "u_mercado_libre_form"). Si ya existiera, se le suma un número: nunca se pisa
// una plataforma existente ni, mucho menos, una de fábrica.
function clave_nueva_de_plataforma(nombre, tipo) {
  const base = "u_" + String(nombre).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // sin acentos
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) +
    (tipo === "correo" ? "_mail" : "_form");
  let clave = base, n = 2;
  while (window.FORMULARIOS[clave] || PLATAFORMAS_DE_USUARIO[clave]) { clave = base + "_" + n; n++; }
  return clave;
}

function formularios_de_red(red, tipo) {
  return Object.keys(window.FORMULARIOS)
    .filter((k) => window.FORMULARIOS[k].red === red && form_es_del_tipo(window.FORMULARIOS[k], tipo))
    .map((k) => ({ value: k, texto: window.FORMULARIOS[k].nombre }));
}

let MARCAS = {};

async function inicializar() {
  // Las plataformas del usuario PRIMERO: se mezclan con FORMULARIOS y así salen
  // en el desplegable de redes junto a las de fábrica.
  await cargar_plataformas_de_usuario();
  MARCAS = await obtener_marcas();
  llenar_select($("sel_marca"), Object.keys(MARCAS).sort().map((m) => ({ value: m, texto: m })));
  refrescar_redes();
  refrescar_correos_de_marca();
}

// Repuebla las redes con las del tipo elegido. Si la red que estaba puesta también
// existe en el otro tipo (p. ej. Facebook, que tiene formularios Y correo), se
// conserva: cambiar de "por formulario" a "por correo" no debería mover de sitio.
function refrescar_redes() {
  const tipo = tipo_de_denuncia();
  const antes = $("sel_red").value;
  const redes = redes_disponibles(tipo);
  // La última opción SIEMPRE es dar de alta una plataforma nueva: así se puede
  // denunciar en un sitio que la extensión no trae, sin esperar a programarlo.
  llenar_select($("sel_red"), redes.map((r) => ({ value: r, texto: r }))
    .concat([{ value: OPCION_NUEVA_PLATAFORMA, texto: "➕ Nueva plataforma…" }]));
  if (antes && redes.indexOf(antes) >= 0) $("sel_red").value = antes;
  al_cambiar_de_red();
  // El botón principal dice lo que va a pasar de verdad al pulsarlo.
  $("boton_rellenar").textContent = (tipo === "correo") ? "✉ Generar correo" : "Rellenar formulario";
}

// Al elegir una red: si es "➕ Nueva plataforma…" se abre el panel de alta; si no,
// se listan sus reportes y se decide si esa plataforma se puede quitar.
function al_cambiar_de_red() {
  const esAlta = ($("sel_red").value === OPCION_NUEVA_PLATAFORMA);
  mostrar_panel_de_plataforma(esAlta);
  mostrar_pregunta_de_quitar_plataforma(false);
  $("sel_form").disabled = esAlta;
  if (esAlta) { llenar_select($("sel_form"), [], "(primero crea la plataforma)"); $("boton_quitar_plataforma").disabled = true; pintar_buzon_destino(); return; }
  refrescar_formularios();
  // El 🗑 solo se enciende en las plataformas creadas por el usuario.
  $("boton_quitar_plataforma").disabled = !clave_de_plataforma_de_usuario($("sel_red").value, tipo_de_denuncia());
}

function refrescar_formularios() {
  llenar_select($("sel_form"), formularios_de_red($("sel_red").value, tipo_de_denuncia()));
  pintar_buzon_destino();
}

// Enseña el panel de alta y adapta lo que se pide al modo elegido: por formulario
// hace falta la URL de la página; por correo, el buzón al que se escribe.
function mostrar_panel_de_plataforma(visible) {
  const panel = $("panel_nueva_plataforma");
  panel.style.display = visible ? "" : "none";
  if (!visible) return;
  const porCorreo = (tipo_de_denuncia() === "correo");
  $("rotulo_dato_plataforma").textContent = porCorreo
    ? "Correo(s) de denuncia de la plataforma"
    : "Enlace del formulario de denuncia";
  $("caja_url_plataforma").placeholder = porCorreo ? "abuse@plataforma.com" : "https://…";
  $("nota_de_plataforma").textContent = porCorreo
    ? "Se generará el correo de denuncia con los datos de la marca elegida y los enlaces que hayas puesto arriba. Puedes escribir varios buzones separados por coma."
    : "La extensión abrirá esa página y rellenará por el RÓTULO de cada campo lo que reconozca (nombre, correo, teléfono, país, marca, descripción y enlaces). Lo que no encuentre te lo dirá en «📋 Copiar informe» para poder programarlo bien.";
  $("caja_nombre_plataforma").value = "";
  $("caja_url_plataforma").value = "";
  $("caja_nombre_plataforma").focus();
}

async function guardar_plataforma_nueva() {
  const tipo = tipo_de_denuncia();
  const porCorreo = (tipo === "correo");
  const nombre = String($("caja_nombre_plataforma").value || "").trim();
  const dato = String($("caja_url_plataforma").value || "").trim();

  if (!nombre) { mostrar_estado("aviso", "Ponle un <b>nombre</b> a la plataforma (es el que saldrá en la lista)."); $("caja_nombre_plataforma").focus(); return; }
  if (!dato) {
    mostrar_estado("aviso", porCorreo ? "Falta el <b>correo</b> al que se denuncia en esa plataforma." : "Falta el <b>enlace</b> del formulario de denuncia.");
    $("caja_url_plataforma").focus(); return;
  }
  if (porCorreo) {
    // Se admiten varios buzones separados por coma; todos tienen que ser válidos.
    const lista = depurar_correos_de_marca([dato]);
    if (!lista.length || !lista.every(correo_valido)) {
      mostrar_estado("aviso", "Ese correo no parece válido: <b>" + escapar_html(dato) + "</b>."); $("caja_url_plataforma").focus(); return;
    }
  } else {
    // Solo http(s): un "javascript:" o un "data:" aquí acabaría abriéndose en una pestaña.
    let u = null;
    try { u = new URL(/^https?:\/\//i.test(dato) ? dato : "https://" + dato); } catch (e) { u = null; }
    if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) {
      mostrar_estado("aviso", "Ese enlace no es válido: <b>" + escapar_html(dato) + "</b>. Tiene que empezar por http:// o https://");
      $("caja_url_plataforma").focus(); return;
    }
  }
  if (redes_disponibles(tipo).indexOf(nombre) >= 0) {
    mostrar_estado("aviso", "Ya existe una plataforma llamada «" + escapar_html(nombre) + "» para denunciar por " +
      (porCorreo ? "correo" : "formulario") + ". Elígela en la lista o ponle otro nombre.");
    return;
  }

  const clave = clave_nueva_de_plataforma(nombre, tipo);
  const registro = porCorreo
    ? { red: nombre, nombre: "Denuncia (por correo)", tipo: "email", destino: depurar_correos_de_marca([dato]).join(", ") }
    : { red: nombre, nombre: "Denuncia (formulario)", tipo: "formulario", url: /^https?:\/\//i.test(dato) ? dato : "https://" + dato };

  // Se relee lo guardado antes de escribir, por si otra ventana creó otra mientras tanto.
  const guardadas = await leer_plataformas_de_usuario();
  guardadas[clave] = registro;
  await new Promise((res) => chrome.storage.local.set({ [CLAVE_PLATAFORMAS]: guardadas }, res));

  await cargar_plataformas_de_usuario();
  refrescar_redes();
  $("sel_red").value = nombre;
  al_cambiar_de_red();
  mostrar_estado("ok", "✓ Plataforma «" + escapar_html(nombre) + "» creada. Ya sale también en el menú del clic derecho.");
}

function mostrar_pregunta_de_quitar_plataforma(visible) {
  const fila = $("fila_quitar_plataforma");
  if (visible) {
    const red = $("sel_red").value;
    $("pregunta_de_quitar_plataforma").textContent = "¿Quitar la plataforma " + red + "?";
    fila.style.display = "";
  } else { fila.style.display = "none"; }
}

async function confirmar_quitar_plataforma() {
  const red = $("sel_red").value;
  const clave = clave_de_plataforma_de_usuario(red, tipo_de_denuncia());
  if (!clave) { mostrar_pregunta_de_quitar_plataforma(false); return; }
  const guardadas = await leer_plataformas_de_usuario();
  delete guardadas[clave];
  await new Promise((res) => chrome.storage.local.set({ [CLAVE_PLATAFORMAS]: guardadas }, res));
  // FORMULARIOS es la copia en memoria de esta ventana: se quita también de ahí.
  delete window.FORMULARIOS[clave];
  await cargar_plataformas_de_usuario();
  refrescar_redes();
  mostrar_pregunta_de_quitar_plataforma(false);
  mostrar_estado("ok", "✓ Plataforma «" + escapar_html(red) + "» quitada. Las de fábrica no se tocan.");
}

// Línea pequeña bajo el reporte por correo: a qué buzón sale. Hay reportes cuyo 'destino'
// va vacío a propósito (la plataforma no publica un correo de denuncia): se dice claro
// para que el usuario sepa que tiene que escribir el "Para" al enviar. En modo formulario
// no aplica y la línea no ocupa sitio.
function pintar_buzon_destino() {
  const e = $("linea_buzon_destino");
  if (!e) return;
  if (tipo_de_denuncia() !== "correo") { e.style.display = "none"; e.textContent = ""; return; }
  const f = window.FORMULARIOS[$("sel_form").value];
  const destino = (f && f.destino) ? String(f.destino).trim() : "";
  const t = destino ? ("Va a: " + destino) : "El 'Para' va vacío: lo escribes al enviar";
  e.textContent = t;
  e.title = t;          // la línea se recorta con "…"; el buzón completo, en el title
  e.style.display = "";
}

// ===========================================================================
//  CORREO REMITENTE: desde cuál de los correos de la marca se hace la denuncia.
//  Una marca puede tener varios guardados (⚙ Marcas): `correos` es la lista en
//  orden y el 1.º es el principal. Con el botón "+" se agrega otro sin salir del
//  popup; la caja para escribirlo solo aparece al pulsarlo.
// ===========================================================================
function refrescar_correos_de_marca() {
  const sel = $("sel_correo_marca");
  if (!sel) return;
  const datos = MARCAS[$("sel_marca").value] || {};
  const correos = Array.isArray(datos.correos) ? datos.correos.filter(Boolean) : [];
  if (!correos.length) llenar_select(sel, [], "(sin correo guardado — usa el +)");
  else llenar_select(sel, correos.map((c) => ({ value: c, texto: c })));
  // Sin correos no hay nada que quitar: el 🗑 se apaga en vez de desaparecer, para que
  // el bloque no cambie de tamaño al ir de una marca a otra.
  $("boton_quitar_correo").disabled = !correos.length;
}

// Datos de la marca para la denuncia en curso: una COPIA con el correo elegido en el
// selector. Nunca se modifica MARCAS (el cambio vale solo para esta denuncia).
function datos_de_la_marca(marca) {
  const datos = Object.assign({}, MARCAS[marca] || {});
  const sel = $("sel_correo_marca");
  const elegido = sel ? String(sel.value || "").trim() : "";
  if (elegido) datos.correo = elegido;
  return datos;
}

function mostrar_caja_de_nuevo_correo(visible) {
  $("fila_nuevo_correo").style.display = visible ? "" : "none";
  if (visible) $("caja_nuevo_correo").focus(); else $("caja_nuevo_correo").value = "";
}

// Agrega el correo a ESA marca dentro de `marcas_usuario`, con la misma semántica que
// usa ⚙ Marcas: `correos` es la lista en orden y `correo` es siempre el primero. Se lee
// el diccionario guardado, se toca solo esa marca y se vuelve a escribir entero, para no
// pisar lo que el usuario tenga en las demás.
// La lista de partida sale del registro RECIÉN LEÍDO, no de MARCAS (que es la foto de
// cuando se abrió el popup): así no se deshace lo que ⚙ Marcas u otra ventana hayan
// guardado mientras este popup estaba abierto. Si esa marca todavía no está en
// marcas_usuario se parte del `correo` de MARCAS_BASE (puede traer varios con comas);
// si está y tiene el campo vacío, se respeta vacío (el usuario lo borró).
async function agregar_correo_a_marca(marca, correo) {
  if (clave_peligrosa(marca)) return;
  const g = await new Promise((res) => chrome.storage.local.get(["marcas_usuario"], res));
  const guardadas = g.marcas_usuario || {};
  const previa = guardadas[marca] || {};
  const crudos = Array.isArray(previa.correos)
    ? previa.correos
    : [("correo" in previa) ? previa.correo : (window.MARCAS_BASE[marca] || {}).correo];
  const actuales = depurar_correos_de_marca(crudos);
  if (!actuales.some((c) => c.toLowerCase() === correo.toLowerCase())) actuales.push(correo);
  guardadas[marca] = Object.assign({}, previa, { correos: actuales, correo: actuales[0] || "" });
  await new Promise((res) => chrome.storage.local.set({ marcas_usuario: guardadas }, res));
}

// Quita de ESA marca el correo indicado, con la misma mecánica que agregar: se relee el
// diccionario guardado, se toca solo esa marca y se vuelve a escribir entero. La lista de
// partida sale del registro RECIÉN LEÍDO (no de MARCAS, que es la foto de cuando se abrió
// el popup), así no se deshace lo que ⚙ Marcas u otra ventana guardaran mientras tanto.
async function quitar_correo_de_marca(marca, correo) {
  if (clave_peligrosa(marca)) return;
  const g = await new Promise((res) => chrome.storage.local.get(["marcas_usuario"], res));
  const guardadas = g.marcas_usuario || {};
  const previa = guardadas[marca] || {};
  const crudos = Array.isArray(previa.correos)
    ? previa.correos
    : [("correo" in previa) ? previa.correo : (window.MARCAS_BASE[marca] || {}).correo];
  const quedan = depurar_correos_de_marca(crudos).filter((c) => c.toLowerCase() !== correo.toLowerCase());
  // `correos` se guarda SIEMPRE, aunque quede vacío: una lista vacía es la forma de decir
  // "esta marca ya no tiene correos" y así no se hereda otra vez el de MARCAS_BASE.
  guardadas[marca] = Object.assign({}, previa, { correos: quedan, correo: quedan[0] || "" });
  await new Promise((res) => chrome.storage.local.set({ marcas_usuario: guardadas }, res));
}

// Enseña (o esconde) la fila que pregunta si de verdad se quita el correo elegido.
function mostrar_pregunta_de_quitar(visible) {
  const fila = $("fila_quitar_correo");
  if (visible) {
    const correo = String($("sel_correo_marca").value || "").trim();
    if (!correo) return;
    $("pregunta_de_quitar").textContent = "¿Quitar " + correo + "?";
    $("pregunta_de_quitar").title = correo;   // la línea se recorta con "…"
    fila.style.display = "";
  } else {
    fila.style.display = "none";
  }
}

async function confirmar_quitar_correo() {
  const marca = $("sel_marca").value;
  const correo = String($("sel_correo_marca").value || "").trim();
  if (!marca || !correo) { mostrar_pregunta_de_quitar(false); return; }
  const era_el_principal = ((MARCAS[marca] || {}).correos || [])[0] === correo;
  await quitar_correo_de_marca(marca, correo);
  MARCAS = await obtener_marcas();          // la lista en memoria se queda al día
  refrescar_correos_de_marca();
  mostrar_pregunta_de_quitar(false);
  const quedan = (MARCAS[marca] || {}).correos || [];
  mostrar_estado(quedan.length ? "ok" : "aviso",
    "✓ Quitado <b>" + escapar_html(correo) + "</b> de «" + escapar_html(marca) + "»." +
    (quedan.length
      ? (era_el_principal ? " Ahora el principal es <b>" + escapar_html(quedan[0]) + "</b>." : "")
      : " Esta marca se quedó <b>sin correos</b>: agrégale uno con el + antes de denunciar."));
}

async function guardar_nuevo_correo() {
  const marca = $("sel_marca").value;
  const nuevo = String($("caja_nuevo_correo").value || "").trim();
  if (!marca) { mostrar_estado("aviso", "Elige primero la <b>marca</b> a la que se le agrega el correo."); return; }
  if (!correo_valido(nuevo)) {
    mostrar_estado("aviso", "Ese correo no parece válido: <b>" + escapar_html(nuevo) + "</b>.");
    return;
  }
  const yaEstaba = ((MARCAS[marca] || {}).correos || []).some((c) => c.toLowerCase() === nuevo.toLowerCase());
  await agregar_correo_a_marca(marca, nuevo);
  MARCAS = await obtener_marcas();          // la lista en memoria se queda al día
  refrescar_correos_de_marca();
  $("sel_correo_marca").value = nuevo;      // el nuevo queda elegido para esta denuncia
  mostrar_caja_de_nuevo_correo(false);
  mostrar_estado("ok", yaEstaba
    ? "Ese correo ya estaba en «" + escapar_html(marca) + "»: queda elegido como remitente."
    : "✓ Correo agregado a «" + escapar_html(marca) + "» y elegido como remitente.");
}

$("sel_red").addEventListener("change", al_cambiar_de_red);
$("boton_guardar_plataforma").addEventListener("click", al_pulsar(guardar_plataforma_nueva));
$("boton_cancelar_plataforma").addEventListener("click", () => {
  // Al cancelar se vuelve a la primera plataforma de verdad, no se queda en el alta.
  const redes = redes_disponibles(tipo_de_denuncia());
  $("sel_red").value = redes[0] || "";
  al_cambiar_de_red();
});
$("boton_quitar_plataforma").addEventListener("click", () => mostrar_pregunta_de_quitar_plataforma(true));
$("boton_cancelar_quitar_plataforma").addEventListener("click", () => mostrar_pregunta_de_quitar_plataforma(false));
$("boton_confirmar_quitar_plataforma").addEventListener("click", al_pulsar(confirmar_quitar_plataforma));
// Enter en las cajas del alta = pulsar "Crear plataforma".
["caja_nombre_plataforma", "caja_url_plataforma"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar_plataforma_nueva(); } });
});
$("sel_form").addEventListener("change", pintar_buzon_destino);
$("sel_marca").addEventListener("change", () => {
  mostrar_caja_de_nuevo_correo(false);
  mostrar_pregunta_de_quitar(false);   // la pregunta era de la marca anterior
  refrescar_correos_de_marca();
});
// Cambiar de correo también cierra la pregunta: preguntaba por el de antes.
$("sel_correo_marca").addEventListener("change", () => mostrar_pregunta_de_quitar(false));
$("boton_quitar_correo").addEventListener("click", () => { mostrar_caja_de_nuevo_correo(false); mostrar_pregunta_de_quitar(true); });
$("boton_cancelar_quitar").addEventListener("click", () => mostrar_pregunta_de_quitar(false));
$("boton_confirmar_quitar").addEventListener("click", al_pulsar(confirmar_quitar_correo));
$("tipo_formulario").addEventListener("change", refrescar_redes);
$("tipo_correo").addEventListener("change", refrescar_redes);
$("boton_mostrar_nuevo_correo").addEventListener("click", () => { mostrar_pregunta_de_quitar(false); mostrar_caja_de_nuevo_correo(true); });
$("boton_cancelar_correo").addEventListener("click", () => mostrar_caja_de_nuevo_correo(false));
$("boton_guardar_correo").addEventListener("click", al_pulsar(guardar_nuevo_correo));
// Enter dentro de la caja = pulsar "Agregar" (no hay formulario que enviar).
$("caja_nuevo_correo").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar_nuevo_correo(); } });
$("abrir_opciones").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$("abrir_politicas").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("politicas.html") }); });
$("abrir_plantilla").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("plantilla.html") }); });
$("abrir_registro").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("registro.html") }); });
$("abrir_memoria_correos").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("memoria_correos.html") }); });

$("boton_rellenar").addEventListener("click", rellenar);
$("boton_capturar").addEventListener("click", capturar_pantalla);

// Habilita el botón de captura si ya hay una denuncia en curso de una sesión previa.
chrome.storage.local.get(["ultima_denuncia_registro"], (x) => {
  if (x.ultima_denuncia_registro) $("boton_capturar").disabled = false;
});

// ===========================================================================
//  VERSIÓN de esta PC/navegador. Cada vez que se abre el popup se comprueba
//  contra la publicada: así se ve de un vistazo si este equipo está al día (y
//  si no lo está, la extensión ya se está encargando sola). Ver background.js.
// ===========================================================================
function pintar_version(est) {
  const e = $("txt_version");
  if (!e) return;
  const propia = chrome.runtime.getManifest().version;
  if (!est || !est.publicada) { e.textContent = "v" + propia; e.title = "Versión instalada en este navegador"; return; }
  if (est.hayNueva) {
    e.textContent = "v" + propia + " → v" + est.publicada + " (actualizando…)";
    e.title = "Hay una versión más nueva publicada. La extensión se actualiza sola: " +
      "se aplica en cuanto el actualizador la deje en la carpeta (como mucho, al reiniciar el navegador).";
  } else {
    e.textContent = "v" + propia + " · al día";
    e.title = "Este navegador tiene la última versión publicada.";
  }
}
chrome.storage.local.get("estado_version", (g) => pintar_version(g.estado_version)); // lo último que se sepa
try {
  chrome.runtime.sendMessage({ accion: "comprobarActualizacion" }, (est) => {
    if (chrome.runtime.lastError) return; // el service worker estaba dormido: queda lo pintado
    pintar_version(est);
  });
} catch (e) { /* sin service worker: se queda el valor guardado */ }

// ===========================================================================
//  INFORME DE DIAGNÓSTICO del último relleno: qué campo buscó, con qué rótulo lo
//  reconoció, qué escribió y qué NO encontró. Sirve para saber por qué un campo
//  quedó vacío sin tener que adivinar cómo cambió la web.
// ===========================================================================
function texto_del_informe(g) {
  const d = g && g.ultimo_informe;
  if (!d) return "";
  const L = [];
  L.push("INFORME Denuncias RS v" + (d.version || "?"));
  L.push("Fecha: " + (d.fecha || "") + "   Formulario: " + (d.form || "") + "   Marca: " + (d.marca || ""));
  if (d.inventario) L.push("Página: " + (d.inventario.titulo || "") + "  " + (d.inventario.url || ""));
  L.push("Rellenados: " + (d.ok || 0) + (d.faltan && d.faltan.length ? "   NO ENCONTRADOS: " + d.faltan.join(" | ") : ""));
  L.push("");
  L.push("--- PASO A PASO ---");
  (d.pasos || []).forEach((p) => {
    L.push("[" + p.estado + "] " + p.paso);
    (p.hizo || []).forEach((h) => L.push("      " + h));
  });
  if (d.inventario && d.inventario.campos) {
    L.push("");
    L.push("--- CAMPOS DE LA PÁGINA (rótulo = lo que quedó escrito) ---");
    d.inventario.campos.forEach((c) => L.push("  · " + c.rotulo + " = " + (c.valor || "(vacío)") + (c.bloqueado ? "  [bloqueado por la web]" : "")));
    (d.inventario.opciones || []).forEach((o) => L.push("  " + (o.marcado ? "[x]" : "[ ]") + " " + o.rotulo));
  }
  return L.join("\n");
}
$("copiar_informe").addEventListener("click", async (e) => {
  e.preventDefault();
  const g = await new Promise((r) => chrome.storage.local.get("ultimo_informe", r));
  const txt = texto_del_informe(g);
  if (!txt) { mostrar_estado("aviso", "Todavía no hay informe: pulsa <b>Rellenar formulario</b> una vez y vuelve a intentarlo."); return; }
  try {
    await navigator.clipboard.writeText(txt);
    mostrar_estado("ok", "📋 Informe copiado. Pégalo donde lo quieras revisar (son " + txt.split("\n").length + " líneas).");
  } catch (err) {
    mostrar_estado("aviso", "No pude copiarlo solo. Selecciónalo y cópialo:<br><textarea style='width:100%;height:120px'>" +
      txt.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + "</textarea>");
  }
});

// ===========================================================================
//  Lista de URLs a denunciar (Excel) — se autollenan en las cajas "Enlace 1..30"
// ===========================================================================
const CLAVE_URLS = "urls_denuncia";

// UNA sola línea de estado para los enlaces (antes había dos, una por cuadro, y
// ocupaban el doble para decir lo mismo). Dice lo único que importa: qué se va a
// usar en esta denuncia — manda lo escrito a mano y, si no hay nada escrito, la
// lista del Excel. Se guardan los dos conteos porque cada uno se actualiza por su
// lado (al escribir en las cajas y al cargar/quitar el Excel).
let CUENTA_URLS_A_MANO = 0, CUENTA_URLS_EXCEL = 0;

function pintar_estado_de_enlaces() {
  const e = $("estado_urls");
  if (!e) return;
  let t;
  if (CUENTA_URLS_A_MANO > 0) {
    t = CUENTA_URLS_A_MANO + " enlace" + (CUENTA_URLS_A_MANO === 1 ? "" : "s") +
        " a mano: se usa" + (CUENTA_URLS_A_MANO === 1 ? "" : "n") + " est" +
        (CUENTA_URLS_A_MANO === 1 ? "e" : "os") + " (el Excel se ignora)";
  } else if (CUENTA_URLS_EXCEL > 0) {
    t = CUENTA_URLS_EXCEL + " URL" + (CUENTA_URLS_EXCEL === 1 ? "" : "s") + " del Excel: se usa" +
        (CUENTA_URLS_EXCEL === 1 ? "" : "n") + " en esta denuncia";
  } else {
    t = "Sin enlaces: escríbelos arriba o carga un Excel";
  }
  e.textContent = t;
  e.title = t;   // la línea se recorta con "…" si no cabe
}

function pintar_estado_urls(n) { CUENTA_URLS_EXCEL = n || 0; pintar_estado_de_enlaces(); }

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

// Topes de seguridad del Excel. Sin ellos, un archivo enorme (o una "bomba zip": un .xlsx
// pequeño que al descomprimirse ocupa gigas) deja el popup congelado sin explicar por qué.
const MAXIMO_TAMANO_EXCEL = 10 * 1024 * 1024;  // 10 MB
const MAXIMO_FILAS_EXCEL = 5000;

async function cargar_archivo_urls(file) {
  if (!file) return;
  try {
    if (typeof ExcelJS === "undefined") throw new Error("no se cargó la librería ExcelJS.");
    // Se comprueba ANTES de leerlo: una vez cargado en memoria ya sería tarde.
    if (file.size > MAXIMO_TAMANO_EXCEL) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      mostrar_estado("error", "El Excel pesa " + mb + " MB y el máximo son 10 MB. " +
        "Déjalo con la columna de URLs y borra hojas, imágenes o formatos que no hagan falta.");
      return;
    }
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
    // Se leen como mucho MAXIMO_FILAS_EXCEL filas para que el popup no se quede colgado.
    // Si el archivo tiene más, NO se ocultan: se avisa abajo de cuántas se leyeron y de
    // que quedaron fuera, para que se puedan cargar en una segunda tanda.
    const ultima = Math.min(total, inicio + MAXIMO_FILAS_EXCEL - 1);
    for (let r = inicio; r <= ultima; r++) {
      const url = normalizar_url(valor_celda(hoja.getRow(r).getCell(colUrl)));
      if (!url) continue; // vacío o no parece una URL
      const clave = url.toLowerCase();
      if (vistas[clave]) continue;
      vistas[clave] = true;
      urls.push(url);
    }
    const filas_leidas = Math.max(0, ultima - inicio + 1);
    const filas_de_mas = Math.max(0, total - ultima);

    await new Promise((res) => chrome.storage.local.set({ [CLAVE_URLS]: urls }, res));
    pintar_estado_urls(urls.length);
    if (urls.length === 0) mostrar_estado("aviso", "No se encontraron URLs en el Excel. Revisa que la columna tenga los enlaces de las publicaciones (con o sin https).");
    else if (filas_de_mas > 0) mostrar_estado("aviso", "✓ " + urls.length + " URL(s) cargadas, pero OJO: solo se leyeron las primeras " +
      filas_leidas + " filas de " + total + " (el máximo son 5.000 por vez). Quedaron " + filas_de_mas +
      " filas SIN leer: quítalas de este archivo y vuelve a cargarlo para hacer el resto.");
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

function pintar_estado_urls_manuales(n) { CUENTA_URLS_A_MANO = n || 0; pintar_estado_de_enlaces(); }

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
async function registrar_denuncia_auto(marca, form, urls) {
  const CLAVE = "denuncias_registro";
  const lista = await new Promise((res) =>
    chrome.storage.local.get([CLAVE], (x) => res(Array.isArray(x[CLAVE]) ? x[CLAVE] : [])));
  const plataforma = form.red;
  const tipo = form.tipo === "email" ? "correo" : "formulario";
  const categoria = form.nombre;

  // "Enviado a": el SITIO concreto al que va la denuncia (softonic.com, appbrain.com…).
  // La plataforma sola ("Apps maliciosas") no permite distinguirlas en el Registro.
  const lista_urls = Array.isArray(urls) ? urls.filter(Boolean) : [];
  const dominios = window.CORREOS_DENUNCIA ? window.CORREOS_DENUNCIA.dominios_de(lista_urls) : [];
  const destino = dominios.slice(0, 3).join(", ") + (dominios.length > 3 ? " (+" + (dominios.length - 3) + ")" : "");
  // La URL solo se guarda cuando es UNA (con 30 del Excel no cabe en la columna).
  const url_denunciada = lista_urls.length === 1 ? lista_urls[0] : "";

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
    // Completa lo que faltara (p. ej. si la 1.ª vez aún no había URLs cargadas).
    if (destino && !existente.destino) existente.destino = destino;
    if (url_denunciada && !existente.url_denunciada) existente.url_denunciada = url_denunciada;
    await new Promise((res) =>
      chrome.storage.local.set({ [CLAVE]: lista, ultima_denuncia_registro: existente.id }, res));
    return existente.id;
  }

  // Consecutivo correlativo POR MARCA (máximo existente + 1), igual que registro.js.
  const consecutivo = lista.filter((d) => d.marca === marca)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({
    id: id, marca: marca, plataforma: plataforma, tipo: tipo, categoria: categoria,
    destino: destino, url_denunciada: url_denunciada, numero_caso: "",
    estado: "pendiente", consecutivo: consecutivo,
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
    // El mensaje de error puede traer la URL de la pestaña: se escapa, igual que en el
    // Excel, porque mostrar_estado pinta con innerHTML.
    mostrar_estado("error", "No se pudo capturar esta página: " + escapar_html(e && e.message ? e.message : e));
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
  if (!formKey || !marca) { mostrar_estado("aviso", "Elige plataforma, reporte y marca."); return; }

  const form = window.FORMULARIOS[formKey];
  const datos = datos_de_la_marca(marca);
  // Código de red para la justificación de difamación (fb/ig/tk).
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  // El PAÍS es obligatorio en casi todos los formularios (Meta lo pide como primer campo y
  // sin él no deja avanzar). Se avisa ANTES de rellenar para no dejar al usuario delante de
  // un formulario a medias con un "This field is required" sin explicación.
  if (!pais.trim() && form.tipo !== "email") {
    mostrar_estado("aviso", "La marca «" + escapar_html(marca) + "» no tiene <b>país</b> configurado y el formulario lo exige. " +
      "Ábrela en <b>⚙ Marcas</b>, escribe el país (ej. Ecuador) y vuelve a intentarlo.");
    return;
  }
  // El REMITENTE también es obligatorio: es el correo de contacto que va en el formulario
  // (LinkedIn incluso saca de ahí el nombre y apellido) y el "De:" del correo de denuncia.
  // Desde que una marca puede quedarse SIN correos (se borran todos en ⚙ Marcas), esto
  // podía salir vacío y la denuncia se iba sin forma de contactar a quien denuncia, sin
  // que nadie avisara. Se dice ANTES de rellenar y se recuerda que el "+" está aquí mismo.
  if (!String(datos.correo || "").trim()) {
    mostrar_estado("aviso", "La marca «" + escapar_html(marca) + "» no tiene <b>correo</b> desde el que denunciar. " +
      "Agrégalo con el botón <b>+</b> de «✉️ Denunciar desde» (o en <b>⚙ Marcas</b>) y vuelve a intentarlo.");
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
    const idDen = await registrar_denuncia_auto(marca, form, urls);
    await guardar_correo_en_denuncia(idDen, em); // adjunta el contenido para verlo/copiarlo en el Registro
    $("boton_capturar").disabled = false;
    // 'from' = correo de contacto de la marca; si es una cuenta de Google Workspace
    // propia, correo.html abre el borrador de Gmail DESDE esa cuenta (envío directo).
    // 'red'/'cat'/'urls' viajan para la MEMORIA DE CORREOS: correo.html propone los
    // destinatarios que ya se usaron para ese mismo sitio y apunta los nuevos.
    chrome.storage.local.set({ email_reporte: Object.assign({}, em, {
      from: datos.correo || "", red: form.red || "", cat: form.cat || "", urls: urls || []
    }) }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    });
    mostrar_estado("ok", "Correo de " + form.red + " generado: revisa la pestaña, pega el/los enlace(s) y envíalo." +
      "<br><br>📓 Registrada como pendiente — agrega el N.º de caso en Registro.");
    return;
  }

  const plan = form.construirPlan(ctx);

  // El permiso sobre el sitio del formulario se pide AQUÍ, antes de abrir nada: sin él
  // Chrome no deja escribir en la página y no se rellena ni un campo. Va antes de
  // registrar la denuncia para no dejar una pendiente si el usuario dice que no.
  if (!(await asegurar_permiso_para(plan.url))) {
    mostrar_estado("aviso", "Para rellenar en <b>" + escapar_html(new URL(plan.url).host) + "</b> hace falta " +
      "tu permiso (Chrome lo pide una sola vez por sitio). Vuelve a pulsar <b>Rellenar</b> y acepta el aviso del navegador.");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { mostrar_estado("error", "No encuentro la pestaña activa."); return; }

  // La acción procede: registramos la denuncia como pendiente (anti-duplicado).
  await registrar_denuncia_auto(marca, form, urls);
  $("boton_capturar").disabled = false;

  // ¿Estamos ya en el formulario correcto? Si SÍ, se rellena esta misma pestaña.
  // Si NO, se abre el formulario en una pestaña APARTE en segundo plano (active:false)
  // y se rellena ESA, para NO sacar al usuario de la pestaña que está viendo.
  let objetivoTabId = tab.id;
  const hostForm = new URL(plan.url).host.replace(/^www\./, "");
  const hostTab = (() => { try { return new URL(tab.url).host.replace(/^www\./, ""); } catch (e) { return ""; } })();
  $("boton_rellenar").disabled = true;
  // La pestaña actual solo cuenta como "ya estoy en el formulario" si ES el sitio del
  // formulario o un subdominio suyo. Antes se comparaba por SUBCADENA, y así pasaban webs
  // falsas como "instagram.com.tienda-falsa.ru" o "notfacebook.com": la extensión rellenaba
  // los datos de la marca (correo, teléfono, país, perfiles, N.º de registro) en la página
  // del suplantador, que es justo donde suele estar el usuario al denunciar.
  // (Si no coincide no pasa nada malo: se abre el formulario en una pestaña aparte.)
  const raiz_del_formulario = hostForm.split(".").slice(-2).join(".");
  const es_el_mismo_sitio = (hostTab === raiz_del_formulario) || hostTab.endsWith("." + raiz_del_formulario);
  if (!es_el_mismo_sitio) {
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
      // {informe:true} => además de rellenar, devuelve el paso a paso y el inventario
      // de campos de la página. Solo en este primer clic (el bucle del service worker
      // NO lo pide: recorrer la página entera en cada repetición sería lento).
      args: [plan.pasos, { informe: true }]
    });
    const r = (res && res[0] && res[0].result) || { ok: 0, faltan: [], clicsReales: [] };
    // Se guarda el informe para el botón "📋 Copiar informe" del popup.
    try {
      const inf = r.informe || {};
      chrome.storage.local.set({ ultimo_informe: {
        fecha: new Date().toLocaleString(), version: chrome.runtime.getManifest().version,
        form: form.red + " · " + form.nombre, marca: marca,
        ok: r.ok, faltan: r.faltan || [], pasos: inf.pasos || [], inventario: inf.inventario || null
      } });
    } catch (e) { /* el informe es solo ayuda: nunca debe romper el relleno */ }
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
    // AVISOS del plan: datos de la marca que el formulario exige y no están guardados
    // (p. ej. el enlace de ejemplo a la obra en Derechos de autor). No bloquean el
    // relleno, pero hay que verlos ANTES de enviar.
    if (plan.avisos && plan.avisos.length) html += "<br><br>⚠ " + plan.avisos.join("<br>⚠ ");
    if (r.faltan && r.faltan.length) html += "<br><br>No se encontraron (revisa a mano): " + r.faltan.join(", ") +
      "<br>👉 Si algo quedó vacío, pulsa <b>📋 Copiar informe</b> (abajo) y mándamelo: dice exactamente qué campos vio y con qué rótulo.";
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
    // Igual que arriba: el error de chrome.scripting puede citar la URL de la pestaña.
    mostrar_estado("error", "Error al rellenar: " + escapar_html(e && e.message ? e.message : e) +
      "<br>¿La pestaña es el formulario y está cargado?");
  } finally {
    $("boton_rellenar").disabled = false;
  }
}

// (El MOTOR DE RELLENO APLICAR() vive ahora en motor.js, compartido con el service worker.)


inicializar();
