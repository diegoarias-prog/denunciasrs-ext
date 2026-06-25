// ============================================================================
//  Vista del correo de reporte BILINGÜE. Se ENVÍA la versión en inglés; el
//  español queda como referencia. Botones para copiar cada idioma.
// ============================================================================
const $ = (id) => document.getElementById(id);
function aviso(t) { $("aviso").textContent = t; setTimeout(() => ($("aviso").textContent = ""), 2500); }

chrome.storage.local.get("email_reporte", (d) => {
  const e = d.email_reporte || {};
  $("para").value = e.to || "";
  $("asunto_en").value = e.asunto || "";
  $("cuerpo_en").value = e.cuerpo || "";
  $("asunto_es").value = e.asunto_es || e.asunto || "";
  $("cuerpo_es").value = e.cuerpo_es || e.cuerpo || "";
});

$("mailto").addEventListener("click", () => {
  window.location.href = "mailto:" + encodeURIComponent($("para").value) +
    "?subject=" + encodeURIComponent($("asunto_en").value) +
    "&body=" + encodeURIComponent($("cuerpo_en").value);
});
$("gmail").addEventListener("click", () => {
  window.open("https://mail.google.com/mail/?view=cm&fs=1&tf=1" +
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
