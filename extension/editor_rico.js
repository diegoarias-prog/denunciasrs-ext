// ============================================================================
//  EDITOR RICO COMPARTIDO (window.ER)
//  Saneador de HTML por lista blanca + utilidades de editor con formato y
//  copiado con formato. El saneador es una EXTRACCIÓN FIEL del ya auditado en
//  plantilla.js (misma lógica, sin cambios). Se envuelve en IIFE para exponer
//  solo window.ER y no colisionar con variables globales de la página.
//  Sin librerías, sin CDN: todo offline.
// ============================================================================
(function () {
  "use strict";

  // --- Escape de TODO valor del usuario antes de meterlo al DOM (anti-XSS) ---
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ==========================================================================
  //  SANEADOR DE HTML (lista blanca, sin librerías). El parseo se hace en un
  //  <template> INERTE: su contenido no ejecuta <script> ni carga <img>/onerror.
  // ==========================================================================
  const ETIQUETAS_PERMITIDAS = new Set(["B", "STRONG", "I", "EM", "U", "SPAN", "BR", "DIV", "P", "FONT"]);
  const ETIQUETAS_ELIMINAR = new Set(["SCRIPT", "STYLE", "IMG", "SVG", "IFRAME", "OBJECT", "LINK", "META"]);
  const STYLE_PERMITIDO = new Set(["color", "font-weight", "font-style", "text-decoration", "background-color"]);

  // Deja solo las propiedades de style de la lista blanca y rechaza valores peligrosos.
  function filtrar_style(valor) {
    const salida = [];
    String(valor || "").split(";").forEach((decl) => {
      const i = decl.indexOf(":");
      if (i < 0) return;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (!STYLE_PERMITIDO.has(prop) || !val) return;
      const bajo = val.toLowerCase();
      if (bajo.includes("url(") || bajo.includes("expression") || bajo.includes("javascript:") || bajo.includes("/*")) return;
      salida.push(prop + ": " + val);
    });
    return salida.join("; ");
  }

  // Recorre y limpia el árbol in situ (sirve para DocumentFragment y elementos).
  function limpiar_nodo(nodo) {
    Array.from(nodo.childNodes).forEach((h) => {
      if (h.nodeType === 8) { h.remove(); return; } // comentarios fuera
      if (h.nodeType !== 1) return;                  // deja nodos de texto
      const tag = h.tagName.toUpperCase();
      if (ETIQUETAS_ELIMINAR.has(tag)) { h.remove(); return; } // elimina etiqueta y su contenido
      if (!ETIQUETAS_PERMITIDAS.has(tag)) {
        // Etiqueta no permitida: limpiar hijos y "desenvolver" (conservar solo texto/hijos válidos).
        limpiar_nodo(h);
        const padre = h.parentNode;
        while (h.firstChild) padre.insertBefore(h.firstChild, h);
        padre.removeChild(h);
        return;
      }
      // Etiqueta permitida: quitar TODOS los atributos salvo los de la lista blanca.
      Array.from(h.attributes).forEach((a) => {
        const nombre = a.name.toLowerCase();
        if (tag === "FONT" && nombre === "color") {
          const v = String(a.value).toLowerCase();
          if (v.includes("url(") || v.includes("javascript:") || v.includes("expression")) h.removeAttribute(a.name);
          return; // conserva color válido en <font>
        }
        if (nombre === "style" && (tag === "SPAN" || tag === "FONT" || tag === "DIV" || tag === "P")) {
          const limpio = filtrar_style(a.value);
          if (limpio) h.setAttribute("style", limpio); else h.removeAttribute("style");
          return;
        }
        h.removeAttribute(a.name); // on*, href, src, class, id, style no permitido, etc.
      });
      limpiar_nodo(h);
    });
  }

  function sanitizar_html(html) {
    try {
      const tpl = document.createElement("template");
      tpl.innerHTML = String(html == null ? "" : html);
      limpiar_nodo(tpl.content);
      const salida = document.createElement("div");
      salida.appendChild(tpl.content.cloneNode(true));
      return salida.innerHTML;
    } catch (e) {
      // Respaldo seguro: nunca dejar la vista sin pintar por un fallo del saneo.
      return esc(String(html == null ? "" : html));
    }
  }

  // HTML (ya saneado) → texto plano preservando saltos. Se mide adjuntando el nodo
  // fuera de pantalla con white-space:pre-wrap para que innerText conserve saltos.
  function html_a_texto_plano(html) {
    const tmp = document.createElement("div");
    tmp.style.position = "fixed"; tmp.style.left = "-9999px"; tmp.style.top = "0";
    tmp.style.whiteSpace = "pre-wrap"; // conserva los saltos de línea en innerText
    tmp.innerHTML = html;
    document.body.appendChild(tmp);
    const plano = tmp.innerText;
    document.body.removeChild(tmp);
    return plano;
  }

  // Texto plano (con saltos \n) → HTML seguro (escapado, con <br> por salto).
  function texto_plano_a_html(txt) {
    return esc(String(txt || "")).replace(/\n/g, "<br>");
  }

  // ==========================================================================
  //  COPIADO
  // ==========================================================================
  // Copia texto plano al portapapeles. Devuelve Promise que resuelve al copiar.
  function copiar_plano(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(() => copiar_plano_execcommand(texto));
    }
    return copiar_plano_execcommand(texto);
  }
  function copiar_plano_execcommand(texto) {
    return new Promise((res) => {
      const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      res();
    });
  }

  // Copia CON formato: pone text/html (saneado) + text/plain en el portapapeles.
  // Devuelve Promise que resuelve tras copiar (rico o fallback). NO muestra aviso.
  function copiar_rico(html) {
    const limpio = sanitizar_html(html);
    const plano = html_a_texto_plano(limpio);
    const puede = typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write;
    if (!puede) return copiar_plano(plano);
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([limpio], { type: "text/html" }),
        "text/plain": new Blob([plano], { type: "text/plain" })
      });
      return navigator.clipboard.write([item]).catch(() => copiar_plano(plano));
    } catch (e) {
      return copiar_plano(plano);
    }
  }

  // ==========================================================================
  //  BARRA DE FORMATO. Cablea un editor contenteditable con sus botones.
  //  botones = { negrita, cursiva, subrayado, quitar, color } (ELEMENTOS DOM).
  //  Cada botón hace preventDefault en mousedown (no pierde la selección) y en
  //  click enfoca el editor y ejecuta el execCommand. El color guarda el rango
  //  al abrirse (mousedown) y lo restaura antes de aplicar foreColor.
  //  El rango se rastrea POR EDITOR (closure), así conviven varios editores.
  // ==========================================================================
  function montar_barra_formato(editorEl, botones) {
    if (!editorEl) return;
    botones = botones || {};
    let rango_guardado = null;
    function guardar_rango() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editorEl.contains(sel.anchorNode)) {
        rango_guardado = sel.getRangeAt(0).cloneRange();
      }
    }
    function restaurar_rango() {
      if (!rango_guardado) return;
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rango_guardado);
      } catch (e) { /* el rango pudo quedar obsoleto tras editar; se ignora */ }
    }
    // Mantén fresca la última selección hecha dentro del editor.
    editorEl.addEventListener("keyup", guardar_rango);
    editorEl.addEventListener("mouseup", guardar_rango);

    function enlazar(btn, comando) {
      if (!btn) return;
      btn.addEventListener("mousedown", (e) => { e.preventDefault(); });
      btn.addEventListener("click", () => { editorEl.focus(); document.execCommand(comando, false, null); });
    }
    enlazar(botones.negrita, "bold");
    enlazar(botones.cursiva, "italic");
    enlazar(botones.subrayado, "underline");
    enlazar(botones.quitar, "removeFormat");

    if (botones.color) {
      botones.color.addEventListener("mousedown", guardar_rango);
      botones.color.addEventListener("input", () => {
        editorEl.focus();
        restaurar_rango();
        document.execCommand("foreColor", false, botones.color.value);
      });
    }
  }

  window.ER = {
    esc: esc,
    sanitizar_html: sanitizar_html,
    html_a_texto_plano: html_a_texto_plano,
    copiar_rico: copiar_rico,
    texto_plano_a_html: texto_plano_a_html,
    montar_barra_formato: montar_barra_formato
  };
})();
