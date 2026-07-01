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
  $("cuerpo_en").value = e.cuerpo || "";
  $("asunto_es").value = e.asunto_es || e.asunto || "";
  $("cuerpo_es").value = e.cuerpo_es || e.cuerpo || "";
  REMITENTE = (e.from || "").trim();
  if (es_workspace(REMITENTE)) {
    $("de_info").textContent = "✅ Se enviará DESDE " + REMITENTE + ". Pulsa \"Enviar ahora\" y sale solo (la 1.ª vez, Google pedirá permiso una única vez).";
    $("de_info").style.display = "";
    const b = $("enviar_directo");
    b.textContent = "✅ Enviar ahora desde " + REMITENTE;
    b.style.display = "";
  }
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
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Arma el mensaje MIME (cuerpo UTF-8 en base64) y lo deja listo (raw base64url).
function construir_raw(remite, para, asunto, cuerpo) {
  const cuerpoB64 = btoa(unescape(encodeURIComponent(cuerpo || ""))).replace(/(.{76})/g, "$1\r\n");
  const mime =
    "From: " + encabezado_seguro(remite) + "\r\n" +
    "To: " + encabezado_seguro(para) + "\r\n" +
    "Subject: " + encabezado_mime(asunto) + "\r\n" +
    "MIME-Version: 1.0\r\n" +
    "Content-Type: text/plain; charset=\"UTF-8\"\r\n" +
    "Content-Transfer-Encoding: base64\r\n" +
    "\r\n" +
    cuerpoB64;
  return a_base64url(mime);
}

async function enviar_directo() {
  if (!es_workspace(REMITENTE)) { aviso("⚠ El envío directo solo está disponible para cuentas propias de Workspace."); return; }
  const para = $("para").value.trim();
  if (!para) { aviso("⚠ Falta el correo del destinatario (campo \"Para\")."); return; }
  const cuerpo = $("cuerpo_en").value;
  if (/\[\s*(Paste|Pega)\b/i.test(cuerpo)) {
    if (!confirm("El cuerpo todavía tiene un marcador [ ... ] sin reemplazar (los enlaces a denunciar). ¿Enviar de todos modos?")) return;
  }
  const b = $("enviar_directo");
  const etiqueta = b.textContent;
  b.disabled = true; b.textContent = "Enviando…";
  try {
    const token = await token_para_enviar();
    const raw = construir_raw(REMITENTE, para, $("asunto_en").value, cuerpo);
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
  } catch (e) {
    b.disabled = false; b.textContent = etiqueta;
    aviso("❌ No se pudo enviar: " + (e && e.message ? e.message : e));
  }
}
$("enviar_directo").addEventListener("click", enviar_directo);

// ---------- Respaldos: abrir en el cliente de correo / Gmail ----------
$("mailto").addEventListener("click", () => {
  window.location.href = "mailto:" + encodeURIComponent($("para").value) +
    "?subject=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent($("cuerpo_en").value);
});
$("gmail").addEventListener("click", () => {
  // Si el remitente es una cuenta de Workspace propia, se abre el borrador EN esa
  // cuenta (/mail/u/<correo>/) para que salga desde ahí sin cambiar de cuenta.
  const base = es_workspace(REMITENTE)
    ? "https://mail.google.com/mail/u/" + encodeURIComponent(REMITENTE) + "/?view=cm&fs=1&tf=1"
    : "https://mail.google.com/mail/?view=cm&fs=1&tf=1";
  window.open(base +
    "&to=" + encodeURIComponent($("para").value) +
    "&su=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent($("cuerpo_en").value), "_blank");
});

function copiar(texto, msg) {
  navigator.clipboard.writeText(texto).then(() => aviso(msg)).catch(() => {
    const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); aviso(msg); } catch (e) {} document.body.removeChild(ta);
  });
}
const todo = (asuntoId, cuerpoId) => "Para: " + $("para").value + "\nAsunto: " + $(asuntoId).value + "\n\n" + $(cuerpoId).value;

$("copiar_para").addEventListener("click", () => copiar($("para").value, "✓ Correos copiados"));
$("copiar_en").addEventListener("click", () => copiar($("cuerpo_en").value, "✓ Cuerpo (inglés) copiado"));
$("copiar_en_todo").addEventListener("click", () => copiar(todo("asunto_en", "cuerpo_en"), "✓ Todo (inglés) copiado"));
$("copiar_es").addEventListener("click", () => copiar($("cuerpo_es").value, "✓ Cuerpo (español) copiado"));
$("copiar_es_todo").addEventListener("click", () => copiar(todo("asunto_es", "cuerpo_es"), "✓ Todo (español) copiado"));
