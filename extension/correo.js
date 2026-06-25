// ============================================================================
//  Vista del correo de reporte (Telegram). Lee el correo que dejó el popup en
//  chrome.storage.local y permite abrirlo en el cliente de correo o Gmail, o
//  copiarlo. El cuerpo y el asunto son editables antes de enviar.
// ============================================================================
const $ = (id) => document.getElementById(id);

function aviso(t) {
  $("aviso").textContent = t;
  setTimeout(() => ($("aviso").textContent = ""), 2500);
}

chrome.storage.local.get("email_reporte", (d) => {
  const e = d.email_reporte || { to: "abuse@telegram.org", asunto: "", cuerpo: "" };
  $("para").value = e.to || "";
  $("asunto").value = e.asunto || "";
  $("cuerpo").value = e.cuerpo || "";
});

$("mailto").addEventListener("click", () => {
  const url = "mailto:" + encodeURIComponent($("para").value) +
    "?subject=" + encodeURIComponent($("asunto").value) +
    "&body=" + encodeURIComponent($("cuerpo").value);
  window.location.href = url;
});

$("gmail").addEventListener("click", () => {
  const url = "https://mail.google.com/mail/?view=cm&fs=1&tf=1" +
    "&to=" + encodeURIComponent($("para").value) +
    "&su=" + encodeURIComponent($("asunto").value) +
    "&body=" + encodeURIComponent($("cuerpo").value);
  window.open(url, "_blank");
});

function copiar(texto, msg) {
  navigator.clipboard.writeText(texto).then(() => aviso(msg)).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); aviso(msg); } catch (e) {}
    document.body.removeChild(ta);
  });
}
$("copiar_para").addEventListener("click", () => copiar($("para").value, "✓ Correos copiados"));
$("copiar_asunto").addEventListener("click", () => copiar($("asunto").value, "✓ Asunto copiado"));
$("copiar").addEventListener("click", () => copiar($("cuerpo").value, "✓ Cuerpo copiado"));
$("copiar_todo").addEventListener("click", () =>
  copiar("Para: " + $("para").value + "\nAsunto: " + $("asunto").value + "\n\n" + $("cuerpo").value, "✓ Todo copiado"));
