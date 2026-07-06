// ============================================================================
//  Vista del correo de reporte BILINGÜE. Se ENVÍA la versión en inglés; el
//  español queda como referencia. Botones para copiar cada idioma.
//
//  ENVÍO DIRECTO (API de Gmail): si el remitente (correo de contacto de la marca)
//  es una cuenta de Google Workspace propia (ver datos/config_gmail.js), aparece el
//  botón "Enviar ahora": autoriza una sola vez (OAuth, permiso gmail.send) y envía
//  el correo directamente DESDE esa cuenta, sin abrir Gmail. El botón "Abrir en
//  Gmail" queda como respaldo (abre el borrador para revisar y enviar a mano).
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

chrome.storage.local.get("email_reporte", (d) => {
  const e = d.email_reporte || {};
  $("para").value = e.to || "";
  $("asunto_en").value = e.asunto || "";
  // Los cuerpos son editores con formato: el prefill (texto plano con saltos) se
  // convierte a HTML seguro (escapado, con <br>) para verse bien y ser editable.
  $("cuerpo_en").innerHTML = ER.texto_plano_a_html(e.cuerpo || "");
  $("asunto_es").value = e.asunto_es || e.asunto || "";
  $("cuerpo_es").innerHTML = ER.texto_plano_a_html(e.cuerpo_es || e.cuerpo || "");
  REMITENTE = (e.from || "").trim();
  if (es_workspace(REMITENTE)) {
    $("de_info").textContent = "✅ Se enviará DESDE " + REMITENTE + ". Pulsa \"Enviar ahora\" y sale solo (la 1.ª vez, Google pedirá permiso una única vez).";
    $("de_info").style.display = "";
    const b = $("enviar_directo");
    b.textContent = "✅ Enviar ahora desde " + REMITENTE;
    b.style.display = "";
  }
});

// Cablea la barra de formato de cada editor (inglés y español).
ER.montar_barra_formato($("cuerpo_en"), {
  negrita: $("fmt_en_negrita"), cursiva: $("fmt_en_cursiva"), subrayado: $("fmt_en_subrayado"),
  quitar: $("fmt_en_quitar"), color: $("color_en")
});
ER.montar_barra_formato($("cuerpo_es"), {
  negrita: $("fmt_es_negrita"), cursiva: $("fmt_es_cursiva"), subrayado: $("fmt_es_subrayado"),
  quitar: $("fmt_es_quitar"), color: $("color_es")
});

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
      "&login_hint=" + encodeURIComponent(REMITENTE);
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
function a_base64url(str) {
  // UTF-8 seguro: si por algún motivo `str` trae un carácter no-ASCII (p. ej. un
  // nombre con acento en el "Para"), esto evita que btoa lance "Latin1 range".
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Codifica un texto UTF-8 en base64 troceado en líneas de 76 (MIME).
function base64_mime(txt) {
  return btoa(unescape(encodeURIComponent(txt || ""))).replace(/(.{76})/g, "$1\r\n");
}

// Arma el mensaje MIME multipart/alternative (text/plain + text/html), ambas
// partes en base64 UTF-8, y lo deja listo (raw base64url). `html` es el HTML YA
// SANEADO del cuerpo; el texto plano se deriva de él preservando saltos.
function construir_raw(remite, para, asunto, html) {
  const htmlSeguro = html || "";
  const plano = ER.html_a_texto_plano(htmlSeguro);
  const bnd = "=_denuncia_alt_boundary_=";
  const docHtml =
    "<html><body style=\"font-family:Arial,Helvetica,sans-serif; white-space:pre-wrap;\">" +
    htmlSeguro + "</body></html>";
  const mime =
    "From: " + encabezado_seguro(remite) + "\r\n" +
    "To: " + encabezado_seguro(para) + "\r\n" +
    "Subject: " + encabezado_mime(asunto) + "\r\n" +
    "MIME-Version: 1.0\r\n" +
    "Content-Type: multipart/alternative; boundary=\"" + bnd + "\"\r\n" +
    "\r\n" +
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
    "--" + bnd + "--";
  return a_base64url(mime);
}

// Guarda en la denuncia del Registro (la ÚLTIMA iniciada, apuntada por
// `ultima_denuncia_registro`) el correo REAL con el texto FINAL editado, para
// poder verlo y copiarlo después. No debe bloquear el envío si algo falla.
async function actualizar_correo_denuncia(enviado) {
  try {
    const st = await new Promise((res) =>
      chrome.storage.local.get(["ultima_denuncia_registro", "denuncias_registro"], res));
    const id = st.ultima_denuncia_registro;
    const lista = Array.isArray(st.denuncias_registro) ? st.denuncias_registro : [];
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d) return;
    const cuerpo_en = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
    const cuerpo_es = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_es").innerHTML));
    d.correo = Object.assign({}, d.correo, {
      to: $("para").value || "", asunto: $("asunto_en").value || "", cuerpo: cuerpo_en,
      asunto_es: $("asunto_es").value || "", cuerpo_es: cuerpo_es,
      enviado: !!enviado, fecha: new Date().toISOString()
    });
    await new Promise((res) => chrome.storage.local.set({ denuncias_registro: lista }, res));
  } catch (e) { /* no bloquear por esto */ }
}

async function enviar_directo() {
  if (!es_workspace(REMITENTE)) { aviso("⚠ El envío directo solo está disponible para cuentas propias de Workspace."); return; }
  const para = $("para").value.trim();
  if (!para) { aviso("⚠ Falta el correo del destinatario (campo \"Para\")."); return; }
  // Cuerpo con formato: se lee y sanea el HTML; el marcador [ ... ] se busca en el texto visible.
  const htmlSaneado = ER.sanitizar_html($("cuerpo_en").innerHTML);
  if (/\[\s*(Paste|Pega)\b/i.test($("cuerpo_en").innerText)) {
    if (!confirm("El cuerpo todavía tiene un marcador [ ... ] sin reemplazar (los enlaces a denunciar). ¿Enviar de todos modos?")) return;
  }
  const b = $("enviar_directo");
  const etiqueta = b.textContent;
  b.disabled = true; b.textContent = "Enviando…";
  try {
    const token = await token_para_enviar();
    const raw = construir_raw(REMITENTE, para, $("asunto_en").value, htmlSaneado);
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: raw })
    });
    if (!r.ok) {
      let detalle = "";
      try { const j = await r.json(); detalle = (j.error && j.error.message) || ""; } catch (e) {}
      throw new Error("HTTP " + r.status + (detalle ? " – " + detalle : ""));
    }
    aviso("✅ Correo ENVIADO desde " + REMITENTE);
    b.textContent = "✅ Enviado";   // se deja deshabilitado para no reenviar
    await actualizar_correo_denuncia(true); // deja en el Registro el correo enviado (texto final)
  } catch (e) {
    b.disabled = false; b.textContent = etiqueta;
    aviso("❌ No se pudo enviar: " + (e && e.message ? e.message : e));
  }
}
$("enviar_directo").addEventListener("click", enviar_directo);

// ---------- Respaldos: abrir en el cliente de correo / Gmail ----------
$("mailto").addEventListener("click", () => {
  // mailto no soporta HTML: se manda el texto plano (con saltos) del cuerpo.
  const cuerpo_plano = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
  actualizar_correo_denuncia(true); // registra el correo usado (texto final)
  window.location.href = "mailto:" + encodeURIComponent($("para").value) +
    "?subject=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent(cuerpo_plano);
});
$("gmail").addEventListener("click", () => {
  // Si el remitente es una cuenta de Workspace propia, se abre el borrador EN esa
  // cuenta (/mail/u/<correo>/) para que salga desde ahí sin cambiar de cuenta.
  const base = es_workspace(REMITENTE)
    ? "https://mail.google.com/mail/u/" + encodeURIComponent(REMITENTE) + "/?view=cm&fs=1&tf=1"
    : "https://mail.google.com/mail/?view=cm&fs=1&tf=1";
  // El compositor web de Gmail (view=cm) no acepta HTML: se manda texto plano.
  const cuerpo_plano = ER.html_a_texto_plano(ER.sanitizar_html($("cuerpo_en").innerHTML));
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
