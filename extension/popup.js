// ============================================================================
//  Lógica del popup: arma el "plan de relleno" para (formulario, marca) y lo
//  inyecta en la pestaña activa con chrome.scripting (MV3). El motor de relleno
//  (función APLICAR) se ejecuta en el contexto de la página del formulario.
// ============================================================================

// Redes cuyos formularios se envían solos (sin captcha). En X/YouTube/LinkedIn hay captcha:
// solo se rellena y captura, el usuario resuelve el captcha y envía.
const REDES_AUTOENVIO_POPUP = ["Facebook", "Instagram", "WhatsApp", "TikTok", "Google"];

// Clave donde vive el interruptor 🧪 MODO PRUEBA. La leen TAMBIÉN background.js (para no
// capturar ni enviar) y las pruebas: por eso está en storage y no en una variable.
const CLAVE_MODO_PRUEBA = "modo_prueba_denuncias";
// Clave del Registro de denuncias (la misma que usan registro.js y background.js).
const CLAVE_REGISTRO_POPUP = "denuncias_registro";

// El botón flotante "📸 Capturar comprobante" NO debe salir mientras uno simplemente
// navega por la red social: solo cuando se ACTIVA la extensión. Abrir este popup en una
// pestaña es justo eso, así que se lo avisamos al content script de esa pestaña.
(async function activar_boton_captura_en_pestana_actual() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { accion: "activarBotonCaptura" }, () => void chrome.runtime.lastError);
  } catch (e) { /* la página no admite content scripts: nada que activar */ }
})();

// El icono puede llevar un "!" porque la última denuncia se quedó a medias, no se rellenó
// nada o la pestaña se salió del formulario (el toast dura 6 s y el usuario suele estar en
// otra pestaña verificando su correo, así que se lo pierde). Abrir el popup significa que ya
// está mirando: el aviso ha cumplido y se quita. Ver pintarAvisoDelIcono en background.js.
(function ensenar_y_limpiar_el_aviso_pendiente() {
  try {
    chrome.storage.local.get(["aviso_denuncia"], (x) => {
      // Se ENSEÑA antes de limpiarlo: el aviso se guarda precisamente porque el toast de la
      // página dura 6 s y el usuario estaba en otra pestaña. Si al abrir el popup no se
      // mostrara, el texto guardado no lo leería nadie y el "!" del icono no explicaría nada.
      try {
        const a = x && x.aviso_denuncia;
        const caja = document.getElementById("estado");
        if (a && a.texto && caja) mostrar_estado("error", escapar_html(String(a.texto)));
      } catch (e) { /* si no se puede pintar, al menos se limpia el icono */ }
      try { chrome.runtime.sendMessage({ accion: "limpiarAvisoDenuncia" }, () => void chrome.runtime.lastError); }
      catch (e) { /* el service worker ya lo limpiará en el siguiente Rellenar */ }
    });
  } catch (e) { /* sin storage no hay aviso que enseñar */ }
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
  // El interruptor se recuerda entre usos: se pinta DESPUES de refrescar_redes(), que es
  // quien escribe el texto del boton principal.
  pintar_modo_prueba(await leer_modo_prueba());
  // Denuncias que se empezaron y quedaron sin contestar: si no se preguntara aqui, se
  // acumularian invisibles (no salen en el Registro y nadie volveria a mirarlas).
  await preguntar_por_denuncias_provisionales();
  // Recordatorio de respaldo: lo ultimo, para que no retrase nada de lo de arriba.
  await pintar_cintillo_de_respaldo();
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
  // El botón principal dice lo que va a pasar de verdad al pulsarlo (y si el modo
  // prueba está encendido, lo dice también aquí: pintar_modo_prueba reescribe el texto).
  $("boton_rellenar").textContent = (tipo === "correo") ? "✉ Generar correo" : "Rellenar formulario";
  if ($("casilla_modo_prueba") && $("casilla_modo_prueba").checked) pintar_modo_prueba(true);
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
$("sel_marca").addEventListener("change", async () => {
  mostrar_caja_de_nuevo_correo(false);
  mostrar_pregunta_de_quitar(false);   // la pregunta era de la marca anterior
  refrescar_correos_de_marca();
  // El Excel se cargó PARA la marca anterior: sus enlaces son publicaciones que
  // copian ESA marca. Dejarlo puesto al cambiar de marca es justo el error que el
  // usuario quiere evitar (denunciar los enlaces de una marca en nombre de otra).
  if (await limpiar_excel_de_un_solo_uso("marca") === "limpiado") {
    mostrar_estado("aviso", "Cambiaste de marca: <b>quité la lista del Excel</b> de la marca anterior " +
      "para que no se cuele en esta denuncia. Carga el Excel de esta marca.");
  }
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

// EL EXCEL ES DE UN SOLO USO. La lista cargada vale para LA denuncia que se está
// haciendo y para ninguna más —sea de prueba o de verdad—: si se quedara, la
// siguiente (a menudo de OTRA marca) se llevaría los mismos enlaces sin que nadie
// lo dijera. Aquí se guarda POR QUÉ desapareció, para poder explicarlo en la línea
// de estado; vive en el storage porque el popup se cierra solo (al abrir el
// formulario en otra pestaña) y la explicación tiene que seguir ahí cuando el
// usuario lo vuelva a abrir.
// Valores: "denuncia" (se completó una denuncia por formulario) · "correo" (se mandó
// el correo, lo escribe correo.js) · "marca" (se cambió de marca).
const CLAVE_AVISO_EXCEL = "aviso_del_excel";
let AVISO_DEL_EXCEL = "";

function texto_del_aviso_del_excel() {
  switch (AVISO_DEL_EXCEL) {
    case "denuncia": return "El Excel ya se usó en esa denuncia y se limpió: carga otro para la siguiente";
    case "correo":   return "El Excel ya se usó en ese correo y se limpió: carga otro para la siguiente";
    case "marca":    return "Cambiaste de marca: quité el Excel de la marca anterior; carga el de esta marca";
    default: return "";
  }
}

// Deja (o borra) la explicación y la repinta. Sin `motivo` se olvida: es lo que hay
// que hacer en cuanto el usuario carga otro Excel o lo quita a mano, porque a partir
// de ahí la frase mentiría.
function poner_aviso_del_excel(motivo) {
  AVISO_DEL_EXCEL = motivo || "";
  pintar_estado_de_enlaces();
  return new Promise((res) => motivo
    ? chrome.storage.local.set({ [CLAVE_AVISO_EXCEL]: motivo }, res)
    : chrome.storage.local.remove([CLAVE_AVISO_EXCEL], res));
}

// UNA sola línea de estado para los enlaces (antes había dos, una por cuadro, y
// ocupaban el doble para decir lo mismo). Dice lo único que importa: qué se va a
// usar en esta denuncia — manda lo escrito a mano y, si no hay nada escrito, la
// lista del Excel. Se guardan los dos conteos porque cada uno se actualiza por su
// lado (al escribir en las cajas y al cargar/quitar el Excel).
let CUENTA_URLS_A_MANO = 0, CUENTA_URLS_EXCEL = 0;

function pintar_estado_de_enlaces() {
  const e = $("estado_urls");
  if (!e) return;
  const aviso = texto_del_aviso_del_excel();
  let t;
  if (CUENTA_URLS_A_MANO > 0) {
    t = CUENTA_URLS_A_MANO + " enlace" + (CUENTA_URLS_A_MANO === 1 ? "" : "s") +
        " a mano: se usa" + (CUENTA_URLS_A_MANO === 1 ? "" : "n") + " est" +
        (CUENTA_URLS_A_MANO === 1 ? "e" : "os") + " (el Excel se ignora)";
  } else if (CUENTA_URLS_EXCEL > 0) {
    t = CUENTA_URLS_EXCEL + " URL" + (CUENTA_URLS_EXCEL === 1 ? "" : "s") + " del Excel: se usa" +
        (CUENTA_URLS_EXCEL === 1 ? "" : "n") + " en esta denuncia";
  } else if (aviso) {
    // Sin enlaces PERO con explicación: se dice por qué ya no está el Excel, en vez
    // de quedarse mudo y dejar creer que la lista se perdió sola.
    t = aviso;
  } else {
    t = "Sin enlaces: escríbelos arriba o carga un Excel";
  }
  // Si además hay algo que contar (enlaces escritos a mano), la explicación se añade
  // en la misma línea: el conteo solo no diría qué pasó con el Excel.
  if (aviso && t !== aviso) t += " · " + aviso;
  e.textContent = t;
  e.title = t;   // la línea se recorta con "…" si no cabe
}

function pintar_estado_urls(n) { CUENTA_URLS_EXCEL = n || 0; pintar_estado_de_enlaces(); }

// Lee las URLs guardadas en storage (array vacío si no hay).
function obtener_urls_guardadas() {
  return new Promise((res) =>
    chrome.storage.local.get([CLAVE_URLS], (x) => res(Array.isArray(x[CLAVE_URLS]) ? x[CLAVE_URLS] : [])));
}

// ---------------------------------------------------------------------------
//  EL EXCEL, DE UN SOLO USO: aquí se quita
// ---------------------------------------------------------------------------
// ÚNICO sitio del popup que borra la lista del Excel. La regla no tiene matices: el
// Excel se agota EN CUANTO SE USA, en cualquier denuncia, de prueba o de verdad. Se
// llama desde cuatro puntos, y cada uno es el momento en que se usó de verdad:
//   1) confirmar_denuncia_provisional(), cuando la denuncia por FORMULARIO deja de
//      ser provisional —no cuando se pulsa Rellenar: hasta que el usuario contesta,
//      la denuncia puede descartarse y el Excel todavía hace falta para repetirla—;
//   2) el final de rellenar() en MODO PRUEBA, donde no hay nada que confirmar (no se
//      da de alta ninguna denuncia, así que nadie va a preguntar): la denuncia de
//      prueba queda completa ahí mismo;
//   3) al GENERAR el correo, en cuanto sus URLs se vuelcan en `email_reporte` y se
//      van a la pestaña del correo. Ahí ya se usaron: no se espera a que se envíe.
//      Eso incluye el caso de generar el correo y no mandarlo nunca —el Excel se
//      gasta igual, porque sus enlaces ya salieron de aquí—;
//   4) el cambio de marca, que es el caso que preocupa al usuario (que el Excel de
//      una marca se cuele en la denuncia de otra).
// (La denuncia por el MENÚ DEL CLIC DERECHO no pasa por aquí: el service worker es
// otro contexto y tiene su propia limpieza, ctxLimpiarExcelDeUnSoloUso en
// background.js, con la misma clave y el mismo aviso.)
// NO se llama al abrir el popup: el popup se cierra solo en cuanto el formulario se
// abre en otra pestaña, así que borrar al abrir dejaría el Excel inservible.
// Devuelve "limpiado" | "no_habia".
async function limpiar_excel_de_un_solo_uso(motivo) {
  const urls = await obtener_urls_guardadas();
  if (!urls.length) return "no_habia";
  await new Promise((res) => chrome.storage.local.remove([CLAVE_URLS], res));
  // La caja del archivo se vacía a propósito: si se quedara con el archivo puesto,
  // volver a elegir ESE MISMO Excel no dispararía el "change" y no se cargaría nada.
  if ($("archivo_urls")) $("archivo_urls").value = "";
  pintar_estado_urls(0);
  await poner_aviso_del_excel(motivo);
  return "limpiado";
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
    // Hay Excel nuevo: la explicación de por qué NO había (se usó, se cambió de
    // marca) ya no vale y tiene que irse, o se quedaría contradiciendo al conteo.
    await poner_aviso_del_excel("");
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
      // Lo quitó el usuario a mano: no hay nada que explicarle, y dejar el aviso de
      // "ya se usó" sería contarle una historia que no es la suya.
      poner_aviso_del_excel("");
      pintar_estado_urls(0);
      mostrar_estado("aviso", "Lista de URLs eliminada.");
    });
  });
}
// Al abrir el popup, el conteo de URLs ya cargadas Y —si el Excel se limpió— la
// explicación de por qué ya no está. AQUÍ NO SE LIMPIA NADA: durante una denuncia el
// popup se cierra (el formulario se abre en otra pestaña) y se vuelve a abrir para
// contestar si quedó bien; si abrirlo borrara el Excel, el Excel no serviría de nada.
chrome.storage.local.get([CLAVE_URLS, CLAVE_AVISO_EXCEL], (x) => {
  AVISO_DEL_EXCEL = typeof x[CLAVE_AVISO_EXCEL] === "string" ? x[CLAVE_AVISO_EXCEL] : "";
  pintar_estado_urls(Array.isArray(x[CLAVE_URLS]) ? x[CLAVE_URLS].length : 0);
});

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
  return await cambiar_el_registro((lista) => registrar_denuncia_en(lista, marca, form, urls));
}

// El cuerpo de arriba, ya DENTRO de la cola: recibe la lista fresca y la muta.
function registrar_denuncia_en(lista, marca, form, urls) {
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
  // SOLO se reutiliza una denuncia que siga siendo PROVISIONAL. Si el usuario ya
  // contesto que si (dejo de ser provisional), esa denuncia esta cerrada: pulsar
  // Rellenar otra vez es una denuncia NUEVA. Sin esto, un segundo Rellenar dentro
  // del minuto devolveria el id de una denuncia ya confirmada y la pregunta se
  // haria sobre ella: decir "No" la borraria del Registro.
  const existente = lista.find((d) =>
    d.estado === "pendiente" && d.provisional === true && d.marca === marca &&
    d.plataforma === plataforma && d.categoria === categoria &&
    (ahora - new Date(d.fecha).getTime()) < VENTANA_ANTIDOBLE_MS);
  if (existente) {
    // Completa lo que faltara (p. ej. si la 1.ª vez aún no había URLs cargadas).
    if (destino && !existente.destino) existente.destino = destino;
    if (url_denunciada && !existente.url_denunciada) existente.url_denunciada = url_denunciada;
    // OJO: si esa denuncia YA se confirmó, aquí NO se vuelve a marcar provisional. Volver
    // a ponerla provisional la sacaría del Registro sin que nadie lo pidiera.
    return { valor: existente.id, extra: { ultima_denuncia_registro: existente.id } };
  }

  // Consecutivo correlativo POR MARCA (máximo existente + 1), igual que registro.js.
  const consecutivo = lista.filter((d) => d.marca === marca)
    .reduce((m, d) => Math.max(m, parseInt(d.consecutivo, 10) || 0), 0) + 1;
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  lista.push({
    id: id, marca: marca, plataforma: plataforma, tipo: tipo, categoria: categoria,
    destino: destino, url_denunciada: url_denunciada, numero_caso: "",
    estado: "pendiente", consecutivo: consecutivo,
    // PROVISIONAL: la fila existe (el comprobante necesita a qué pegarse) pero NO es
    // todavía una denuncia. El Registro no la lista ni la cuenta hasta que el usuario
    // confirme que el formulario se rellenó bien. Ver confirmar_denuncia_provisional().
    provisional: true,
    notas: "", fecha: new Date().toISOString()
  });
  return { valor: id, extra: { ultima_denuncia_registro: id } };
}

// Adjunta a la denuncia el CONTENIDO del correo generado (asunto + cuerpo, en/es),
// para poder VERLO y COPIARLO luego desde el Registro. Se guarda el texto plano
// bilingüe generado; cuando el usuario lo envía desde correo.html, ese archivo lo
// actualiza con el texto FINAL (por si lo editó).
async function guardar_correo_en_denuncia(id, em) {
  if (!id || !em) return;
  await cambiar_el_registro((lista) => {
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d) return { guardar: false };
    d.correo = {
      to: em.to || "", asunto: em.asunto || "", cuerpo: em.cuerpo || "",
      asunto_es: em.asunto_es || "", cuerpo_es: em.cuerpo_es || "",
      enviado: false, fecha: new Date().toISOString()
    };
    return {};
  });
}

// ===========================================================================
//  MODO PRUEBA (🧪) — probar los formularios sin dejar rastro
// ===========================================================================
// Con el modo prueba encendido se rellena el formulario EXACTAMENTE igual que
// siempre, pero: no se da de alta la denuncia, no se guarda comprobante y no se
// envia nada (tampoco en Facebook / Instagram / WhatsApp / TikTok / Google, que
// son las que se envian solas). El interruptor vive en chrome.storage porque el
// service worker tambien lo consulta antes de capturar o enviar: si viviera solo
// en el popup, un bucle de TikTok arrancado en modo prueba enviaria la denuncia
// media hora despues, con el popup ya cerrado.
async function leer_modo_prueba() {
  return await new Promise((res) =>
    chrome.storage.local.get([CLAVE_MODO_PRUEBA], (x) => res(!!(x && x[CLAVE_MODO_PRUEBA]))));
}

// Pinta el estado del interruptor en TODO el popup: la casilla en ambar, el
// parrafo de aviso y el propio boton principal. Que nadie mande una denuncia de
// verdad creyendo que era una prueba, ni al reves.
function pintar_modo_prueba(activo) {
  const fila = $("fila_modo_prueba"), aviso = $("aviso_de_modo_prueba");
  if (fila) fila.classList.toggle("encendido", !!activo);
  if (aviso) aviso.classList.toggle("encendido", !!activo);
  if ($("casilla_modo_prueba")) $("casilla_modo_prueba").checked = !!activo;
  // El boton principal dice lo que va a pasar de verdad al pulsarlo.
  const boton = $("boton_rellenar");
  if (boton) {
    const base = (tipo_de_denuncia() === "correo") ? "✉ Generar correo" : "Rellenar formulario";
    boton.textContent = activo ? "🧪 " + base + " (PRUEBA)" : base;
  }
  // En modo prueba no se guardan comprobantes: el boton de la camara no tiene a que pegarlos.
  const cam = $("boton_capturar");
  if (!cam) return;
  if (activo) {
    cam.disabled = true;
    cam.title = "🧪 Modo prueba: no se guardan comprobantes. Apaga el modo prueba para capturar.";
  } else if (cam.title.indexOf("Modo prueba") >= 0) {
    // Al APAGARLO se devuelve la explicacion de siempre (el boton sigue deshabilitado
    // hasta el proximo Rellenar, como ha sido siempre: es quien lo enciende).
    cam.title = "Adjunta una captura de esta pestaña al comprobante de la denuncia en curso. Atajo: Alt+Shift+S, captura sin abrir este popup (se puede cambiar en chrome://extensions/shortcuts).";
  }
}

if ($("casilla_modo_prueba")) {
  $("casilla_modo_prueba").addEventListener("change", () => {
    const activo = $("casilla_modo_prueba").checked;
    chrome.storage.local.set({ [CLAVE_MODO_PRUEBA]: activo }, () => {
      pintar_modo_prueba(activo);
      mostrar_estado("aviso", activo
        ? "🧪 <b>Modo prueba ENCENDIDO.</b> Se rellenaran los formularios para que los revises, pero " +
          "<b>no se registra la denuncia, no se guarda comprobante y no se envia nada</b>."
        : "✅ <b>Modo prueba APAGADO.</b> Las denuncias vuelven a registrarse, capturarse y enviarse con normalidad.");
    });
  });
}

// ============================================================================
//  💾 RECORDATORIO DE RESPALDO
//
//  Por que existe: TODO lo del usuario (el Registro con sus comprobantes, las
//  marcas, las plataformas propias, la memoria de correos y las plantillas) vive
//  en chrome.storage.local y NO sale nunca de esta computadora. El usuario abrio
//  la extension en una PC nueva y no tenia nada. Ya se puede copiar a un archivo
//  desde la pagina de opciones, pero eso depende de acordarse: este cintillo es
//  el que se acuerda por el.
//
//  Cuando sale (cualquiera de las dos):
//    - han pasado 7 dias o mas desde la ultima copia, o
//    - hay 10 o mas denuncias creadas DESPUES de esa copia.
//  Si nunca se ha exportado y ya hay denuncias en el Registro, sale igual.
//
//  Cuando NO sale: en modo prueba (🧪), mientras dure el "Ahora no" (2 dias) y,
//  por supuesto, cuando la copia esta al dia. No hay ningun "no volver a
//  mostrar": si el usuario lo pospone y sigue acumulando, vuelve a salir.
//
//  Es una linea arriba del todo: no tapa los botones de denunciar, no roba el
//  foco y no abre ninguna ventana (nada de alert()).
// ============================================================================
const CLAVE_ULTIMA_EXPORTACION = "ultima_exportacion";
const CLAVE_RESPALDO_POSPUESTO = "respaldo_pospuesto_hasta";
// Lo escribe la pagina de opciones al importar: si hay apuntes, estos datos
// llegaron de otra computadora (ver el texto "recien_importado").
const CLAVE_TRASPASOS_IMPORTADOS = "traspasos_importados";
const DIAS_SIN_COPIA_PARA_AVISAR = 7;
const DENUNCIAS_SIN_COPIA_PARA_AVISAR = 10;
const DIAS_QUE_CALLA_EL_AHORA_NO = 2;
const MS_DE_UN_DIA = 24 * 60 * 60 * 1000;

// Denuncias creadas DESPUES de la ultima copia. Sin copia, todas.
//  Una denuncia con fecha ilegible NO se cuenta como nueva a proposito: contarla
//  dejaria el cintillo encendido para siempre (ni exportando se apagaria), y de
//  esas ya se encarga la regla de los 7 dias.
function denuncias_sin_respaldar(denuncias, ultima_exportacion) {
  const lista = Array.isArray(denuncias) ? denuncias : [];
  // Admite la fecha en texto (ISO) o ya en milisegundos.
  const corte = (typeof ultima_exportacion === "number")
    ? ultima_exportacion : Date.parse(ultima_exportacion || "");
  if (!isFinite(corte) || !corte) return lista.length;
  return lista.filter((d) => {
    const cuando = Date.parse((d && d.fecha) || "");
    return isFinite(cuando) && cuando > corte;
  }).length;
}

// Decide si toca avisar. Funcion PURA (no toca storage ni el DOM) para poder
// probarla con cualquier fecha: devuelve { mostrar, motivo, nuevas, dias }.
// Tolerancia de reloj: una fecha unos minutos por delante puede ser normal
// (relojes que se ajustan solos); una MUY por delante es un reloj que estuvo mal
// puesto, y no puede callar el aviso durante meses.
const MINUTOS_DE_TOLERANCIA_DE_RELOJ = 5;

function calcular_aviso_de_respaldo(estado, ahora) {
  const e = estado || {};
  const t = Number(ahora) || Date.now();

  // Fecha de la ultima copia, SOLO si es creible. Si quedo en el futuro (reloj
  // adelantado y luego corregido), se trata como si no hubiera respaldo: mejor
  // avisar de mas que callarse meses creyendo que hay copia.
  let ultima = Date.parse(e.ultima_exportacion || "");
  if (!isFinite(ultima) || ultima > t + MINUTOS_DE_TOLERANCIA_DE_RELOJ * 60000) ultima = 0;

  const nuevas = denuncias_sin_respaldar(e.denuncias_registro, ultima);
  const total = Array.isArray(e.denuncias_registro) ? e.denuncias_registro.length : 0;

  // En modo prueba no se registra ni se captura nada: avisar ahi solo estorba.
  if (e.modo_prueba) return { mostrar: false, motivo: "modo_prueba", nuevas: nuevas, dias: 0 };

  // El "Ahora no" tampoco puede pasarse de 2 dias: si esta mas alla, es un reloj
  // que estuvo mal puesto y se descarta.
  let pospuesto = Number(e.respaldo_pospuesto_hasta) || 0;
  if (pospuesto > t + DIAS_QUE_CALLA_EL_AHORA_NO * MS_DE_UN_DIA) pospuesto = 0;
  if (pospuesto > t) return { mostrar: false, motivo: "pospuesto", nuevas: nuevas, dias: 0 };

  if (!ultima) {
    // Nunca se ha hecho copia AQUI: solo molesta si hay algo que perder.
    //  Caso aparte: los datos acaban de llegar de otra computadora (por eso hay
    //  traspasos apuntados y ninguna copia hecha aqui). Es verdad que no tienen
    //  respaldo en esta maquina, pero decirle "nunca has copiado tus datos" a
    //  quien acaba de hacer el traspaso desconcierta: se le dice lo que pasa.
    if (total > 0 && e.hubo_importacion) {
      return { mostrar: true, motivo: "recien_importado", nuevas: nuevas, dias: 0 };
    }
    return { mostrar: total > 0, motivo: "nunca", nuevas: nuevas, dias: 0 };
  }
  const dias = Math.floor((t - ultima) / MS_DE_UN_DIA);
  if (nuevas >= DENUNCIAS_SIN_COPIA_PARA_AVISAR) return { mostrar: true, motivo: "cantidad", nuevas: nuevas, dias: dias };
  if (dias >= DIAS_SIN_COPIA_PARA_AVISAR) return { mostrar: true, motivo: "dias", nuevas: nuevas, dias: dias };
  return { mostrar: false, motivo: "al_dia", nuevas: nuevas, dias: dias };
}

// Que se pierde, en concreto y con el numero de verdad.
function texto_del_aviso_de_respaldo(aviso) {
  const cuantas = aviso.nuevas + (aviso.nuevas === 1 ? " denuncia" : " denuncias");
  if (aviso.motivo === "recien_importado") {
    return "Estos datos llegaron de otra computadora y aqui todavia no tienen copia (" + cuantas +
           "). Haz tu primera copia para protegerlos tambien desde esta.";
  }
  if (aviso.motivo === "nunca") {
    return "Nunca has copiado tus datos a un archivo. Llevas " + cuantas +
           " sin respaldar: si esta computadora falla, se pierden.";
  }
  if (aviso.nuevas > 0) {
    return "Llevas " + cuantas + " sin respaldar. Si esta computadora falla, se pierden.";
  }
  return "Hace " + aviso.dias + (aviso.dias === 1 ? " dia" : " dias") +
         " que no copias tus datos. Si esta computadora falla, se pierden.";
}

async function pintar_cintillo_de_respaldo() {
  const cintillo = $("cintillo_de_respaldo");
  if (!cintillo) return;
  // chrome.storage no lanza excepciones: si la lectura falla, el callback corre
  // igual y solo lo dice chrome.runtime.lastError DENTRO del callback.
  const leido = await new Promise((res) => chrome.storage.local.get(
    [CLAVE_REGISTRO_POPUP, CLAVE_ULTIMA_EXPORTACION, CLAVE_RESPALDO_POSPUESTO, CLAVE_MODO_PRUEBA,
     CLAVE_TRASPASOS_IMPORTADOS],
    (x) => res({ datos: x || {}, error: (chrome.runtime.lastError || {}).message || "" })));

  if (leido.error) {
    // No se puede saber si hay copia ni cuantas denuncias hay: no se inventa un
    // numero, pero TAMPOCO se calla. Que se vea que no se pudo comprobar.
    $("texto_del_cintillo_de_respaldo").textContent =
      "No se pudo comprobar si tienes copia de tus datos (" + leido.error + ").";
    cintillo.style.display = "";
    return;
  }
  const d = leido.datos;
  const aviso = calcular_aviso_de_respaldo({
    denuncias_registro: d[CLAVE_REGISTRO_POPUP],
    ultima_exportacion: d[CLAVE_ULTIMA_EXPORTACION],
    respaldo_pospuesto_hasta: d[CLAVE_RESPALDO_POSPUESTO],
    modo_prueba: !!d[CLAVE_MODO_PRUEBA],
    // Hay traspasos apuntados = estos datos llegaron de otra computadora.
    hubo_importacion: Array.isArray(d[CLAVE_TRASPASOS_IMPORTADOS]) && d[CLAVE_TRASPASOS_IMPORTADOS].length > 0
  }, Date.now());

  if (!aviso.mostrar) { cintillo.style.display = "none"; return; }
  // Por textContent, nunca innerHTML.
  $("texto_del_cintillo_de_respaldo").textContent = texto_del_aviso_de_respaldo(aviso);
  cintillo.style.display = "";
}

if ($("boton_hacer_copia_ahora")) {
  // Se abre la pagina de opciones con el ancla del respaldo para que la seccion
  // quede a la vista: openOptionsPage() no admite ancla, asi que va por getURL.
  $("boton_hacer_copia_ahora").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("opciones.html#respaldo") });
  });
}

if ($("boton_posponer_respaldo")) {
  $("boton_posponer_respaldo").addEventListener("click", () => {
    const hasta = Date.now() + DIAS_QUE_CALLA_EL_AHORA_NO * MS_DE_UN_DIA;
    chrome.storage.local.set({ [CLAVE_RESPALDO_POSPUESTO]: hasta }, () => {
      const error = (chrome.runtime.lastError || {}).message || "";
      $("cintillo_de_respaldo").style.display = "none";
      // Si no se pudo guardar, el aviso volvera a salir la proxima vez. Se dice,
      // para que no parezca que la extension no hace caso.
      if (error) mostrar_estado("aviso", "No se pudo recordar el «Ahora no» (" +
        escapar_html(error) + "): puede que el aviso vuelva a salir.");
    });
  });
}

// ===========================================================================
//  CONFIRMAR ANTES DE GUARDAR EN EL REGISTRO
// ===========================================================================
// Problema que resuelve: la denuncia se daba de alta ANTES de rellenar (el
// comprobante necesita a que fila pegarse), asi que cuando el relleno salia mal
// quedaba una fila vacia en el Registro. Ahora nace PROVISIONAL —el Registro no
// la lista ni la cuenta— y solo deja de serlo cuando el usuario confirma aqui.
// Si dice que no, se borra entera (y con ella su comprobante, que va dentro del
// mismo objeto: `comprobante_img`).

function leer_registro_del_popup() {
  return new Promise((res) =>
    chrome.storage.local.get([CLAVE_REGISTRO_POPUP], (x) =>
      res(Array.isArray(x[CLAVE_REGISTRO_POPUP]) ? x[CLAVE_REGISTRO_POPUP] : [])));
}

// `extra` son claves sueltas que van en el MISMO set (hoy solo
// `ultima_denuncia_registro`): asi la denuncia y el puntero a la denuncia en curso
// nunca quedan a medias, uno escrito y el otro no.
function escribir_registro_del_popup(lista, extra) {
  const aGuardar = Object.assign({ [CLAVE_REGISTRO_POPUP]: lista }, extra || {});
  return new Promise((res) => chrome.storage.local.set(aGuardar, res));
}

// ---------------------------------------------------------------------------
//  GUARDADO EN COLA (read-modify-write, DE UNO EN UNO).
//  Mismo problema y misma solucion que `cola_de_guardado` en registro.js. Aqui
//  hacia falta igual: entre el `get` y el `set` de cada cambio hay saltos
//  asincronos, y en el popup pueden solaparse de verdad —la lista de denuncias
//  sin confirmar tiene un boton por FILA, y cada uno solo deshabilita los suyos,
//  asi que pulsar el ✅ de una y el 🗑️ de otra seguidas lanza dos cambios a la
//  vez—. El segundo leeria la lista ANTES de que el primero escribiera y la
//  pisaria: la denuncia confirmada volveria a estar sin confirmar, o la
//  descartada resucitaria.
//  El read-modify-write (leer siempre lo ULTIMO que hay en el navegador, nunca
//  una copia vieja en memoria) es ademas lo que evita pisar lo que escriban el
//  service worker o la pagina del Registro mientras tanto.
//
//  `cambio(lista)` recibe la lista FRESCA, la muta a su gusto y devuelve
//  { guardar, valor, extra }:  guardar=false -> no se escribe nada (no habia
//  nada que cambiar);  valor -> lo que recibe quien llamo;  extra -> claves
//  sueltas para el mismo set.
// ---------------------------------------------------------------------------
let cola_del_registro = Promise.resolve();

function cambiar_el_registro(cambio) {
  // Se encadena con los DOS manejadores: si un cambio falla, el siguiente se
  // ejecuta igual y la cola no se queda atascada (igual que en registro.js).
  cola_del_registro = cola_del_registro.then(
    () => aplicar_cambio_en_el_registro(cambio),
    () => aplicar_cambio_en_el_registro(cambio)
  );
  return cola_del_registro;
}

async function aplicar_cambio_en_el_registro(cambio) {
  const lista = await leer_registro_del_popup();   // lo ULTIMO que hay guardado
  const r = (await cambio(lista)) || {};
  if (r.guardar === false) return r.valor;
  await escribir_registro_del_popup(lista, r.extra);
  return r.valor;
}

// Denuncias empezadas y aun sin responder, de la mas reciente a la mas antigua.
async function listar_denuncias_provisionales() {
  const lista = await leer_registro_del_popup();
  return lista.filter((d) => d && d.provisional === true)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

// SI: deja de ser provisional y pasa a ser una denuncia normal (pendiente, con su
// comprobante). El consecutivo se RECALCULA aqui sobre las denuncias de verdad de
// esa marca: si se quedara con el que se le puso al crearla, descartar una
// provisional dejaria un hueco en la numeracion del Registro.
// Devuelve "ok" | "no_esta" | "ya_confirmada". Los tres estados hacen falta: el
// panel sigue en pantalla mientras el usuario hace otras cosas, y para cuando
// pulsa, la denuncia puede haber dejado de ser provisional por su cuenta (enviar
// el correo la confirma desde correo.html) o haberse borrado desde el Registro.
// `alConfirmar` (opcional) es lo que la pantalla necesita hacer EN CUANTO la denuncia
// queda confirmada —cerrar la pregunta—, sin esperar a que se agote el Excel. Sin
// esto, el panel se quedaba puesto mientras se limpiaba: un rato más en pantalla sin
// ninguna razón que el usuario pueda ver. La limpieza NO se lanza y se olvida: se
// sigue esperando aquí dentro, solo que después de haber soltado la interfaz.
async function confirmar_denuncia_provisional(id, alConfirmar) {
  const r = await cambiar_el_registro((lista) => {
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d) return { guardar: false, valor: "no_esta" };
    // YA CONFIRMADA: no se toca. Recalcularle el consecutivo aquí le CAMBIARÍA el
    // número en el Registro a una denuncia que ya estaba cerrada.
    if (d.provisional !== true) return { guardar: false, valor: "ya_confirmada" };
    d.consecutivo = lista.filter((x) => x.marca === d.marca && x !== d && x.provisional !== true)
      .reduce((m, x) => Math.max(m, parseInt(x.consecutivo, 10) || 0), 0) + 1;
    delete d.provisional;
    delete d.campos_rellenados;   // datos de ayuda de la pregunta: no son de la denuncia
    delete d.rotulos_no_encontrados;
    return { valor: "ok" };
  });
  // La denuncia ya está confirmada: la pantalla puede reaccionar YA (cerrar la
  // pregunta), antes de lo que viene debajo. Se protege con try: un fallo pintando
  // no puede dejar el Excel sin limpiar.
  if (typeof alConfirmar === "function") { try { alConfirmar(r); } catch (e) {} }
  // AQUÍ la denuncia por formulario QUEDA HECHA, y aquí —en un solo sitio, valga por
  // el panel de la pregunta o por la lista de provisionales pendientes— muere el
  // Excel que se usó en ella. Antes NO: mientras es provisional se puede descartar, y
  // descartarla con el Excel ya borrado dejaría al usuario sin la lista para repetir.
  if (r === "ok") await limpiar_excel_de_un_solo_uso("denuncia");
  return r;
}

// NO: la denuncia se borra del Registro y con ella su comprobante. Que no quede
// rastro. Si era la "denuncia en curso" se suelta tambien esa referencia, para que
// una captura posterior (boton de la camara o el atajo) no se pegue a una fila que
// ya no esta.
// Devuelve "ok" | "no_esta" | "ya_confirmada", igual que confirmar.
// El "ya_confirmada" es lo que impide el peor caso: la denuncia por correo se
// confirma SOLA en cuanto el correo se envía (correo.js), y si el popup seguía
// abierto, pulsar "🗑️ No" borraba una denuncia YA PRESENTADA, con su comprobante
// y su correo dentro. Descartar es para lo que aún no es una denuncia; borrar una
// de verdad se hace desde el Registro, a conciencia.
async function descartar_denuncia_provisional(id) {
  const r = await cambiar_el_registro((lista) => {
    const i = lista.findIndex((x) => String(x.id) === String(id));
    if (i === -1) return { guardar: false, valor: "no_esta" };
    if (lista[i].provisional !== true) return { guardar: false, valor: "ya_confirmada" };
    lista.splice(i, 1);
    return { valor: "ok" };
  });
  if (r !== "ok") return r;
  // Se suelta la referencia a la denuncia en curso: si no, una captura posterior
  // (botón 📸 o el atajo) buscaría una fila que ya no está.
  const g = await new Promise((res) => chrome.storage.local.get(["ultima_denuncia_registro"], res));
  if (g && String(g.ultima_denuncia_registro) === String(id)) {
    await new Promise((res) => chrome.storage.local.remove(["ultima_denuncia_registro"], res));
  }
  return "ok";
}

// Corta el bucle del service worker en la pestana del formulario. Se usa al decir
// que NO: si la denuncia no vale, la extension no debe seguir rellenandola —ni,
// en las redes de autoenvio, acabar mandandola— durante los 30 min siguientes.
async function detener_bucle_en_la_pestana(tabId) {
  if (!tabId) return;
  try { await chrome.runtime.sendMessage({ accion: "detenerAutorelleno", tabId: tabId }); }
  catch (e) { /* si el service worker no responde, no hay bucle vivo que parar */ }
}

// Guarda en la propia denuncia provisional lo que la extension SABE del relleno,
// para poder ensenarselo al usuario tambien si contesta la proxima vez que abra
// el popup (no solo en caliente).
async function anotar_relleno_en_la_provisional(id, hechos, faltan) {
  if (!id) return;
  await cambiar_el_registro((lista) => {
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d || d.provisional !== true) return { guardar: false };
    d.campos_rellenados = hechos;
    d.rotulos_no_encontrados = (faltan || []).slice(0, 12);
    return {};
  });
}

// El resumen honesto de lo que paso, para que el usuario pueda decidir. Devuelve
// HTML ya escapado (se pinta con innerHTML) y si la extension RECOMIENDA no guardar.
function resumen_del_relleno(hechos, faltan, sigue_rellenando) {
  const n = (hechos == null ? 0 : hechos);
  let html = "";
  if (n === 0) {
    html += "⚠ <b>No se reconocio NINGUN campo</b> de esta pagina. Lo mas probable es que la " +
            "denuncia no se haya hecho: <b>lo recomendable es NO guardarla</b>.";
  } else {
    html += "Se rellenaron <b>" + n + "</b> campo(s).";
  }
  if (faltan && faltan.length) {
    html += "<br>No se encontraron: " + escapar_html(faltan.slice(0, 8).join(", ")) +
            (faltan.length > 8 ? " (+" + (faltan.length - 8) + ")" : "") + ".";
  }
  if (sigue_rellenando) {
    html += "<br><br>⏳ <b>La extension SIGUE rellenando este formulario sola</b> (puede tardar hasta " +
            "30 min si estas verificando el correo). <b>Contesta cuando de verdad haya terminado</b>, " +
            "no ahora mismo: puedes cerrar el popup y te lo preguntara la proxima vez que lo abras.";
  }
  return { html: html, recomienda_no_guardar: n === 0 };
}

// Ensena la pregunta de los dos botones para la denuncia recien empezada.
function preguntar_si_se_guarda(id, titulo, resumen, tabId) {
  const panel = $("panel_confirmar_denuncia");
  if (!panel) return;
  // textContent (no innerHTML): el titulo lleva el nombre de la marca y el de la
  // plataforma, que los escribe el usuario.
  $("titulo_confirmar_denuncia").textContent = "¿Se relleno bien? — " + titulo;
  $("detalle_confirmar_denuncia").innerHTML = resumen.html +
    "<br><br>Hasta que contestes, <b>esta denuncia NO esta en el Registro</b>.";
  const si = $("boton_confirmar_guardar"), no = $("boton_confirmar_descartar");
  // Con cero campos el boton recomendado es el de NO: se le quita el verde al "Si"
  // para no empujar a guardar una denuncia que la extension cree fallida.
  si.classList.toggle("sec", resumen.recomienda_no_guardar);
  panel.style.display = "";
  si.onclick = async () => {
    si.disabled = no.disabled = true;
    // La pregunta se cierra EN CUANTO la denuncia queda confirmada; lo que viene
    // después (agotar el Excel que se usó en ella) ya no la deja puesta en pantalla.
    const r = await confirmar_denuncia_provisional(id, () => { panel.style.display = "none"; });
    si.disabled = no.disabled = false;
    mostrar_estado(r === "no_esta" ? "error" : "ok",
      r === "ok" ? "📓 <b>Guardada en el Registro</b> — agrega el N.º de caso cuando la plataforma te lo de."
      : r === "ya_confirmada" ? "📓 <b>Ya estaba guardada</b> en el Registro (se confirmó sola al enviar el correo). No hice nada."
      : "No encontré esa denuncia en el Registro (¿se borró desde otra ventana?).");
  };
  no.onclick = async () => {
    si.disabled = no.disabled = true;
    await detener_bucle_en_la_pestana(tabId);
    const r = await descartar_denuncia_provisional(id);
    panel.style.display = "none";
    si.disabled = no.disabled = false;
    mostrar_estado(r === "ya_confirmada" ? "error" : "aviso",
      r === "ok" ? "🗑️ <b>No se guardó nada.</b> La denuncia y su comprobante se borraron: el Registro queda como estaba."
      // Llegó tarde: mientras el popup seguía abierto, esa denuncia dejó de ser
      // provisional (el correo se envió). NO se borra: ya es una denuncia de verdad.
      : r === "ya_confirmada" ? "⚠ <b>No la borré: ya es una denuncia de verdad.</b> Se confirmó sola al enviarse el correo. " +
          "Si aun así quieres quitarla, hazlo desde <b>📓 Registro</b>."
      : "Esa denuncia ya no estaba en el Registro.");
  };
}

// ---------------------------------------------------------------------------
//  Provisionales que quedaron sin contestar (el popup se cerro antes)
// ---------------------------------------------------------------------------
// Sin esto se acumularian para siempre, invisibles: no salen en el Registro y
// nadie volveria a preguntar por ellas.
async function preguntar_por_denuncias_provisionales() {
  const panel = $("panel_provisionales_pendientes");
  if (!panel) return;
  const pendientes = await listar_denuncias_provisionales();
  if (!pendientes.length) { panel.style.display = "none"; return; }
  $("detalle_provisionales_pendientes").innerHTML =
    "Se empezaron pero no dijiste si el formulario quedo bien, asi que <b>no estan en el " +
    "Registro</b>. ✅ = guardarla · 🗑️ = borrarla.";
  const caja = $("lista_provisionales_pendientes");
  caja.textContent = "";
  pendientes.forEach((d) => caja.appendChild(fila_de_provisional(d)));
  panel.style.display = "";
}

// Una fila de la lista de pendientes. Se construye con el DOM (no con innerHTML):
// el nombre de la marca y el de la plataforma los escribe el usuario en Marcas y
// en "Nueva plataforma...", asi que aqui son datos, nunca marcado.
function fila_de_provisional(d) {
  const fila = document.createElement("div");
  fila.className = "fila_provisional";
  const txt = document.createElement("span");
  txt.className = "texto_de_la_provisional";
  const titulo = document.createElement("b");
  titulo.textContent = String(d.marca || "(sin marca)") + " · " + String(d.plataforma || "");
  txt.appendChild(titulo);
  const detalle = [];
  if (d.categoria) detalle.push(String(d.categoria));
  detalle.push(fecha_corta_de_denuncia(d.fecha));
  if (d.campos_rellenados != null) {
    detalle.push(d.campos_rellenados === 0 ? "⚠ 0 campos" : d.campos_rellenados + " campos");
  }
  txt.appendChild(document.createTextNode(detalle.join(" · ")));
  fila.appendChild(txt);

  const si = document.createElement("button");
  si.type = "button"; si.className = "boton_de_la_provisional si"; si.textContent = "✅";
  si.title = "Guardarla en el Registro";
  const no = document.createElement("button");
  no.type = "button"; no.className = "boton_de_la_provisional no"; no.textContent = "🗑️";
  no.title = "No guardarla (se borra, con su comprobante)";
  const quien = () => escapar_html(String(d.marca || "")) + " · " + escapar_html(String(d.plataforma || ""));
  si.addEventListener("click", async () => {
    si.disabled = no.disabled = true;
    const r = await confirmar_denuncia_provisional(d.id);
    await preguntar_por_denuncias_provisionales();
    mostrar_estado(r === "no_esta" ? "error" : "ok",
      r === "ok" ? "📓 Guardada en el Registro: " + quien() + "."
      : r === "ya_confirmada" ? "📓 " + quien() + " ya estaba guardada. No hice nada."
      : "Esa denuncia ya no está en el Registro: " + quien() + ".");
  });
  no.addEventListener("click", async () => {
    si.disabled = no.disabled = true;
    const r = await descartar_denuncia_provisional(d.id);
    await preguntar_por_denuncias_provisionales();
    mostrar_estado(r === "ya_confirmada" ? "error" : "aviso",
      r === "ok" ? "🗑️ Borrada sin guardar: " + quien() + "."
      : r === "ya_confirmada" ? "⚠ No borré " + quien() + ": ya es una denuncia de verdad. Quítala desde 📓 Registro si quieres."
      : "Esa denuncia ya no está en el Registro: " + quien() + ".");
  });
  fila.appendChild(si); fila.appendChild(no);
  return fila;
}

function fecha_corta_de_denuncia(iso) {
  const f = new Date(iso);
  if (isNaN(f.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(f.getDate()) + "/" + p(f.getMonth() + 1) + " " + p(f.getHours()) + ":" + p(f.getMinutes());
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
  // En modo prueba no hay denuncia en curso: capturar pegaria la foto a la ULTIMA
  // denuncia de verdad y falsearia su comprobante.
  if (await leer_modo_prueba()) {
    mostrar_estado("aviso", "🧪 <b>Modo prueba:</b> no se guardan comprobantes. Apágalo para capturar.");
    return;
  }
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
    // Por la cola, y leyendo la lista FRESCA: entre pedir la foto y guardarla pasan
    // segundos, y en ese hueco la denuncia puede haberse descartado o el Registro
    // puede haber cambiado desde otra ventana.
    const puesta = await cambiar_el_registro((lista) => {
      const ent = lista.find((x) => String(x.id) === String(idDest));
      if (!ent) return { guardar: false, valor: false };
      ent.comprobante_img = reducida;
      return { valor: true };
    });
    if (!puesta) { mostrar_estado("aviso", "No encuentro la denuncia para adjuntar la captura."); return; }
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

// OJO: EL RELLENO SE INYECTA SOLO EN EL MARCO PRINCIPAL, Y ES A PROPÓSITO.
// Hubo la tentación de reintentar en todos los marcos (`executeScript({ allFrames: true })`)
// por si el formulario viniera dentro de un iframe. NO se hace: `executeScript` no "mide",
// EJECUTA Y ESCRIBE. Y como la rama del portal nuevo de Meta se detecta POR DESCARTE
// (`siNoHay: C`), esos pasos correrían en CUALQUIER marco que no tenga los `name` del
// formulario clásico —un iframe de login de Meta o de un tercero, por ejemplo— y ese marco
// recibiría el correo, el teléfono, la dirección postal y la firma de la marca (setNative
// dispara input/change con bubbles:true, así que su JS los lee al instante). Es una fuga de
// datos de la marca a páginas ajenas. Si algún día vuelve a hacer falta, hay que resolverlo
// de otra forma, no inyectando el plan entero en marcos desconocidos.

// Avisos de los datos de la marca que la plantilla de perfil malicioso no pudo poner
// (N.º de registro, clases, perfil oficial de esa red, sitio web). Se escapan porque
// mostrar_estado pinta con innerHTML y el nombre de la marca lo escribe el usuario.
let avisos_de_la_marca = [];
function avisos_de_la_marca_en_html() {
  if (!avisos_de_la_marca.length) return "";
  return "<br><br>ℹ️ " + avisos_de_la_marca.map(escapar_html).join("<br>ℹ️ ");
}

async function rellenar() {
  const formKey = $("sel_form").value;
  const marca = $("sel_marca").value;
  if (!formKey || !marca) { mostrar_estado("aviso", "Elige plataforma, reporte y marca."); return; }

  // MODO PRUEBA: se lee del storage en cada Rellenar (no de la casilla) porque es lo
  // mismo que consultara el service worker cuando le toque capturar o enviar; asi las
  // dos mitades del flujo no pueden discrepar. Con el encendido: se rellena igual, pero
  // no se registra la denuncia, no se guarda comprobante y no se envia nada.
  const modo_prueba = await leer_modo_prueba();
  // La pregunta de la denuncia anterior no debe quedarse encima de la nueva.
  if ($("panel_confirmar_denuncia")) $("panel_confirmar_denuncia").style.display = "none";

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
  // Cuando lo denunciado es un PERFIL que usurpa la marca, la descripcion es la
  // plantilla larga con los datos registrales de la marca y las TRES politicas de esa
  // red; en los demas casos, el texto de siempre. Lo decide JUSTIF.descripcionDeDenuncia
  // (mismo criterio que el menu del clic derecho).
  const lang = form.tipo === "email" ? "en" : "es";
  const desc = window.JUSTIF.descripcionDeDenuncia(form.cat, formKey, redCode, marca, datos, form.red, lang);
  const desc_es = window.JUSTIF.descripcionDeDenuncia(form.cat, formKey, redCode, marca, datos, form.red, "es");
  const justif = desc.texto;
  const justif_es = desc_es.texto;
  // Datos de la marca que la plantilla no pudo poner (N.o de registro, clases, perfil
  // oficial de esa red, sitio web). El texto ya viene reescrito sin ellos: esto es solo
  // el aviso para que el usuario los complete en ⚙ Marcas y la proxima denuncia salga
  // completa. Se juntan los de las dos versiones sin repetir.
  avisos_de_la_marca = [];
  (desc.faltan || []).concat(desc_es.faltan || []).forEach(function (f) {
    if (f && f.aviso && avisos_de_la_marca.indexOf(f.aviso) < 0) avisos_de_la_marca.push(f.aviso);
  });

  // URLs a denunciar: las escritas a mano en el popup si las hay; si no, la lista del
  // Excel. Se usan tanto en los formularios (cajas "Enlace 1..30" / caja única) como en
  // los correos (donde sustituyen al "[ Pega aquí el/los enlace(s) ]").
  const urls = await obtener_urls_para_denuncia();
  const ctx = { marca: marca, datos: datos, justif: justif, justif_es: justif_es, correoPersona: window.CORREO_PERSONA, urls: urls };

  // Redes SIN formulario web (Telegram): se genera un CORREO en una pestaña aparte.
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    // En modo prueba NO se da de alta la denuncia: el correo se genera igual para poder
    // revisar la plantilla, pero el Registro no se toca.
    const idDen = modo_prueba ? null : await registrar_denuncia_auto(marca, form, urls);
    if (idDen) await guardar_correo_en_denuncia(idDen, em); // adjunta el contenido para verlo/copiarlo en el Registro
    $("boton_capturar").disabled = !!modo_prueba;
    // 'from' = correo de contacto de la marca; si es una cuenta de Google Workspace
    // propia, correo.html abre el borrador de Gmail DESDE esa cuenta (envío directo).
    // 'red'/'cat'/'urls' viajan para la MEMORIA DE CORREOS: correo.html propone los
    // destinatarios que ya se usaron para ese mismo sitio y apunta los nuevos.
    // `modo_prueba` viaja con el reporte: correo.html NO debe tocar el Registro en una
    // prueba (si no, escribiria sobre la ULTIMA denuncia de verdad, que es a la que
    // apunta `ultima_denuncia_registro`).
    await new Promise((res) => chrome.storage.local.set({ email_reporte: Object.assign({}, em, {
      from: datos.correo || "", red: form.red || "", cat: form.cat || "", urls: urls || [],
      modo_prueba: !!modo_prueba
    }) }, res));
    // EL EXCEL SE AGOTA AQUÍ, al GENERAR el correo, no al enviarlo: sus URLs ya están
    // volcadas en `email_reporte` (arriba) y se van con el correo a la otra pestaña —ya
    // se usaron—. Va ANTES de abrir la pestaña a propósito: al abrirla el popup se
    // cierra, y lo que quedara después podría no llegar a ejecutarse.
    await limpiar_excel_de_un_solo_uso("correo");
    chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    if (modo_prueba) {
      mostrar_estado("aviso", "🧪 <b>PRUEBA.</b> Correo de " + escapar_html(form.red) + " generado en la pestaña de al lado " +
        "para que lo revises. <b>No se registró denuncia</b> y, si lo envías desde ahí, no quedará anotado en el Registro." +
        avisos_de_la_marca_en_html());
      return;
    }
    // La pregunta se enseña igual, aunque al abrirse la pestaña del correo el popup suele
    // cerrarse: entonces la denuncia se queda PROVISIONAL y se pregunta por ella la
    // próxima vez que se abra el popup (o se confirma sola al enviar el correo).
    preguntar_si_se_guarda(idDen, form.red + " · " + form.nombre,
      { html: "El correo se generó y se abrió en una pestaña aparte. <b>Enviarlo desde ahí la guarda sola</b>; " +
              "si no piensas enviarlo, dile que no y no quedará nada en el Registro.",
        recomienda_no_guardar: false }, null);
    mostrar_estado("ok", "Correo de " + escapar_html(form.red) + " generado: revisa la pestaña, pega el/los enlace(s) y envíalo." +
      avisos_de_la_marca_en_html());
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
  // Se GUARDA el id: es a esta denuncia a la que tiene que ir el comprobante. Resolverlo
  // luego por `ultima_denuncia_registro` seria arriesgado: esa clave la pisa cualquier
  // denuncia nueva que se de de alta mientras tanto.
  // En modo prueba NO se da de alta nada: `id_de_la_denuncia_en_curso` queda en null y
  // con el viajan en null el comprobante y el envio (ver mas abajo).
  const id_de_la_denuncia_en_curso = modo_prueba ? null : await registrar_denuncia_auto(marca, form, urls);
  $("boton_capturar").disabled = !!modo_prueba;

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
  const es_el_mismo_host = (hostTab === raiz_del_formulario) || hostTab.endsWith("." + raiz_del_formulario);
  // IDENTIFICACIÓN POSITIVA: además del host, la RUTA tiene que casar (una prefijo de la
  // otra, por segmentos completos). Con solo el host bastaba estar en help.meta.com con
  // OTRO formulario de Meta abierto (p. ej. Marca Registrada) para que "Derechos de autor"
  // rellenara ESE formulario —incluidas las casillas de declaración BAJO PENA DE PERJURIO—
  // y, con Facebook/Instagram en autoenvío, llegara a enviarse. Si la ruta no casa no pasa
  // nada malo: se sigue el camino de siempre, abrir el formulario en una pestaña aparte.
  // En MINÚSCULAS: hay formularios con mayúsculas en la ruta (TikTok: /legal/report/Copyright)
  // y el sitio puede redirigir a la versión en minúsculas.
  const ruta_de = (u) => { try { return new URL(u).pathname.toLowerCase().replace(/\/+$/, ""); } catch (e) { return ""; } };
  const rutaForm = ruta_de(plan.url), rutaTab = ruta_de(tab.url);
  // UN SOLO SENTIDO: la ruta de la PESTAÑA tiene que empezar por la del FORMULARIO,
  // nunca al revés. Aceptarlo en los dos sentidos dejaba pasar rutas MÁS CORTAS (p. ej.
  // help.meta.com/requests, el panel de solicitudes del usuario) como si fueran el
  // formulario, y entonces se rellenaba y se capturaba esa página.
  const es_la_misma_ruta = !rutaForm
    ? (rutaTab === rutaForm) // formulario en la raíz del sitio: solo vale la raíz
    : (rutaTab === rutaForm || rutaTab.indexOf(rutaForm + "/") === 0);
  const es_el_mismo_sitio = es_el_mismo_host && es_la_misma_ruta;
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
  // En modo prueba el botón flotante NO se enciende: no hay denuncia a la que pegar
  // un comprobante y una captura acabaría en la denuncia anterior.
  if (!modo_prueba) {
    try { await chrome.runtime.sendMessage({ accion: "activarCaptura", tabId: objetivoTabId }); }
    catch (e) { /* si el service worker no responde, queda el botón del popup */ }
  }
  // Se corta cualquier bucle VIEJO que siguiera vivo en esta pestaña (de una denuncia
  // anterior). Si no, ese bucle podría capturar un comprobante o enviar por su cuenta
  // encima de la denuncia nueva, mezclando las dos.
  try { await chrome.runtime.sendMessage({ accion: "detenerAutorelleno", tabId: objetivoTabId }); }
  catch (e) { /* si el service worker no responde, no hay bucle vivo que parar */ }
  mostrar_estado("aviso", "Rellenando…");
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: objetivoTabId }, // SOLO el marco principal (ver el aviso de los iframes, arriba)
      func: APLICAR,
      // {informe:true} => además de rellenar, devuelve el paso a paso y el inventario
      // de campos de la página. Solo en este primer clic (el bucle del service worker
      // NO lo pide: recorrer la página entera en cada repetición sería lento).
      // `urlForm` ANCLA esta pasada DENTRO de la propia página (ver el aviso de la carrera
      // en motor.js). Aquí es donde más falta hace: entre que se valida la pestaña y esta
      // inyección van `chrome.tabs.create`, la espera de carga, un `setTimeout` de 1.800 ms
      // y dos `sendMessage` —una ventana de SEGUNDOS, no de milisegundos—, y esta es la
      // pasada que más escribe. No aborta rellenos legítimos: los dos caminos de arriba
      // terminan en una pestaña que ya cumple host + ruta de `plan.url`, que es la misma
      // condición que comprueba el ancla.
      args: [plan.pasos, { informe: true, urlForm: plan.url }]
    });
    const r = (res && res[0] && res[0].result) || { ok: 0, faltan: [], clicsReales: [] };
    // ¿NO se reconoció NADA? Se mide con `hechos` (campos de verdad escritos/marcados),
    // no con `ok`: `ok` cuenta también el paso del botón "Siguiente" cuando el botón no
    // existe, así que una página SIN formulario devuelve ok=1 y parecería que algo se hizo.
    // (`r.ok === 0` queda de respaldo por si el motor fuera una versión vieja sin `hechos`.)
    const nada = (r.hechos != null ? r.hechos === 0 : r.ok === 0);
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
      // `urlForm` ANCLA los clics REALES a la página del formulario: entre la pasada de
      // arriba y este mensaje la pestaña puede haberse ido, y estos clics son de confianza
      // (van por el depurador) sobre las coordenadas de lo que haya cargado.
      try { await chrome.runtime.sendMessage({ accion: "clicsReales", tabId: objetivoTabId, selectores: r.clicsReales, urlForm: plan.url }); }
      catch (e) { /* si falla el modo avanzado, los radios quedan manuales */ }
    }
    // AUTORRELLENO PERSISTENTE de la 2.ª etapa (TikTok): campos como "Tipo de obra",
    // "Origen", "Descripción", firma, casillas y URL solo aparecen DESPUÉS de verificar el
    // correo. El service worker VIGILA la pestaña con una sonda de solo lectura y, en cuanto el
    // formulario aparece, repite APLICAR + clics reales cada pocos segundos hasta 30 min (o hasta
    // completar), así el usuario NO tiene que volver a pulsar Rellenar. Vive en el
    // service worker (no en el popup ni en un timer de la página), así sobrevive a cerrar el
    // popup y a irse a verificar el correo. Ver autorelleno() en background.js.
    // `red_con_autoenvio` = lo que la RED permite (para explicarlo bien en el estado).
    // `autoEnviable` = lo que va a pasar HOY: en modo prueba, jamas se envia.
    const red_con_autoenvio = REDES_AUTOENVIO_POPUP.indexOf(form.red) >= 0;
    const autoEnviable = red_con_autoenvio && !modo_prueba;
    let insistiendo = false; // true = el service worker se quedó reintentando en segundo plano
    if (plan.autorepetir) {
      // La 1.ª etapa (los desplegables) ya quedó hecha en este primer clic, así que en la
      // repetición van marcados `soloSiVacio`: si siguen respondidos, el paso se salta sin
      // reabrirlos cada pocos segundos; si alguno volvió a "Select" (la página se recargó, la
      // sesión se reinició, el usuario llegó por otro camino), se vuelve a elegir.
      // ANTES se QUITABAN de la repetición, y ahí estaba el fallo: sin el desplegable
      // "¿Qué problema tienes?" TikTok no muestra NI UN campo, así que el bucle se pasaba
      // 30 minutos rellenando una página que nunca iba a enseñar el formulario y el usuario
      // veía Marca comercial TODO EN BLANCO. Se copia el paso (Object.assign) para no tocar
      // el plan original, que se sigue usando para el informe de este mismo clic.
      const pasos2 = plan.pasos.map(function (p) {
        return p.tipo === "dropdown" ? Object.assign({}, p, { soloSiVacio: true }) : p;
      });
      // `urlForm` ANCLA el bucle a ESTA página (igual que en insistirRelleno): si la pestaña
      // se va del formulario, el service worker para en vez de escribir los datos de la marca
      // en otra pantalla y guardarla como comprobante.
      // `modoPrueba` e `idDenuncia` viajan SIEMPRE: el bucle dura hasta 30 min y para
      // entonces el popup ya no existe. Sin `idDenuncia` el bucle resolveria el destino
      // del comprobante por `ultima_denuncia_registro`, que en una prueba apunta a la
      // ULTIMA denuncia de verdad.
      try { await chrome.runtime.sendMessage({ accion: "iniciarAutorelleno", tabId: objetivoTabId, pasos: pasos2, autoenviar: autoEnviable, marca: marca, enviarLabel: plan.enviarLabel, urlForm: plan.url, idDenuncia: id_de_la_denuncia_en_curso, modoPrueba: modo_prueba }); }
      catch (e) { /* si el service worker no responde, el usuario puede pulsar Rellenar otra vez */ }
    } else if (plan.insistir && nada) {
      // No se reconoció NI UN campo y el plan pide INSISTIR (Meta · Derechos de autor):
      // la página aún no ha pintado el formulario (pantalla intermedia del portal nuevo,
      // carga lenta, o el formulario dentro de un iframe). En vez de dar el asunto por
      // terminado —que es lo que hacía "finalizar"—, el service worker reintenta solo
      // hasta 3 min y, cuando aparezca, rellena y sigue el flujo normal.
      insistiendo = true;
      // `urlForm` ANCLA el bucle a ESTA página: si la pestaña se va (Meta redirige al
      // login, el usuario navega), el service worker para en vez de escribir los datos de
      // la marca en otra pantalla y guardarla como comprobante. Ver insistirRelleno.
      try { await chrome.runtime.sendMessage({ accion: "insistirRelleno", tabId: objetivoTabId, pasos: plan.pasos, autoenviar: autoEnviable, marca: marca, enviarLabel: plan.enviarLabel, urlForm: plan.url, idDenuncia: id_de_la_denuncia_en_curso, modoPrueba: modo_prueba }); }
      catch (e) { insistiendo = false; /* si el service worker no responde, el usuario puede pulsar Rellenar otra vez */ }
    } else {
      // Formulario NO progresivo: el service worker captura y (si no hay captcha) envía solo.
      // `urlForm` ANCLA la captura y el envío; `idDenuncia` fija a qué denuncia del Registro
      // va el comprobante (si no, una denuncia dada de alta mientras tanto se lo llevaría).
      try { await chrome.runtime.sendMessage({ accion: "finalizar", tabId: objetivoTabId, marca: marca, autoenviar: autoEnviable, enviarLabel: plan.enviarLabel, faltan: (r.faltan || []), urlForm: plan.url, idDenuncia: id_de_la_denuncia_en_curso, modoPrueba: modo_prueba }); }
      catch (e) { /* el usuario puede enviar a mano */ }
    }
    let html = "✓ <b>" + (r.hechos != null ? r.hechos : r.ok) + "</b> campo(s) rellenado(s)." +
      (objetivoTabId !== tab.id ? " El formulario se abrió en una <b>pestaña aparte</b>." : "");
    // ESCAPADO aunque hoy sea una constante del repo sin HTML: se pinta con innerHTML, y
    // el día que alguien meta un "<" en el texto de ayuda no debe convertirse en marcado.
    if (form.manual) html += "<br><br>📌 " + escapar_html(form.manual);
    // AVISOS del plan: datos de la marca que el formulario exige y no están guardados
    // (p. ej. el enlace de ejemplo a la obra en Derechos de autor). No bloquean el
    // relleno, pero hay que verlos ANTES de enviar.
    // Los avisos del plan SE PINTAN COMO HTML a propósito: llevan <b> para destacar el
    // campo del que hablan. NO se escapan aquí: lo que hay que escapar es el DATO que
    // viene del usuario (el nombre de la marca, su correo, su país), y eso ya se hace en
    // el punto donde se interpola, con `textoSeguro()` de datos/formularios.js. Escapar
    // el aviso entero AQUÍ además de allí lo escapaba dos veces: se veían las etiquetas
    // <b> literales y el nombre de la marca con &amp; y &lt; a la vista del usuario.
    if (plan.avisos && plan.avisos.length) html += "<br><br>⚠ " + plan.avisos.join("<br>⚠ ");
    // Datos de la marca que faltaban para la plantilla de perfil malicioso: la denuncia
    // salió correcta sin ellos, pero conviene completarlos en ⚙ Marcas.
    html += avisos_de_la_marca_en_html();
    // `faltan` sale de los rótulos del PLAN, pero mostrar_estado escribe con innerHTML:
    // se escapa igual que `marca`, para que ningún texto pueda inyectar HTML en el popup.
    if (r.faltan && r.faltan.length) html += "<br><br>No se encontraron (revisa a mano): " + escapar_html(r.faltan.join(", ")) +
      "<br>👉 Si algo quedó vacío, pulsa <b>📋 Copiar informe</b> (abajo) y mándamelo: dice exactamente qué campos vio y con qué rótulo.";
    // CERO campos: antes esto se decía solo si `faltan` traía algo, y justo en el peor caso
    // (no se reconoce NADA, que es cuando el informe hace más falta) el popup se callaba.
    if (nada) html += "<br><br>⚠ <b>No reconocí NINGÚN campo de esta página.</b>" +
      "<br>👉 Pulsa <b>📋 Copiar informe</b> (abajo) y mándamelo: dice exactamente qué vio la extensión en la página.";
    // Y si además el plan pide insistir, se le dice que NO tiene que hacer nada más.
    if (insistiendo) html += "<br><br>⏳ <b>La página todavía no muestra el formulario.</b> " +
      "La extensión <b>seguirá intentándolo sola hasta 3 minutos</b> y lo rellenará en cuanto aparezca: " +
      "<b>no hace falta que vuelvas a pulsar nada</b>. Deja abierta la pestaña del formulario.";
    if (modo_prueba) {
      // Lo que NO va a pasar se dice entero: es justo lo que el usuario necesita saber
      // para no confundir una prueba con una denuncia de verdad.
      html += "<br><br>🧪 <b>MODO PRUEBA.</b> No se registró la denuncia, no se guardó comprobante y " +
        (red_con_autoenvio
          ? "<b>no se enviará nada</b> (esta red normalmente se envía sola: aquí NO)."
          : "<b>no se envió nada</b>.") +
        "<br>Revisa cómo quedó el formulario y <b>ciérralo sin enviar</b>. Apaga 🧪 Modo prueba para denunciar de verdad.";
    } else {
      if (autoEnviable) {
        html += (plan.autorepetir || insistiendo)
          ? "<br><br>🚀 Cuando el formulario quede completo, la extensión <b>capturará el comprobante y lo enviará sola</b> (5 s para cancelar en la pestaña del formulario)."
          : "<br><br>🚀 La extensión está <b>capturando el comprobante y enviando</b> (5 s para cancelar en la pestaña del formulario).";
      } else {
        html += "<br><br>⚠ Este formulario tiene <b>captcha</b>: la extensión capturó el comprobante; <b>resuelve el captcha y pulsa Enviar</b> tú.";
      }
      html += "<br><br>📓 <b>Todavía NO está en el Registro</b>: contesta abajo si el formulario quedó bien.";
    }
    // El color del aviso sigue a `nada`, no a `ok`: con ok=1 por el paso del botón
    // "Siguiente" saldría en verde una página en la que no se reconoció ni un campo.
    mostrar_estado(nada ? "aviso" : "ok", html);

    // LA PREGUNTA. La denuncia existe pero es PROVISIONAL: no está en el Registro hasta
    // que el usuario diga aquí que el formulario se rellenó. Se le enseña lo que la
    // extensión sabe (campos rellenados, rótulos no encontrados) para que pueda decidir,
    // y en los formularios que siguen rellenándose solos (TikTok, o Meta insistiendo) se
    // le dice que conteste cuando de verdad haya acabado, no a los 3 segundos.
    if (!modo_prueba && id_de_la_denuncia_en_curso) {
      const sigue = !!(plan.autorepetir || insistiendo);
      await anotar_relleno_en_la_provisional(id_de_la_denuncia_en_curso,
        (r.hechos != null ? r.hechos : r.ok), r.faltan || []);
      preguntar_si_se_guarda(id_de_la_denuncia_en_curso, form.red + " · " + form.nombre,
        resumen_del_relleno((r.hechos != null ? r.hechos : r.ok), r.faltan || [], sigue), objetivoTabId);
    } else if (modo_prueba) {
      // MODO PRUEBA: aquí se acaba el trayecto. No hay denuncia que confirmar (no se
      // dio de alta ninguna), así que nadie va a preguntar después: la denuncia de
      // prueba queda completa en este punto y el Excel se agota igual que en una de
      // verdad —es de un solo uso, sin excepciones—.
      // Se AÑADE al aviso que ya está pintado (no se reemplaza): lo de arriba dice
      // todo lo que NO pasó por ser una prueba, y esto es justo lo que SÍ pasó.
      if (await limpiar_excel_de_un_solo_uso("denuncia") === "limpiado" && $("estado")) {
        $("estado").innerHTML += "<br><br>📄 <b>La lista del Excel se limpió</b> (se usó en esta denuncia, " +
          "aunque fuera de prueba): carga otra para la siguiente.";
      }
    }
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
