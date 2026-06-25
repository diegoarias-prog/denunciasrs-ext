// ============================================================================
//  Políticas por red social:
//   - Políticas GENERALES de la red (normas comunitarias, condiciones, etc.).
//   - Por cada formulario, la política que se cita en la denuncia + enlace.
// ============================================================================
(function () {
  const POL = (window.JUSTIF && window.JUSTIF.POLITICAS) || {};
  const GEN = window.POLITICAS_GENERALES || {};
  const FORMS = window.FORMULARIOS || {};

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function link(u, t, cls) { return '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + "</a>"; }

  // Políticas por formulario, agrupadas por red.
  const porRed = {};
  Object.keys(FORMS).forEach((k) => {
    const f = FORMS[k], p = POL[k];
    if (!p) return;
    (porRed[f.red] = porRed[f.red] || []).push({ form: f.nombre, politica: p[0], url: p[1] });
  });

  const todas = {};
  Object.keys(porRed).forEach((r) => (todas[r] = 1));
  Object.keys(GEN).forEach((r) => (todas[r] = 1));

  const orden = ["Facebook", "Instagram", "WhatsApp", "LinkedIn", "X", "TikTok"];
  const reds = Object.keys(todas).sort((a, b) => {
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  const cont = document.getElementById("contenedor");
  reds.forEach((red) => {
    const div = document.createElement("div");
    div.className = "red";
    let html = "<h2>" + esc(red) + "</h2>";

    // 1) Políticas generales de la red (en chips).
    if (GEN[red] && GEN[red].length) {
      html += '<div class="gen"><div class="gent">Políticas oficiales de la red</div>'
        + GEN[red].map((g) => link(g.u, g.t)).join("") + "</div>";
    }

    // 2) Política citada por cada formulario.
    if (porRed[red] && porRed[red].length) {
      html += '<div class="subt">Política citada en cada denuncia</div><table>';
      porRed[red].forEach((it) => {
        const enlaces = String(it.url).split("|").map((u) => u.trim()).filter(Boolean)
          .map((u) => link(u, u, "lk")).join("");
        html += '<tr><td class="form">' + esc(it.form) + "</td>"
          + '<td class="pol">' + esc(it.politica) + enlaces + "</td></tr>";
      });
      html += "</table>";
    }

    div.innerHTML = html;
    cont.appendChild(div);
  });

  if (!reds.length) cont.innerHTML = "<p>No hay políticas para mostrar.</p>";
})();
