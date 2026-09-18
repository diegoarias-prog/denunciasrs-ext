// ============================================================================
//  Vista del correo de reporte BILINGÜE. Se ENVÍA la versión en inglés; el
//  español queda como referencia. Botones para copiar cada idioma.
//
//  ENVÍO DIRECTO (API de Gmail): con el botón "Enviar ahora" se autoriza una sola vez
//  (OAuth, permiso gmail.send) y el correo sale sin abrir Gmail, con sus documentos
//  adjuntos. Si el correo de contacto de la marca es de un dominio propio (ver
//  datos/config_gmail.js) el mensaje se firma con él; si es el correo del CLIENTE,
//  Google no deja firmar en su nombre: el From lo pone Gmail con la cuenta autorizada
//  y el correo de la marca viaja en "Reply-To". El botón "Abrir en Gmail" queda como
//  respaldo (abre el borrador para revisar y enviar a mano, pero SIN adjuntos).
// ============================================================================
const $ = (id) => document.getElementById(id);
function aviso(t) { $("aviso").textContent = t; setTimeout(() => ($("aviso").textContent = ""), 3500); }

// Config del envío directo (Client ID + dominios de Workspace).
const CLIENT_ID = (window.CONFIG_GMAIL && window.CONFIG_GMAIL.client_id) || "";
const DOMINIOS_WORKSPACE = (window.CONFIG_GMAIL && window.CONFIG_GMAIL.dominios) || ["seguridadmaxima.net", "securesoft-antifraude.com"];
let REMITENTE = "";  // correo de contacto de la marca (posible cuenta de Workspace)

function dominio_de(correo) {
  const p = (correo || "").split("@");
  return p[1] ? p[1].trim().toLowerCase() : "";
}
function es_workspace(correo) {
  return !!CLIENT_ID && DOMINIOS_WORKSPACE.indexOf(dominio_de(correo)) >= 0;
}

// ---------------------------------------------------------------------------
//  QUIÉN FIRMA EL CORREO
//  Google solo deja enviar desde la cuenta que emitió el token. La mayoría de las
//  marcas tienen como correo de contacto uno de los dominios propios y siguen
//  saliendo desde ahí, igual que siempre. Pero unas cuantas usan el correo del
//  CLIENTE (uspc0008@pichincha.com, protecciondemarca@credix.com…): en esas NO se
//  emite ninguna cabecera From y la rellena Gmail con la cuenta autorizada, que es
//  la única que Google acepta. Adivinarla aquí sería mentir: `login_hint` es solo
//  una sugerencia (el usuario puede elegir otra cuenta en el selector de Google) y
//  la extensión corre en VARIAS PCs con personas distintas.
//  Lo que sí viaja siempre en esos casos es "Reply-To: <correo de la marca>", que es
//  lo que hace que la plataforma le conteste al cliente.
// ---------------------------------------------------------------------------
// Para enviar solo hace falta el client_id: la cuenta la pone el usuario al autorizar.
function hay_envio_directo() { return !!CLIENT_ID; }
// Cuenta propia que se SUGIERE a Google (login_hint) y con la que se abre el borrador.
// Es una sugerencia, nunca un hecho: 1) `cuenta_envio` de datos/config_gmail.js;
// 2) si no, CORREO_PERSONA (datos/marcas.js), la cuenta de quien opera la extensión.
function cuenta_propia_configurada() {
  const cfg = ((window.CONFIG_GMAIL && window.CONFIG_GMAIL.cuenta_envio) || "").trim();
  if (es_workspace(cfg)) return cfg;
  const persona = String(window.CORREO_PERSONA || "").trim();
  return es_workspace(persona) ? persona : "";
}
function cuenta_sugerida() {
  return es_workspace(REMITENTE) ? REMITENTE : cuenta_propia_configurada();
}
// La cabecera From que se EMITE. Solo cuando el correo de la marca es de un dominio
// propio; en los demás casos, vacío: la pone Gmail.
function remite_a_emitir() {
  return es_workspace(REMITENTE) ? REMITENTE : "";
}
// El correo de la marca al que hay que contestar. Vacío cuando el remitente ya es
// el propio (entonces NO se añade ninguna cabecera Reply-To).
function responder_a_la_marca() {
  return (!es_workspace(REMITENTE) && REMITENTE) ? REMITENTE : "";
}

// Datos del reporte que se está redactando (red, categoría y enlaces denunciados).
// Los usa la MEMORIA DE CORREOS para proponer y recordar destinatarios.
const CD = window.CORREOS_DENUNCIA;
let REPORTE = { red: "", cat: "", urls: [], modo_prueba: false };

chrome.storage.local.get("email_reporte", (d) => {
  const e = d.email_reporte || {};
  // `modo_prueba` lo pone el popup: con el encendido NO se dio de alta ninguna denuncia,
  // asi que esta pagina no debe tocar el Registro (ver actualizar_correo_denuncia).
  REPORTE = { red: e.red || "", cat: e.cat || "", urls: Array.isArray(e.urls) ? e.urls : [], modo_prueba: !!e.modo_prueba };
  // El cintillo ambar de MODO PRUEBA: quien abra esta pestana tiene que saber, sin
  // leer nada mas, que esto no va a quedar registrado.
  if (REPORTE.modo_prueba && $("aviso_modo_prueba_correo")) $("aviso_modo_prueba_correo").style.display = "block";
  // Destinos FIJOS de la red (p. ej. TikTok: sus tres buzones de propiedad
  // intelectual). Van SIEMPRE, aunque el correo se hubiera generado antes.
  $("para").value = CD ? CD.unir_correos(e.to || "", CD.fijos_de_red(REPORTE.red)) : (e.to || "");
  pintar_memoria_correos();
  $("asunto_en").value = e.asunto || "";
  // Los cuerpos son editores con formato: el prefill (texto plano con saltos) se
  // convierte a HTML seguro (escapado, con <br>) para verse bien y ser editable.
  $("cuerpo_en").innerHTML = ER.texto_plano_a_html(e.cuerpo || "");
  $("asunto_es").value = e.asunto_es || e.asunto || "";
  $("cuerpo_es").innerHTML = ER.texto_plano_a_html(e.cuerpo_es || e.cuerpo || "");
  REMITENTE = (e.from || "").trim();
  pintar_boton_enviar_directo();
  // Sin "Enviar ahora" no hay forma de adjuntar: hay que decirlo desde el principio.
  avisar_si_no_hay_envio_directo();
});

// Deja el botón y el pie de "De:" diciendo exactamente lo que va a pasar: desde qué
// cuenta sale el correo y, si no es la de la marca, a quién van las respuestas.
function pintar_boton_enviar_directo() {
  const b = $("enviar_directo"), info = $("de_info");
  if (!hay_envio_directo()) { b.style.display = "none"; info.style.display = "none"; return; }
  const remite = remite_a_emitir(), responder = responder_a_la_marca();
  // Con `remite` se puede prometer la cuenta (es la que se pone en el From). Sin él NO:
  // el From lo rellena Gmail con la cuenta que el usuario autorice, y puede ser otra.
  if (remite) {
    b.textContent = "✅ Enviar ahora desde " + remite;
    info.textContent = "✅ Se enviará DESDE " + remite +
      ". Pulsa \"Enviar ahora\" y sale solo (la 1.ª vez, Google pedirá permiso una única vez).";
  } else if (responder) {
    b.textContent = "✅ Enviar ahora (responder a: " + responder + ")";
    info.textContent = "✅ Saldrá desde la cuenta de Google que autorices —Google no deja enviar " +
      "en nombre de " + responder + "— y con «Responder a: " + responder +
      "», así que la respuesta de la plataforma le llega a la marca.";
  } else {
    b.textContent = "✅ Enviar ahora";
    info.textContent = "✅ Saldrá desde la cuenta de Google que autorices.";
  }
  b.style.display = "";
  info.style.display = "";
}

// ---------------------------------------------------------------------------
//  MEMORIA DE CORREOS: qué correo se usó la última vez para denunciar a ESTE
//  mismo sitio (softonic.com, mediafire.com…). Evita tener que buscar otra vez
//  en la web oficial de la plataforma el buzón de denuncias.
//  - Si el "Para" viene vacío, se rellena solo con lo que ya funcionó.
//  - Si viene con algo, los correos recordados se ofrecen con un clic.
//  - Al enviar (o abrir en Gmail / en el cliente de correo) se apunta lo usado.
// ---------------------------------------------------------------------------
function anadir_a_para(correo) {
  if (!CD) return;
  $("para").value = CD.unir_correos($("para").value, correo);
  aviso("✓ " + correo + " añadido al campo \"Para\"");
}

function pintar_memoria_correos() {
  if (!CD || !$("caja_memoria")) return;
  CD.sugerencias(REPORTE.red, REPORTE.urls, (lista, claves) => {
    const caja = $("caja_memoria"), cont = $("lista_memoria");
    cont.textContent = "";
    if (!lista.length) { caja.style.display = "none"; return; }
    // Si el "Para" está vacío, se ponen solos los correos del sitio más probable.
    if (!CD.lista_correos($("para").value).length) {
      const mejor = lista[0].clave;
      const del_sitio = lista.filter((s) => s.clave === mejor).map((s) => s.correo);
      $("para").value = CD.unir_correos(del_sitio);
      $("titulo_memoria").textContent =
        "📒 Puesto solo: correo(s) que ya usaste para denunciar a " + mejor;
    } else {
      $("titulo_memoria").textContent =
        "📒 Correos que ya usaste para " + claves.join(", ");
    }
    // Fichas con un clic para añadir (textContent: nada de HTML desde datos guardados).
    lista.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ficha_correo_memoria";
      b.title = (s.nombre ? s.nombre + " · " : "") + s.clave + (s.nota ? " · " + s.nota : "");
      const t = document.createElement("span");
      t.textContent = s.correo;
      b.appendChild(t);
      const v = document.createElement("span");
      v.className = "veces_memoria";
      v.textContent = s.veces ? "· usado " + s.veces + "×" : "· sugerido";
      b.appendChild(v);
      b.addEventListener("click", () => anadir_a_para(s.correo));
      cont.appendChild(b);
    });
    caja.style.display = "";
  });
}

// Apunta en la memoria los correos que quedaron en el "Para" (los del sitio
// denunciado). Nunca debe bloquear el envío.
function recordar_correos_usados() {
  try {
    if (!CD) return;
    const claves = CD.claves_de(REPORTE.red, REPORTE.urls);
    if (!claves.length) return;
    CD.recordar_uso(claves, $("para").value, { nombre: REPORTE.red || "" });
  } catch (e) { /* la memoria nunca bloquea el envío */ }
}

if ($("abrir_memoria")) {
  $("abrir_memoria").addEventListener("click", (ev) => {
    ev.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("memoria_correos.html") });
  });
}

// Cablea la barra de formato de cada editor (inglés y español).
ER.montar_barra_formato($("cuerpo_en"), {
  negrita: $("fmt_en_negrita"), cursiva: $("fmt_en_cursiva"), subrayado: $("fmt_en_subrayado"),
  quitar: $("fmt_en_quitar"), color: $("color_en")
});
ER.montar_barra_formato($("cuerpo_es"), {
  negrita: $("fmt_es_negrita"), cursiva: $("fmt_es_cursiva"), subrayado: $("fmt_es_subrayado"),
  quitar: $("fmt_es_quitar"), color: $("color_es")
});

// ---------------------------------------------------------------------------
//  DOCUMENTOS ADJUNTOS. Se quedan EN MEMORIA (objetos File): no se guardan en
//  chrome.storage (pesarían demasiado) y desaparecen al cerrar la pestaña.
//  Solo viajan con "✅ Enviar ahora" (API de Gmail); los botones que abren un
//  BORRADOR (mailto y Gmail view=cm) no pueden llevar adjuntos.
//  Tope de 18 MB de archivos ORIGINALES. La cuenta: base64 los infla ~33%, así que
//  18 MB de documentos son un mensaje de ~24,5 MB. El endpoint de Gmail admitiría
//  hasta 35 MB, pero la mayoría de los servidores de correo del mundo rechazan los
//  mensajes de más de 25 MB: con el tope viejo la denuncia salía de Gmail y rebotaba
//  en el buzón de abuso de la plataforma, y un correo que rebota es peor que uno con
//  menos documentos.
// ---------------------------------------------------------------------------
const TOPE_ADJUNTOS_BYTES = 18 * 1024 * 1024;
let DOCUMENTOS_ADJUNTOS = [];

function tamano_legible(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
  return (b / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";
}
function total_adjuntos_bytes() {
  return DOCUMENTOS_ADJUNTOS.reduce((s, f) => s + (f.size || 0), 0);
}

// El nombre del archivo acaba DENTRO de cabeceras MIME y, sobre todo, DELANTE DE LOS
// OJOS de quien recibe la denuncia. Además de no poder romper la cabecera, no puede
// DISFRAZARSE de otra cosa:
//   - saltos de línea y controles C0/C1: inyectarían cabeceras (Bcc, otro Content-Type);
//   - comillas y barra invertida: cerrarían el valor entrecomillado;
//   - controles de dirección Unicode (RTLO y compañía): "evidencia<RTLO>fdp.exe" se
//     muestra como "evidenciaexe.pdf". Es el disfraz clásico de extensión;
//   - "=?": un nombre que ya venga como encoded-word ("=?UTF-8?B?aW52b2ljZS5leGU=?=")
//     es ASCII puro, así que pasaría entero y el cliente del destinatario lo
//     decodificaría, recuperando incluso lo que aquí se acaba de filtrar.
const CONTROLES_DE_DIRECCION = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
function nombre_archivo_seguro(nombre) {
  const limpio = String(nombre == null ? "" : nombre)
    .replace(/[\r\n]+/g, " ")           // nada de saltos: no se inyectan cabeceras
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")  // ni controles C0 ni C1
    .replace(CONTROLES_DE_DIRECCION, "")   // ni marcas bidi/invisibles que lo disfracen
    .replace(/["\\]/g, "'")             // ni comillas/barra que cierren el valor
    .replace(/=\?/g, "=_")              // ni un encoded-word ya cocinado
    .trim();
  // Se recorta por CARACTERES, no por unidades UTF-16: cortar a mitad de un emoji
  // dejaba un suplente suelto y encodeURIComponent reventaba con "URI malformed",
  // así que el usuario veía "No se pudo enviar" sin saber que era por el nombre.
  const caracteres = Array.from(limpio)
    .filter((c) => !(c.length === 1 && c >= "\uD800" && c <= "\uDFFF"))  // suplentes sueltos
    .slice(0, 150);
  return caracteres.join("").trim() || "documento";
}

// --- El nombre en las cabeceras del adjunto (RFC 2231) ---------------------
// RFC 2047 PROHÍBE los encoded-words dentro de un valor entrecomillado, así que un
// nombre con acentos no puede ir como "=?UTF-8?B?...?=". Lo correcto es RFC 2231:
// se emiten las DOS formas —`filename="<respaldo ASCII>"` para los clientes viejos y
// `filename*=UTF-8''<...>` con el nombre de verdad— que es lo compatible.
function nombre_ascii_de_respaldo(nombre) {
  const a = String(nombre).replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "'").trim();
  return a || "documento";
}
// Codifica para RFC 2231: porcentaje sobre UTF-8, incluidos ' * ( ) ! ~, que
// encodeURIComponent deja crudos y ahí no son válidos.
function valor_rfc2231(nombre) {
  return encodeURIComponent(String(nombre))
    .replace(/['()*!~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
// Devuelve los parámetros de nombre listos para pegar tras `filename` / `name`.
function parametros_de_nombre(nombre) {
  const ascii = nombre_ascii_de_respaldo(nombre);
  return {
    ascii: ascii,
    // Solo se añade la forma RFC 2231 si el nombre de verdad no era ya ASCII.
    extendido: ascii === nombre ? "" : "*=UTF-8''" + valor_rfc2231(nombre)
  };
}
// El tipo que declara el navegador NO se copia a ciegas a la cabecera: solo se
// acepta si tiene forma de tipo MIME; si no, application/octet-stream.
function tipo_mime_seguro(tipo) {
  const t = String(tipo == null ? "" : tipo).trim();
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,60}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,60}$/.test(t)
    ? t : "application/octet-stream";
}

// Bytes → base64 en líneas de 76 (MIME).
// Se trocea antes de String.fromCharCode porque pasarle un archivo entero como
// argumentos revienta la pila. Y los saltos de línea se meten AL TROCEAR, no con un
// regex sobre la cadena entera: aquello materializaba otra copia completa del mensaje
// (con 18 MB de documentos, otros 24 MB de golpe) y congelaba la pestaña.
// Cada trozo mide 57 bytes × N: 57 bytes son exactamente 76 caracteres base64, así que
// las líneas salen cortadas solas y cada trozo es múltiplo de 3 (sin relleno a medias).
function bytes_a_base64_mime(bytes) {
  const BYTES_POR_LINEA = 57;
  const TROZO = BYTES_POR_LINEA * 512;   // 29 184 bytes: cabe de sobra en fromCharCode
  const lineas = [];
  for (let i = 0; i < bytes.length; i += TROZO) {
    const bloque = bytes.subarray(i, i + TROZO);
    const b64 = btoa(String.fromCharCode.apply(null, bloque));
    for (let k = 0; k < b64.length; k += 76) lineas.push(b64.slice(k, k + 76));
  }
  return lineas.join("\r\n");
}
function archivo_a_base64_mime(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el documento “" + archivo.name + "”."));
    lector.onload = () => {
      try { resolve(bytes_a_base64_mime(new Uint8Array(lector.result))); }
      catch (e) { reject(e); }
    };
    lector.readAsArrayBuffer(archivo);
  });
}

function pintar_documentos_adjuntos() {
  const caja = $("lista_documentos_adjuntos"), cont = $("fichas_documentos_adjuntos");
  if (!caja || !cont) return;
  cont.textContent = "";
  if (!DOCUMENTOS_ADJUNTOS.length) { caja.style.display = "none"; return; }
  DOCUMENTOS_ADJUNTOS.forEach((f, i) => {
    const fila = document.createElement("div");
    fila.className = "ficha_documento_adjunto";
    const n = document.createElement("span");
    n.className = "nombre_documento_adjunto";
    n.textContent = f.name;              // textContent: el nombre NUNCA como HTML
    fila.appendChild(n);
    const p = document.createElement("span");
    p.className = "peso_documento_adjunto";
    p.textContent = tamano_legible(f.size);
    fila.appendChild(p);
    const q = document.createElement("button");
    q.type = "button";
    q.className = "boton_quitar_documento";
    q.title = "Quitar este documento";
    q.textContent = "✕ Quitar";
    q.addEventListener("click", () => quitar_documento_adjunto(i));
    fila.appendChild(q);
    cont.appendChild(fila);
  });
  const n = DOCUMENTOS_ADJUNTOS.length;
  $("total_documentos_adjuntos").textContent =
    n + (n === 1 ? " documento · " : " documentos · ") +
    tamano_legible(total_adjuntos_bytes()) + " de " + tamano_legible(TOPE_ADJUNTOS_BYTES);
  caja.style.display = "";
}

// Aviso FIJO de la caja de adjuntos. El aviso normal se borra solo a los 3,5 s, y
// "esta tanda no se añadió" es justo lo que NO puede pasar desapercibido: el usuario
// enviaría creyendo que adjuntó una prueba que no viajó. Se queda hasta que añada o
// quite algo.
function poner_aviso_tope(texto) {
  const p = $("aviso_tope_adjuntos");
  if (!p) return;
  p.textContent = texto || "";
  p.style.display = texto ? "" : "none";
}

function quitar_documento_adjunto(i) {
  const f = DOCUMENTOS_ADJUNTOS[i];
  if (!f) return;
  DOCUMENTOS_ADJUNTOS.splice(i, 1);
  poner_aviso_tope("");   // la lista cambió: el aviso fijo ya no describe la situación
  pintar_documentos_adjuntos();
  aviso("✓ Quitado: " + f.name);
}

// Dos documentos son EL MISMO solo si coinciden nombre, tamaño Y fecha de
// modificación. Con nombre + tamaño a secas, dos capturas distintas de la misma
// resolución (o dos PDF de la misma plantilla) se descartaban en silencio y el
// usuario enviaba creyendo que había adjuntado las dos.
function es_el_mismo_documento(a, b) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

// Añade una tanda de archivos a los que ya había (no reemplaza la lista).
// Los repetidos se avisan y no se añaden.
// Si la tanda hace pasar el tope, NO se añade ninguno de la tanda.
function anadir_documentos(archivos) {
  const tanda = Array.from(archivos || []);
  if (!tanda.length) return;
  const admitidos = [], repetidos = [];
  tanda.forEach((f) => {
    const ya = DOCUMENTOS_ADJUNTOS.concat(admitidos).some((x) => es_el_mismo_documento(x, f));
    if (ya) repetidos.push(f.name); else admitidos.push(f);
  });
  if (!admitidos.length) {
    aviso("⚠ Ya estaba" + (repetidos.length === 1 ? "" : "n") + " en la lista: " + repetidos.join(", "));
    return;
  }
  const suma = total_adjuntos_bytes() + admitidos.reduce((s, f) => s + (f.size || 0), 0);
  if (suma > TOPE_ADJUNTOS_BYTES) {
    const texto = "⚠ NO se añadió ninguno de esos " + admitidos.length + " documento" +
      (admitidos.length === 1 ? "" : "s") + ": el total llegaría a " + tamano_legible(suma) +
      " y el tope son " + tamano_legible(TOPE_ADJUNTOS_BYTES) +
      " (sobran " + tamano_legible(suma - TOPE_ADJUNTOS_BYTES) + "). " +
      "Quita algo o manda los que falten en un segundo correo.";
    poner_aviso_tope(texto);   // fijo: esto no se puede escapar en 3 segundos
    aviso("⚠ No se añadió nada: se pasa del tope.");
    return;
  }
  DOCUMENTOS_ADJUNTOS = DOCUMENTOS_ADJUNTOS.concat(admitidos);
  poner_aviso_tope("");
  pintar_documentos_adjuntos();
  aviso("✓ " + admitidos.length + " documento" + (admitidos.length === 1 ? "" : "s") + " añadido" +
    (admitidos.length === 1 ? "" : "s") +
    (repetidos.length ? " · repetido" + (repetidos.length === 1 ? "" : "s") +
      " sin añadir: " + repetidos.join(", ") : ""));
}

// Aviso permanente cuando NO se puede enviar de verdad desde aquí: sin client_id de
// OAuth o sin ninguna cuenta propia configurada. Entonces no hay "Enviar ahora" y por
// tanto no hay forma de adjuntar, y eso hay que decirlo desde el principio.
// Que el correo de la marca sea del cliente ya NO lo dispara: esos reportes también
// se envían, desde la cuenta propia y con "Responder a:" la marca.
function avisar_si_no_hay_envio_directo() {
  const p = $("aviso_adjuntos_sin_envio");
  if (!p) return;
  if (hay_envio_directo()) { p.textContent = ""; p.style.display = "none"; return; }
  p.textContent = "⚠ Aquí no hay ninguna cuenta propia con la que enviar (revisa client_id y " +
    "cuenta_envio en datos/config_gmail.js), así que no aparece «✅ Enviar ahora» y NO se pueden " +
    "adjuntar los documentos al correo: tendrás que adjuntarlos a mano en el borrador que abras " +
    "en Gmail o en tu cliente de correo.";
  p.style.display = "";
}

// Los botones que abren un BORRADOR no pueden llevar adjuntos: se dice claro y
// se deja decidir. Devuelve false si el usuario prefiere no continuar.
function confirmar_borrador_sin_adjuntos() {
  const n = DOCUMENTOS_ADJUNTOS.length;
  if (!n) return true;
  return confirm(
    "Tienes " + n + " documento" + (n === 1 ? "" : "s") + " en la lista de adjuntos, pero este " +
    "botón abre un BORRADOR y los borradores no pueden llevar adjuntos (es una limitación del " +
    "navegador y de Gmail).\n\n" +
    "El documento" + (n === 1 ? "" : "s") + " NO se adjuntará" + (n === 1 ? "" : "n") +
    ": tendrás que arrastrarlo" + (n === 1 ? "" : "s") + " a mano al borrador antes de enviarlo.\n\n" +
    "¿Continuar de todos modos?");
}

if ($("boton_anadir_documentos")) {
  $("boton_anadir_documentos").addEventListener("click", () => $("selector_documentos_adjuntos").click());
}
if ($("selector_documentos_adjuntos")) {
  $("selector_documentos_adjuntos").addEventListener("change", (ev) => {
    anadir_documentos(ev.target.files);
    ev.target.value = "";   // así se puede volver a elegir el MISMO archivo en otra tanda
  });
}

// ---------- Envío directo por la API de Gmail (OAuth implícito) ----------
// Pide un token de acceso con permiso gmail.send. interactivo=false intenta en
// silencio (si ya autorizaste antes); interactivo=true muestra el "Permitir".
function obtener_token(interactivo) {
  return new Promise((resolve, reject) => {
    const redirect = chrome.identity.getRedirectURL();
    let url = "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + encodeURIComponent(CLIENT_ID) +
      "&response_type=token" +
      "&redirect_uri=" + encodeURIComponent(redirect) +
      "&scope=" + encodeURIComponent("https://www.googleapis.com/auth/gmail.send") +
      // El permiso hay que pedirlo para la cuenta que ENVÍA, no para el correo de la
      // marca: con el correo del cliente aquí, el intento silencioso fallaba siempre
      // y Google proponía una cuenta desde la que no se puede enviar.
      "&login_hint=" + encodeURIComponent(cuenta_sugerida() || REMITENTE);
    if (!interactivo) url += "&prompt=none";
    chrome.identity.launchWebAuthFlow({ url: url, interactive: interactivo }, (res) => {
      const err = chrome.runtime.lastError;
      if (err || !res) return reject(new Error(err ? err.message : "sin_respuesta"));
      const frag = res.split("#")[1] || "";
      const p = new URLSearchParams(frag);
      const tok = p.get("access_token");
      if (tok) resolve(tok); else reject(new Error(p.get("error") || "sin_token"));
    });
  });
}
async function token_para_enviar() {
  try { return await obtener_token(false); }   // silencioso (ya autorizado)
  catch (e) { return await obtener_token(true); } // pide permiso 1.ª vez
}

// Quita CR/LF de un encabezado (evita inyección de cabeceras de correo).
function encabezado_seguro(s) { return (s || "").replace(/[\r\n]+/g, " ").trim(); }
// Codifica un encabezado con acentos/símbolos en RFC 2047 (=?UTF-8?B?...?=).
function encabezado_mime(s) {
  s = encabezado_seguro(s);
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
}

// --- Cabeceras de DIRECCIONES (From, To, Reply-To) -------------------------
// No se pueden tratar como un texto cualquiera:
//   - pasarlas tal cual mete UTF-8 crudo en la cabecera si el "Para" lleva acentos,
//     y Gmail devuelve 400;
//   - codificarlas enteras con RFC 2047 es peor: el estándar solo permite codificar
//     el NOMBRE para mostrar, nunca la dirección, así que saldría un Reply-To inválido
//     y las respuestas de la plataforma NO le llegarían a la marca.
// Por eso se parte la lista y en cada "Nombre <buzon@dominio>" se codifica solo el
// nombre, dejando la dirección en ASCII.
function partir_direcciones(s) {
  const fuera = [];
  let actual = "", entrecomillado = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\"") { entrecomillado = !entrecomillado; actual += c; continue; }
    if ((c === "," || c === ";") && !entrecomillado) { fuera.push(actual); actual = ""; continue; }
    actual += c;
  }
  fuera.push(actual);
  return fuera;
}
function nombre_para_mostrar(n) {
  const limpio = n.replace(/^"|"$/g, "").trim();
  if (!limpio) return "";
  if (!/^[\x20-\x7E]*$/.test(limpio)) return encabezado_mime(limpio);  // acentos: RFC 2047
  // ASCII con caracteres especiales: entre comillas, que si no rompen la cabecera.
  return /[",<>:;@\\[\]]/.test(limpio) ? "\"" + limpio.replace(/(["\\])/g, "\\$1") + "\"" : limpio;
}
function encabezado_direcciones(valor) {
  const limpio = encabezado_seguro(valor);
  if (!limpio) return "";
  return partir_direcciones(limpio).map((trozo) => {
    const t = trozo.trim();
    if (!t) return "";
    const m = /^(.*?)\s*<([^<>]*)>$/.exec(t);
    if (!m) return t.replace(/[^\x20-\x7E]/g, "");   // dirección suelta: solo ASCII
    const dir = m[2].replace(/[^\x20-\x7E]/g, "").trim();
    const nombre = nombre_para_mostrar(m[1]);
    return (nombre ? nombre + " " : "") + "<" + dir + ">";
  }).filter(Boolean).join(", ");
}

function a_base64url(str) {
  // UTF-8 seguro: si por algún motivo `str` trae un carácter no-ASCII (p. ej. un
  // nombre con acento en el "Para"), esto evita que btoa lance "Latin1 range".
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Codifica un texto UTF-8 en base64 troceado en líneas de 76 (MIME).
function base64_mime(txt) {
  return btoa(unescape(encodeURIComponent(txt || ""))).replace(/(.{76})/g, "$1\r\n");
}

// Separador MIME irrepetible: el sufijo aleatorio hace imposible que la cadena
// aparezca dentro del contenido (que además viaja en base64) y cierre una parte
// antes de tiempo. Solo caracteres válidos para un boundary.
function boundary_aleatorio(etiqueta) {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
  return "=_denuncia_" + etiqueta + "_" + s + "_=";
}

// Arma la parte multipart/alternative (text/plain + text/html), ambas en base64
// UTF-8. `html` es el HTML YA SANEADO del cuerpo; el texto plano se deriva de él
// preservando saltos. Devuelve el valor de su Content-Type y el cuerpo de la parte,
// para poder usarla TAL CUAL suelta (sin adjuntos) o anidada dentro de un
// multipart/mixed (con adjuntos), sin duplicar código.
function construir_parte_alternativa(html) {
  const htmlSeguro = html || "";
  const plano = ER.html_a_texto_plano(htmlSeguro);
  const bnd = boundary_aleatorio("alt");
  const docHtml =
    "<html><body style=\"font-family:Arial,Helvetica,sans-serif; white-space:pre-wrap;\">" +
    htmlSeguro + "</body></html>";
  return {
    tipo: "multipart/alternative; boundary=\"" + bnd + "\"",
    cuerpo:
      "--" + bnd + "\r\n" +
      "Content-Type: text/plain; charset=\"UTF-8\"\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "\r\n" +
      base64_mime(plano) + "\r\n" +
      "--" + bnd + "\r\n" +
      "Content-Type: text/html; charset=\"UTF-8\"\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "\r\n" +
      base64_mime(docHtml) + "\r\n" +
      "--" + bnd + "--"
  };
}

// Cabeceras del mensaje SIN el From (Reply-To/To/Subject/MIME-Version). El From va
// aparte porque a veces NO se emite: ver `linea_de_remite`.
// `responder_a` solo se pone cuando el mensaje no sale desde el correo de la marca;
// vacío = no se añade la cabecera (el camino de siempre).
function cabeceras_sin_remite(para, asunto, responder_a) {
  return (responder_a ? "Reply-To: " + encabezado_direcciones(responder_a) + "\r\n" : "") +
    "To: " + encabezado_direcciones(para) + "\r\n" +
    "Subject: " + encabezado_mime(asunto) + "\r\n" +
    "MIME-Version: 1.0\r\n";
}
// Con `remite` vacío NO se emite From y lo rellena Gmail con la cuenta que emitió el
// token, que es la única que Google acepta.
function linea_de_remite(remite) {
  return remite ? "From: " + encabezado_direcciones(remite) + "\r\n" : "";
}

// Cabeceras de la parte de un documento. El nombre va en las DOS formas (respaldo
// ASCII + RFC 2231) para que lo entiendan tanto los clientes viejos como los nuevos.
function cabeceras_del_adjunto(bnd, archivo) {
  const n = parametros_de_nombre(nombre_archivo_seguro(archivo.name));
  return "--" + bnd + "\r\n" +
    "Content-Type: " + tipo_mime_seguro(archivo.type) + "; name=\"" + n.ascii + "\"\r\n" +
    "Content-Disposition: attachment; filename=\"" + n.ascii + "\"" +
    (n.extendido ? "; filename" + n.extendido : "") + "\r\n" +
    "Content-Transfer-Encoding: base64\r\n" +
    "\r\n";
}

// Mensaje SIN adjuntos: multipart/alternative a secas. Es pequeño, así que se arma
// como una sola cadena.
function preparar_mensaje_simple(para, asunto, html, responder_a) {
  const alt = construir_parte_alternativa(html);
  return {
    cabeceras: cabeceras_sin_remite(para, asunto, responder_a) +
      "Content-Type: " + alt.tipo + "\r\n" + "\r\n",
    trozos: [alt.cuerpo],
    con_adjuntos: false
  };
}

// Mensaje CON adjuntos: multipart/mixed cuya PRIMERA parte es el mismo
// multipart/alternative de siempre y después una parte por documento.
// Se devuelve TROCEADO y sin el From: así el reintento (que solo cambia esa cabecera)
// reutiliza todo esto en vez de volver a leer y recodificar hasta 18 MB de documentos,
// y el Blob se arma con la lista de trozos sin pegar antes el mensaje entero.
async function preparar_mensaje_con_adjuntos(para, asunto, html, documentos, responder_a) {
  const alt = construir_parte_alternativa(html);
  const bnd = boundary_aleatorio("mix");
  const trozos = ["--" + bnd + "\r\n" + "Content-Type: " + alt.tipo + "\r\n" + "\r\n" +
                  alt.cuerpo + "\r\n"];
  for (const f of documentos) {
    trozos.push(cabeceras_del_adjunto(bnd, f));
    trozos.push(await archivo_a_base64_mime(f));
    trozos.push("\r\n");
  }
  trozos.push("--" + bnd + "--");
  return {
    cabeceras: cabeceras_sin_remite(para, asunto, responder_a) +
      "Content-Type: multipart/mixed; boundary=\"" + bnd + "\"\r\n" + "\r\n",
    trozos: trozos,
    con_adjuntos: true
  };
}

// EL EXCEL NO SE TOCA DESDE AQUÍ. La lista del Excel (`urls_denuncia`) ya se agotó
// antes de que esta pantalla existiera: quien la generó —el popup o el menú del clic
// derecho— volcó sus URLs en `email_reporte` y la limpió en ese mismo momento. Un
// segundo borrado aquí no arreglaría nada y repartiría por dos archivos una regla que
// tiene un solo sitio por camino.

// Guarda en la denuncia del Registro (la ÚLTIMA iniciada, apuntada por
// `ultima_denuncia_registro`) el correo REAL con el texto FINAL editado, para
// poder verlo y copiarlo después. No debe bloquear el envío si algo falla.
// `documentos_enviados` son los adjuntos que DE VERDAD viajaron (solo el envío
// directo puede llevarlos). Se guardan SOLO nombre y tamaño, nunca el contenido.
// `envio` es desde dónde salió y a quién se responde.
// OJO: las dos claves solo se ESCRIBEN si quien llama las pasa. Si se forzaran a un
// valor por omisión, abrir después el borrador en Gmail (que llama sin ellas) borraría
// del Registro la constancia de los documentos que ya se habían enviado, y eso es el
// rastro documental de un procedimiento legal.
async function actualizar_correo_denuncia(enviado, documentos_enviados, envio) {
  try {
    // MODO PRUEBA: el popup generó este correo sin dar de alta ninguna denuncia, así que
    // aquí NO hay a qué escribir. Sin esta salida se escribiría sobre la ÚLTIMA denuncia
    // de verdad (la que apunta `ultima_denuncia_registro`), pisándole su correo.
    if (REPORTE && REPORTE.modo_prueba) return;
    const st = await new Promise((res) =>
      chrome.storage.local.get(["ultima_denuncia_registro", "denuncias_registro"], res));
    const id = st.ultima_denuncia_registro;
    const lista = Array.isArray(st.denuncias_registro) ? st.denuncias_registro : [];
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d) return;
    const cuerpo_en = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
    const cuerpo_es = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_es").innerHTML));
    // "Enviado a" del Registro: el sitio concreto (softonic.com…) o, si no hay
    // enlaces, el dominio de a quién se le escribió. Solo si aún no lo tiene.
    if (!d.destino && CD) {
      const doms = CD.dominios_de(REPORTE.urls);
      const correos = CD.lista_correos($("para").value);
      d.destino = doms.length
        ? doms.slice(0, 3).join(", ")
        : correos.map((c) => c.split("@")[1]).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 2).join(", ");
    }
    const cambios = {
      to: $("para").value || "", asunto: $("asunto_en").value || "", cuerpo: cuerpo_en,
      asunto_es: $("asunto_es").value || "", cuerpo_es: cuerpo_es,
      enviado: !!enviado, fecha: new Date().toISOString()
    };
    if (documentos_enviados !== undefined) {
      // El nombre que se apunta es el SANEADO, que es EXACTAMENTE el que viaja en la
      // cabecera del adjunto (filename*) y el que ve quien recibe el correo: sin
      // controles de dirección ni encoded-words que lo disfracen de otra extensión.
      cambios.adjuntos = Array.from(documentos_enviados)
        .map((f) => ({ nombre: nombre_archivo_seguro(f.name), tamano: f.size }));
    }
    if (envio !== undefined) {
      // Desde qué cuenta salió. `desde_confirmado` dice si es un hecho (se emitió esa
      // cabecera From y Gmail la aceptó) o solo la cuenta que se SUGIRIÓ a Google: si
      // el From lo rellena Gmail, desde aquí no hay forma de saber cuál puso.
      cambios.desde = envio.desde || "";
      cambios.desde_confirmado = !!envio.desde_confirmado;
      cambios.responder_a = envio.responder_a || "";
    }
    d.correo = Object.assign({}, d.correo, cambios);
    // ENVIAR EL CORREO ES LA CONFIRMACIÓN. La denuncia nace PROVISIONAL en el popup (no
    // sale en el Registro hasta que el usuario dice que sí); si el correo se envió, la
    // denuncia se hizo: deja de ser provisional aquí mismo y no hace falta preguntar.
    // El consecutivo se recalcula igual que en popup.js (confirmar_denuncia_provisional):
    // sobre las denuncias de verdad de esa marca, para no dejar huecos en la numeración.
    if (enviado && d.provisional === true) {
      d.consecutivo = lista.filter((x) => x.marca === d.marca && x !== d && x.provisional !== true)
        .reduce((m, x) => Math.max(m, parseInt(x.consecutivo, 10) || 0), 0) + 1;
      delete d.provisional;
      delete d.campos_rellenados;
      delete d.rotulos_no_encontrados;
    }
    await new Promise((res) => chrome.storage.local.set({ denuncias_registro: lista }, res));
  } catch (e) { /* no bloquear por esto */ }
}

// Manda por la API de Gmail un mensaje YA PREPARADO, poniéndole (o no) el From. Es el
// ÚNICO sitio que habla con la red, y recibe el mensaje hecho para que un reintento no
// vuelva a codificar los documentos.
function mandar_por_gmail(token, remite, preparado) {
  if (preparado.con_adjuntos) {
    // CON adjuntos: MIME crudo (multipart/mixed) al endpoint /upload/, que admite
    // hasta 35 MB. No hace falta ningún permiso nuevo: sigue siendo gmail.send.
    // El Blob se arma con la LISTA de trozos: así el mensaje entero no se pega antes
    // en una cadena de decenas de MB.
    const partes = [linea_de_remite(remite), preparado.cabeceras].concat(preparado.trozos);
    return fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "message/rfc822" },
      body: new Blob(partes, { type: "message/rfc822" })
    });
  }
  // SIN adjuntos: el camino de siempre (JSON con el raw en base64url).
  const raw = a_base64url(linea_de_remite(remite) + preparado.cabeceras + preparado.trozos.join(""));
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: raw })
  });
}
// El mensaje de error que devuelve Gmail (consume el cuerpo de la respuesta).
async function detalle_del_error(r) {
  try { const j = await r.json(); return (j.error && j.error.message) || ""; } catch (e) { return ""; }
}

async function enviar_directo() {
  if (!hay_envio_directo()) {
    aviso("⚠ El envío directo no está configurado: falta el client_id de OAuth en datos/config_gmail.js.");
    return;
  }
  const remite = remite_a_emitir();          // vacío = el From lo pone Gmail
  const responder_a = responder_a_la_marca();
  const para = $("para").value.trim();
  if (!para) { aviso("⚠ Falta el correo del destinatario (campo \"Para\")."); return; }
  // Cuerpo con formato: se lee y sanea el HTML; el marcador [ ... ] se busca en el texto visible.
  const htmlSaneado = ER.sanitizar_html($("cuerpo_en").innerHTML);
  if (/\[\s*(Paste|Pega)\b/i.test($("cuerpo_en").innerText)) {
    if (!confirm("El cuerpo todavía tiene un marcador [ ... ] sin reemplazar (los enlaces a denunciar). ¿Enviar de todos modos?")) return;
  }
  const b = $("enviar_directo");
  const etiqueta = b.textContent;
  const documentos = DOCUMENTOS_ADJUNTOS.slice();  // foto de la lista: no cambia a media faena
  b.disabled = true;
  b.textContent = documentos.length ? "Preparando documentos…" : "Enviando…";
  try {
    const token = await token_para_enviar();
    const asunto = $("asunto_en").value;
    // El botón dice "Preparando documentos…" mientras se leen y se codifican, que es
    // la parte lenta; solo después pasa a "Enviando…".
    const preparado = documentos.length
      ? await preparar_mensaje_con_adjuntos(para, asunto, htmlSaneado, documentos, responder_a)
      : preparar_mensaje_simple(para, asunto, htmlSaneado, responder_a);
    b.textContent = "Enviando…";
    let salio_sin_remite = !remite;   // true si el From lo acaba poniendo Gmail
    let r = await mandar_por_gmail(token, remite, preparado);
    if (!r.ok) {
      let detalle = await detalle_del_error(r);
      // UN SOLO reintento, y solo si se emitió From y Gmail contestó 400. Un 400 es un
      // rechazo ANTES de enviar, así que no puede haber salido ya: es la única forma de
      // reintentar sin arriesgarse a que la plataforma reciba la denuncia DOS VECES
      // (dos tickets, y que cierren uno por duplicado). Con 5xx, tiempo agotado o un
      // fallo de red NO se reintenta: ahí sí puede haber salido.
      // El caso que cubre: la marca es de uno de los dos dominios propios y el usuario
      // autorizó con el otro. Se reenvía SIN From y lo rellena Gmail con la cuenta del
      // token, que es la correcta. El Reply-To se mantiene.
      if (remite && r.status === 400) {
        r = await mandar_por_gmail(token, "", preparado);
        salio_sin_remite = r.ok;
        if (!r.ok) detalle = await detalle_del_error(r);
      }
      if (!r.ok) throw new Error("HTTP " + r.status + (detalle ? " – " + detalle : ""));
    }
    // Si el From lo puso Gmail, desde aquí NO se sabe cuál fue: no se nombra un correo
    // que igual no es el que salió.
    aviso("✅ Correo ENVIADO desde " + (salio_sin_remite ? "tu cuenta de Google autorizada" : remite) +
      (responder_a ? " (responder a: " + responder_a + ")" : "") +
      (documentos.length ? " con " + documentos.length + " documento" + (documentos.length === 1 ? "" : "s") + " adjunto" + (documentos.length === 1 ? "" : "s") : ""));
    b.textContent = "✅ Enviado";   // se deja deshabilitado para no reenviar
    recordar_correos_usados();              // memoria: este correo sirvió para este sitio
    // Deja en el Registro el correo enviado (texto final), los documentos que VIAJARON
    // y desde dónde salió. Si el From lo puso Gmail se apunta la cuenta que se le
    // SUGIRIÓ, marcada como no confirmada: no se inventa un dato que no se sabe.
    await actualizar_correo_denuncia(true, documentos, {
      desde: salio_sin_remite ? cuenta_sugerida() : remite,
      desde_confirmado: !salio_sin_remite,
      responder_a: responder_a
    });
  } catch (e) {
    b.disabled = false; b.textContent = etiqueta;
    aviso("❌ No se pudo enviar: " + (e && e.message ? e.message : e));
  }
}
$("enviar_directo").addEventListener("click", enviar_directo);

// ---------- Respaldos: abrir en el cliente de correo / Gmail ----------
// La navegación al cliente de correo va en su propia función para que se pueda
// interceptar desde fuera (igual que window.open). Sin esta costura, cualquier
// prueba que pulse "Abrir en mi correo" hace que el sistema abra Outlook de verdad
// en la pantalla de quien esté trabajando.
function abrir_en_cliente_de_correo(url) { window.location.href = url; }

$("mailto").addEventListener("click", () => {
  // Un borrador NO puede llevar adjuntos: si hay documentos, se avisa antes.
  if (!confirmar_borrador_sin_adjuntos()) return;
  // mailto no soporta HTML: se manda el texto plano (con saltos) del cuerpo.
  const cuerpo_plano = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
  recordar_correos_usados();        // memoria: destinatario recordado para este sitio
  actualizar_correo_denuncia(true); // registra el correo usado (texto final)
  abrir_en_cliente_de_correo("mailto:" + encodeURIComponent($("para").value) +
    "?subject=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent(cuerpo_plano));
});
$("gmail").addEventListener("click", () => {
  // Un borrador NO puede llevar adjuntos: si hay documentos, se avisa antes.
  if (!confirmar_borrador_sin_adjuntos()) return;
  // El borrador se abre EN la cuenta desde la que se enviaría (/mail/u/<correo>/) para
  // que salga desde ahí sin cambiar de cuenta. Con el correo de la marca ajeno, esa
  // cuenta es la propia: antes se abría el compositor genérico y el usuario tenía que
  // elegir cuenta a mano.
  const cuenta_borrador = cuenta_sugerida();
  const base = cuenta_borrador
    ? "https://mail.google.com/mail/u/" + encodeURIComponent(cuenta_borrador) + "/?view=cm&fs=1&tf=1"
    : "https://mail.google.com/mail/?view=cm&fs=1&tf=1";
  // El compositor web de Gmail (view=cm) no acepta HTML: se manda texto plano.
  const cuerpo_plano = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
  recordar_correos_usados();        // memoria: destinatario recordado para este sitio
  actualizar_correo_denuncia(true); // registra el correo usado (texto final)
  window.open(base +
    "&to=" + encodeURIComponent($("para").value) +
    "&su=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent(cuerpo_plano), "_blank");
});

function copiar(texto, msg) {
  navigator.clipboard.writeText(texto).then(() => aviso(msg)).catch(() => {
    const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); aviso(msg); } catch (e) {} document.body.removeChild(ta);
  });
}
// "Copiar todo" arma una copia de TEXTO PLANO combinada (asunto + cuerpo). El
// cuerpo (editor con formato) se pasa a texto plano preservando saltos.
const todo = (asuntoId, cuerpoId) =>
  "Para: " + $("para").value + "\nAsunto: " + $(asuntoId).value + "\n\n" +
  ER.html_a_texto_plano(ER.sanitizar_html($(cuerpoId).innerHTML));

$("copiar_para").addEventListener("click", () => copiar($("para").value, "✓ Correos copiados"));
// Copiar cuerpo CON formato (text/html + text/plain).
$("copiar_en").addEventListener("click", () =>
  ER.copiar_rico(ER.sanitizar_html($("cuerpo_en").innerHTML)).then(() => aviso("✓ Cuerpo (inglés) copiado")));
$("copiar_en_todo").addEventListener("click", () => copiar(todo("asunto_en", "cuerpo_en"), "✓ Todo (inglés) copiado"));
$("copiar_es").addEventListener("click", () =>
  ER.copiar_rico(ER.sanitizar_html($("cuerpo_es").innerHTML)).then(() => aviso("✓ Cuerpo (español) copiado")));
$("copiar_es_todo").addEventListener("click", () => copiar(todo("asunto_es", "cuerpo_es"), "✓ Todo (español) copiado"));
