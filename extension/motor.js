// ===========================================================================
//  MOTOR DE RELLENO COMPARTIDO (motor.js)
//  Lo usan el popup (primer clic) y el service worker (repeticiones automaticas
//  tras verificar el correo). APLICAR se inyecta y ejecuta DENTRO de la pagina
//  del formulario con chrome.scripting.executeScript, por eso debe ser AUTONOMO
//  (sin variables externas): su codigo fuente se serializa completo.
// ===========================================================================
async function APLICAR(pasos, opciones) {
  opciones = opciones || {}; // { unaPasada: true } => una sola pasada (para el bucle del service worker)
  const dur = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function setNative(el, v) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Marca un radio/checkbox de forma robusta (sirve para formularios React de FB/IG/
  // WhatsApp/TikTok): secuencia de puntero + clic + setter nativo de 'checked' + eventos.
  function marcarRadioEl(target) {
    if (!target) return false;
    if (target.checked) return true;
    let lab = null;
    try { if (target.id) lab = document.querySelector('label[for="' + (window.CSS ? CSS.escape(target.id) : target.id) + '"]'); } catch (e) {}
    try { target.scrollIntoView({ block: "center" }); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); } catch (e) {}
    try { (lab || target).dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); } catch (e) {}
    try { (lab || target).click(); } catch (e) {}
    try {
      const tipo = target.type === "checkbox" ? "checked" : "checked";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, tipo).set.call(target, true);
    } catch (e) { try { target.checked = true; } catch (e2) {} }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return !!target.checked;
  }
  function setSelect(name, texto, suf) {
    const s = document.querySelector('select[name' + (suf ? "$" : "") + '="' + (name + "").replace(/"/g, '\\"') + '"]');
    if (!s) return false;
    const t = norm(texto);
    for (let i = 0; i < s.options.length; i++) {
      if (norm(s.options[i].text).indexOf(t) >= 0) {
        s.selectedIndex = i; s.dispatchEvent(new Event("change", { bubbles: true })); return true;
      }
    }
    return false;
  }
  let ok = 0; const faltan = []; const clicsReales = [];
  // Etiqueta un radio/checkbox para que el service worker le dé un CLIC REAL después.
  function marcarParaClicReal(el) {
    if (!el) return;
    const attr = "data-cr-" + clicsReales.length; // atributo ÚNICO (no se sobrescribe)
    try { el.setAttribute(attr, "1"); } catch (e) { return; }
    clicsReales.push("[" + attr + "]");
  }
  // VARIAS PASADAS automáticas: TikTok revela partes del formulario con retraso, así
  // que en vez de obligar al usuario a volver a pulsar "Rellenar", la propia extensión
  // REINTENTA en pasadas rápidas durante hasta ~16 s, reintentando SOLO los pasos
  // pendientes, hasta que TikTok muestre todo (o no quede nada por hacer). Sale en
  // cuanto no queda nada pendiente. Los pasos marcados p.opcional (p.ej. el botón
  // "Siguiente", que ya no existe en el formulario de una sola página) NO bloquean ni
  // se reportan si no aparecen.
  let pendientes = pasos.slice();
  const t0Pasadas = Date.now();
  for (let pasada = 0; pendientes.length; pasada++) {
    if (pasada > 0) {
      if (Date.now() - t0Pasadas > 16000) break; // tope de espera total
      await dur(700);                             // deja que aparezca la sección que faltaba
    }
    faltan.length = 0;               // en cada pasada solo cuentan los fallos de AHORA
    const reintentar = [];
    for (const p of pendientes) {
    const antesFaltan = faltan.length;
    try {
      if (p.tipo === "select" || p.tipo === "selectPais") {
        const texto = p.tipo === "selectPais" ? p.valor : p.texto;
        if (texto != null && texto !== "") { if (setSelect(p.name, texto, p.suf)) ok++; else faltan.push(p.name); }
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "radio") {
        const sel = 'input[type=radio][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]';
        const partes = p.texto ? norm(p.texto).split("|").filter(Boolean) : null;
        const buscar = () => {
          const radios = Array.prototype.slice.call(document.querySelectorAll(sel));
          if (!radios.length) return null;
          if (!partes) return radios[0];
          return radios.find((r) => {
            let lab = r.id ? (document.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && r.nextElementSibling) lab = r.nextElementSibling.innerText || "";
            if (!lab && r.parentElement && (r.parentElement.innerText || "").length < 40) lab = r.parentElement.innerText || "";
            const v = norm(r.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          }) || null;
        };
        let marcado = false, destinoFinal = null;
        for (let it = 0; it < 4 && !marcado; it++) {
          const destino = buscar(); // re-buscar fresco cada intento (React reemplaza el nodo)
          if (destino) { destinoFinal = destino; marcado = marcarRadioEl(destino); }
          if (!marcado) await dur(300);
        }
        if (destinoFinal) { marcarParaClicReal(destinoFinal); ok++; } else faltan.push(p.name);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "radioVal") {
        // Marca radio por NAME+VALUE exactos, como autorrelleno.py (clic en label,
        // dispatch change, reintentos porque React lo revierte).
        let okR = false, targetFinal = null;
        for (let intento = 0; intento < 4 && !okR; intento++) {
          const els = document.querySelectorAll('input[name="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          let target = null;
          for (let i = 0; i < els.length; i++) { if (els[i].value === p.value) { target = els[i]; break; } }
          if (target) targetFinal = target;
          okR = marcarRadioEl(target);
          if (!okR) await dur(300);
        }
        if (targetFinal) { marcarParaClicReal(targetFinal); ok++; } else faltan.push("radioVal:" + p.name);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "radioPregunta") {
        // Marca un RADIO identificándolo por (a) la PREGUNTA a la que pertenece y (b) el
        // TEXTO de la opción. Necesario para TikTok, que ya NO usa <select>/menús sino radios
        // con texto y REPITE "Sí/No" en varias preguntas: sin anclar a la pregunta se marcaría
        // el grupo equivocado. Casa por palabras clave en español (respaldo a inglés), sin
        // depender de la frase exacta. Marca robusto + clic real (React de TikTok lo exige).
        const kpreg = norm(p.pregunta || "").split("|").filter(Boolean);
        const kop = norm(p.opcion || "").split("|").filter(Boolean);
        // Casa la ETIQUETA de la opción: alternativas con "&" => todas sus palabras presentes;
        // alternativas cortas (sí/no) => coincidencia EXACTA (evita casar "no" dentro de otra
        // palabra); el resto => "contiene".
        const casaOpcion = (label) => kop.some((kw) => {
          if (kw.indexOf("&") >= 0) return kw.split("&").every((tok) => (tok = tok.trim()) && label.indexOf(tok) >= 0);
          if (kw.length <= 4) return label === kw;
          return label.indexOf(kw) >= 0;
        });
        // PREGUNTA más cercana a un radio: el hermano anterior (subiendo por ancestros) que NO
        // contiene a su vez un radio (así saltamos otras OPCIONES y llegamos al título).
        const preguntaDe = (r) => {
          let par = r.parentElement, k = 0;
          while (par && k < 8) {
            let ps = par.previousElementSibling, j = 0;
            while (ps && j < 8) {
              const t = norm(ps.innerText || "");
              if (t && t.length > 4 && !ps.querySelector('input[type=radio],[role=radio]')) return t;
              ps = ps.previousElementSibling; j++;
            }
            par = par.parentElement; k++;
          }
          return "";
        };
        // ETIQUETA propia de un radio: label[for] / aria-label / <label> contenedor / hermano
        // siguiente / texto del padre corto. Se toma UNA sola (sin concatenar) para poder
        // comparar exacto en las opciones cortas.
        const etiquetaDe = (r) => {
          let lab = "";
          if (r.id) { const lf = document.querySelector('label[for="' + r.id.replace(/"/g, '\\"') + '"]'); if (lf) lab = lf.innerText || ""; }
          if (!lab && r.getAttribute("aria-label")) lab = r.getAttribute("aria-label");
          if (!lab && r.closest) { const lc = r.closest("label"); if (lc) lab = lc.innerText || ""; }
          if (!lab && r.nextElementSibling) lab = r.nextElementSibling.innerText || "";
          if (!lab && r.parentElement && (r.parentElement.innerText || "").length < 80) lab = r.parentElement.innerText || "";
          // OJO: hay que NORMALIZAR ESPACIOS. El portal nuevo de Meta devuelve rótulos con
          // saltos de línea ("\nSí\n"), y las opciones cortas (sí/no) se comparan EXACTO:
          // sin recortar, "si\n" nunca casaría con "si" y el radio se quedaba sin marcar.
          return norm(lab).replace(/\s+/g, " ").trim();
        };
        // RESPALDO de anclaje: en el portal nuevo de Meta el título de la pregunta NO es
        // hermano anterior de la opción, así que preguntaDe() devuelve "". Buscamos entonces
        // el ANCESTRO MÁS AJUSTADO (el de texto más corto, hasta 10 niveles) que contenga la
        // pregunta: eso identifica el grupo correcto aunque otras preguntas repitan "Sí/No".
        const cercaniaPregunta = (r) => {
          let par = r.parentElement, k = 0;
          while (par && k < 10) {
            const t = norm(par.innerText || "");
            if (kpreg.some((kw) => t.indexOf(kw) >= 0)) return t.length;
            par = par.parentElement; k++;
          }
          return -1;
        };
        const visible = (r) => { const rr = r.getBoundingClientRect(); return !(rr.width < 1 && rr.height < 1); };
        let okRP = false, destinoRP = null;
        for (let it = 0; it < 4 && !okRP; it++) {
          const radios = Array.prototype.slice.call(document.querySelectorAll('input[type=radio],[role=radio]'));
          let cand = radios.find((r) => {
            if (!visible(r)) return false; // oculto de verdad
            if (kpreg.length) { const preg = preguntaDe(r); if (!kpreg.some((kw) => preg.indexOf(kw) >= 0)) return false; }
            return casaOpcion(etiquetaDe(r));
          });
          if (!cand && kpreg.length) {
            const conBloque = radios
              .filter((r) => visible(r) && casaOpcion(etiquetaDe(r)))
              .map((r) => ({ r: r, d: cercaniaPregunta(r) }))
              .filter((o) => o.d >= 0)
              .sort((a, b) => a.d - b.d); // el bloque más pequeño = el grupo de esta pregunta
            if (conBloque.length) cand = conBloque[0].r;
          }
          if (cand) { destinoRP = cand; okRP = marcarRadioEl(cand); }
          if (!okRP) await dur(300);
        }
        if (destinoRP) { marcarParaClicReal(destinoRP); ok++; } else faltan.push("radioPregunta:" + (p.pregunta || p.opcion));
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "check") {
        const cbs = Array.prototype.slice.call(
          document.querySelectorAll('input[type=checkbox][name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]'));
        let el = null;
        if (!p.texto) {
          el = cbs[0]; // sin texto => la (única) casilla
        } else {
          const partes = norm(p.texto).split("|").filter(Boolean);
          el = cbs.find((c) => {
            let lab = c.id ? (document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]') || {}).innerText || "" : "";
            if (!lab && c.parentElement) lab = c.parentElement.innerText || "";
            const v = norm(c.value), l = norm(lab);
            return partes.some((t) => (v && v.indexOf(t) >= 0) || (l && l.indexOf(t) >= 0));
          });
        }
        if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; } else faltan.push(p.name);
      } else if (p.tipo === "fillName") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector('[name' + (p.suf ? "$" : "") + '="' + (p.name + "").replace(/"/g, '\\"') + '"]');
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.name);
        }
      } else if (p.tipo === "fillCss") {
        if (p.valor != null && p.valor !== "") {
          const el = document.querySelector(p.css);
          if (el) { setNative(el, p.valor); ok++; } else faltan.push(p.css);
        }
      } else if (p.tipo === "fillAny") {
        if (p.valor != null && p.valor !== "") {
          let hecho = false;
          for (const nm of (p.names || [])) {
            const el = document.querySelector('[name="' + (nm + "").replace(/"/g, '\\"') + '"]');
            if (el) { setNative(el, p.valor); ok++; hecho = true; break; }
          }
          if (!hecho) faltan.push((p.names || []).join("|"));
        }
      } else if (p.tipo === "dropdown") {
        // Menú-botón de TikTok: abre el desplegable (por su pregunta o índice) y
        // elige la opción cuyo texto contenga 'opcion'.
        const ds = Array.prototype.slice.call(document.querySelectorAll('[aria-haspopup="listbox"],[role="combobox"]'));
        // Preferimos los menús AÚN SIN SELECCIONAR (muestran "Select"/"Seleccionar"):
        // el siguiente a llenar es el primero sin selección.
        const sinSel = ds.filter((d) => {
          const t = norm(d.innerText);
          return !t || t.indexOf("select") >= 0 || t.indexOf("seleccion") >= 0 || t.indexOf("elegir") >= 0 || t.indexOf("choose") >= 0;
        });
        const pool = sinSel.length ? sinSel : ds;
        let btn = null;
        if (p.pregunta) {
          const partes = norm(p.pregunta).split("|");
          btn = pool.find((d) => {
            let ctx = "", par = d.parentElement, k = 0;
            while (par && k < 2) { ctx += " " + (par.innerText || ""); par = par.parentElement; k++; }
            const c = norm(ctx);
            return partes.some((kw) => kw && c.indexOf(kw) >= 0);
          });
        }
        if (!btn) btn = pool[p.indice || 0] || pool[0];
        if (btn) {
          btn.click();
          const ops = norm(p.opcion || "").split("|").filter(Boolean); // alternativas (es|en)
          // Coincidencia por PALABRAS CLAVE: una alternativa con "&" casa si TODAS sus
          // palabras están presentes (en cualquier orden). Así NO dependemos de la frase
          // exacta de TikTok, que cambia de redacción e idioma. Ej.: "marca&contenido"
          // casa con "Infracción de derechos de marca comercial en el contenido generado…".
          const coincide = (t) => ops.some((kw) => kw.indexOf("&") >= 0
            ? kw.split("&").every((tok) => (tok = tok.trim()) && t.indexOf(tok) >= 0)
            : t.indexOf(kw) >= 0);
          // Lista solo las opciones REALMENTE visibles del menú abierto (evita <li> sueltos
          // de otros menús de la página); si no hay role=option/menuitem, cae a <li>.
          const listar = () => {
            let l = Array.prototype.slice.call(document.querySelectorAll('[role=option],[role=menuitem]'))
              .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && norm(x.innerText); });
            if (!l.length) l = Array.prototype.slice.call(document.querySelectorAll('li'))
              .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && norm(x.innerText); });
            return l;
          };
          let o = null, lista = [];
          for (let intento = 0; intento < 7 && !o; intento++) {
            await dur(400);
            lista = listar();
            if (ops.length) o = lista.find((x) => coincide(norm(x.innerText)));
          }
          // Respaldo por POSICIÓN: si no casó por texto (TikTok cambió la redacción) y el
          // paso indica la opción por orden, la tomamos por índice (p.ej. la 1.ª).
          if (!o && typeof p.opcionIndice === "number" && lista.length) o = lista[p.opcionIndice] || null;
          if (o) { o.click(); ok++; } else { faltan.push("opcion:" + (p.opcion || p.opcionIndice)); try { document.body.click(); } catch (e) {} }
        } else faltan.push("menu:" + (p.pregunta || p.indice));
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "fillLabel") {
        // Rellena el primer campo VISIBLE y vacío cuyo texto cercano contenga la etiqueta.
        // REINTENTA unos segundos: TikTok (y otros SPA React) pintan la sección un
        // instante después, así que un solo escaneo la perdía y marcaba todo como
        // "no encontrado". Reintentamos hasta que el campo aparezca.
        if (p.valor != null && p.valor !== "") {
          const kws = (p.label || "").split("|").map(norm).filter(Boolean);
          let yaLleno = false; // el campo que coincide ya tenía valor (p.ej. correo verificado)
          const buscarCampo = () => {
            const els = Array.prototype.slice.call(
              document.querySelectorAll('textarea,input[type=text],input[type=email],input[type=url],input[type=tel],input[type=number],input:not([type])'));
            for (const e of els) {
              const r = e.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
              if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
              // GitHub asocia el rótulo por aria-labelledby (referencia por id), no por label[for].
              const lblby = e.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
              // El rótulo suele ser un hermano ANTERIOR directo del campo (formularios de GitHub).
              let prevE = e.previousElementSibling, je = 0;
              while (prevE && je < 4) { ctx += " " + (prevE.innerText || ""); prevE = prevE.previousElementSibling; je++; }
              // En TikTok el título del campo suele ser el hermano ANTERIOR de un ancestro.
              let par = e.parentElement, k = 0;
              while (par && k < 6) {
                const ps = par.previousElementSibling;
                if (ps) ctx += " " + (ps.innerText || "");
                par = par.parentElement; k++;
              }
              const c = norm(ctx);
              if (kws.some((kw) => c.indexOf(kw) >= 0)) {
                if (e.value) { yaLleno = true; continue; } // coincide pero ya tiene valor
                return e;
              }
            }
            return null;
          };
          let hit = null;
          for (let intentoFL = 0; intentoFL < (p.reintentos || 1) && !hit && !yaLleno; intentoFL++) {
            hit = buscarCampo();
            if (!hit && !yaLleno) await dur(400);
          }
          if (hit) { setNative(hit, p.valor); ok++; }
          else if (yaLleno) { ok++; } // ya estaba relleno (correo verificado, etc.)
          else faltan.push("etiqueta:" + p.label);
        }
      } else if (p.tipo === "fillUrlsUnaCaja") {
        // UNA sola caja para TODAS las URLs (TikTok: una por línea; portal nuevo de Meta:
        // separadas por coma -> p.separador). Se llena por partes, así que si la caja aún
        // no está visible NO rompe (la llenará un Rellenar posterior).
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (!urls.length) {
          // nada que poner
        } else {
          const etiquetas = (p.label || "").split("|").map(norm).filter(Boolean);
          const placeholders = (p.placeholder || "").split("|").map(norm).filter(Boolean);
          const texto = urls.join(p.separador || "\n");
          const buscarCaja = () => {
            const campos = Array.prototype.slice.call(
              document.querySelectorAll("textarea, input[type=text], input:not([type])"));
            for (const e of campos) {
              const r = e.getBoundingClientRect();
              if (r.width <= 2 || r.height <= 2) continue;
              if (e.value) { if (e.value === texto) return e; continue; } // ya la llenamos antes
              const ph = norm(e.placeholder || "");
              let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
              if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
              const lblby = e.getAttribute("aria-labelledby");
              if (lblby) lblby.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
              if (e.previousElementSibling) ctx += " " + (e.previousElementSibling.innerText || "");
              // El rótulo del portal nuevo de Meta es el hermano anterior de un ANCESTRO.
              let par = e.parentElement, k = 0;
              while (par && k < 6) { const ps = par.previousElementSibling; if (ps) ctx += " " + (ps.innerText || ""); ctx += " " + (par.getAttribute("aria-label") || ""); par = par.parentElement; k++; }
              const c = norm(ctx);
              const porEtiqueta = etiquetas.some((kw) => c.indexOf(kw) >= 0);
              const porPlaceholder = placeholders.some((kw) => ph.indexOf(kw) >= 0);
              if (porEtiqueta || porPlaceholder) return e;
            }
            return null;
          };
          let hit = null;
          for (let itUC = 0; itUC < (p.reintentos || 1) && !hit; itUC++) {
            hit = buscarCaja();
            if (!hit) await dur(400);
          }
          if (hit) { if (hit.value !== texto) setNative(hit, texto); ok++; } else faltan.push("urls_caja_unica");
        }
      } else if (p.tipo === "selectLabel") {
        // Como fillLabel pero para <select> nativos: encuentra el menú por su etiqueta
        // cercana (placeholder/aria-label/label-for/hermano anterior/ancestro) y elige
        // la opción cuyo texto contenga 'opcion'. Para formularios GitHub (sin name).
        const kws = (p.label || "").split("|").map(norm).filter(Boolean);
        const sels = Array.prototype.slice.call(document.querySelectorAll("select"));
        let hit = null;
        for (const s of sels) {
          const r = s.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          let ctx = " " + (s.getAttribute("aria-label") || "") + " ";
          if (s.id) { const lf = document.querySelector('label[for="' + s.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
          const lblbyS = s.getAttribute("aria-labelledby");
          if (lblbyS) lblbyS.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) ctx += " " + (le.innerText || ""); });
          let prevS = s.previousElementSibling, js = 0;
          while (prevS && js < 4) { ctx += " " + (prevS.innerText || ""); prevS = prevS.previousElementSibling; js++; }
          let par = s.parentElement, k = 0;
          while (par && k < 6) { const ps = par.previousElementSibling; if (ps) ctx += " " + (ps.innerText || ""); par = par.parentElement; k++; }
          if (kws.some((kw) => norm(ctx).indexOf(kw) >= 0)) { hit = s; break; }
        }
        if (hit) {
          const t = norm(p.opcion);
          let done = false;
          if (t) for (let i = 0; i < hit.options.length; i++) {
            if (norm(hit.options[i].text).indexOf(t) >= 0) {
              hit.selectedIndex = i;
              hit.dispatchEvent(new Event("input", { bubbles: true }));
              hit.dispatchEvent(new Event("change", { bubbles: true }));
              done = true; break;
            }
          }
          if (done) ok++; else faltan.push("opcion:" + p.opcion);
        } else faltan.push("selectLabel:" + p.label);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "clickOpcion") {
        // Hace clic en la OPCIÓN VISIBLE cuyo texto coincide (como un humano). Útil
        // para casillas/radios con widget no estándar (TikTok). Reintenta por React.
        const kws = norm(p.texto).split("|").filter(Boolean);
        let okC = false;
        for (let intento = 0; intento < 3 && !okC; intento++) {
          const cands = Array.prototype.slice.call(
            document.querySelectorAll("label,span,div,p,button,li,[role=radio],[role=checkbox]"))
            .filter((e) => {
              const t = norm(e.innerText || e.textContent || "");
              const r = e.getBoundingClientRect();
              return t && t.length < 32 && r.width > 1 && r.height > 1 && kws.some((kw) => t === kw);
            });
          // el más interno (sin hijos con el mismo texto) para no clicar el contenedor
          const el = cands.find((e) => !cands.some((o) => o !== e && e.contains(o))) || cands[0];
          if (el) {
            try { el.scrollIntoView({ block: "center" }); } catch (e) {}
            el.click();
            marcarParaClicReal(el); // además, clic REAL (trusted) para que React de TikTok lo fije
            okC = true;
          }
          if (!okC) await dur(300);
        }
        if (okC) ok++; else faltan.push("opcion:" + p.texto);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "checkVarios") {
        // Marca TODAS las casillas cuyo texto coincida con alguna etiqueta (p.ej. las
        // 3 de "Declaración" de TikTok), hasta 'max'. Las deja para clic real.
        // REINTENTA: la sección "Declaración" también se pinta con retraso.
        const kws = norm(p.etiquetas).split("|").filter(Boolean);
        const max = p.max || 99;
        const marcarCasillas = () => {
          const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
          let n = 0;
          for (const c of cbs) {
            if (n >= max) break;
            if (c.checked) { n++; continue; }
            let t = " " + (c.getAttribute("aria-label") || "") + " ";
            let par = c.parentElement, k = 0;
            while (par && k < 4) { t += " " + (par.innerText || ""); par = par.parentElement; k++; }
            const ct = norm(t);
            if (kws.some((kw) => ct.indexOf(kw) >= 0)) {
              marcarRadioEl(c); marcarParaClicReal(c); ok++; n++;
            }
          }
          return n;
        };
        let n = 0;
        for (let intentoCV = 0; intentoCV < (p.reintentos || 1) && n === 0; intentoCV++) {
          n = marcarCasillas();
          if (n === 0) await dur(400);
        }
        if (n === 0) faltan.push("checkVarios:" + p.etiquetas);
      } else if (p.tipo === "checkLabel") {
        // Marca UNA casilla por su etiqueta cercana (sin name): usa el rótulo AJUSTADO
        // (aria-label / aria-labelledby / label-for / padre corto / hermano) para no
        // confundirse con casillas vecinas que comparten contenedor (formularios GitHub).
        const kws = (p.texto || "").split("|").map(norm).filter(Boolean);
        const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
        let el = null;
        for (const c of cbs) {
          if (c.checked) continue;
          let lab = " " + (c.getAttribute("aria-label") || "") + " ";
          const lb = c.getAttribute("aria-labelledby");
          if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) lab += " " + (le.innerText || ""); });
          if (c.id) { const lf = document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]'); if (lf) lab += " " + (lf.innerText || ""); }
          if (c.parentElement && (c.parentElement.innerText || "").length < 240) lab += " " + (c.parentElement.innerText || "");
          if (c.nextElementSibling) lab += " " + (c.nextElementSibling.innerText || "");
          if (kws.some((kw) => norm(lab).indexOf(kw) >= 0)) { el = c; break; }
        }
        if (el) { marcarRadioEl(el); marcarParaClicReal(el); ok++; } else faltan.push("checkLabel:" + p.texto);
      } else if (p.tipo === "clickBoton") {
        // Pulsa un botón por su texto (p. ej. "Siguiente"/"Next"). Evita Enviar/Submit.
        const kws = norm(p.texto).split("|").filter(Boolean);
        const btns = Array.prototype.slice.call(
          document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a'));
        const btn = btns.find((b) => {
          const t = norm(b.innerText || b.value || b.textContent || "");
          const r = b.getBoundingClientRect();
          return t && r.width > 1 && r.height > 1 && !b.disabled &&
            t.indexOf("enviar") < 0 && t.indexOf("submit") < 0 &&
            kws.some((kw) => t === kw || t.indexOf(kw) >= 0);
        });
        if (btn) { btn.click(); ok++; } else faltan.push("boton:" + p.texto);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "fillUrlList") {
        // Autollena las cajas "Enlace 1..30" de Meta (FB/IG) con la lista de URLs del
        // Excel. Si hay más URLs que cajas y existe el checkbox "Tengo enlaces
        // adicionales...", lo marca para que aparezcan las cajas 11..30.
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        if (urls.length) {
          const dom = norm(p.dominio || "");
          // Devuelve, en orden del DOM, las cajas de URL visibles y vacías cuyo
          // placeholder contenga el dominio (facebook.com / instagram.com).
          const buscarCajas = () => Array.prototype.slice.call(
            document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || ph.indexOf(dom) < 0) return false;
              if (e.value) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          // URLs que YA están puestas en una caja (pasadas anteriores del motor): así el
          // paso se da por hecho en vez de reintentar hasta agotar el tiempo.
          const yaPuestas = () => {
            const dominio = norm(p.dominio || "");
            return Array.prototype.slice.call(
              document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
              .filter((e) => e.value && norm(e.placeholder || "").indexOf(dominio) >= 0 &&
                urls.indexOf(e.value.trim()) >= 0).length;
          };
          let cajas = buscarCajas();
          // ¿Faltan cajas? Marca el checkbox de "enlaces adicionales" y espera a que
          // el formulario revele las cajas 11..30 (React las agrega de forma asíncrona).
          if (urls.length > cajas.length + yaPuestas() && p.checkLabel) {
            const kws = (p.checkLabel || "").split("|").map(norm).filter(Boolean);
            const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
            let cb = null;
            for (const c of cbs) {
              // El value (en inglés) sirve de respaldo cuando Meta reescribe el rótulo.
              let lab = " " + (c.value || "") + " " + (c.getAttribute("aria-label") || "") + " ";
              const lb = c.getAttribute("aria-labelledby");
              if (lb) lb.split(/\s+/).forEach(function (idr) { const le = document.getElementById(idr); if (le) lab += " " + (le.innerText || ""); });
              if (c.id) { const lf = document.querySelector('label[for="' + c.id.replace(/"/g, '\\"') + '"]'); if (lf) lab += " " + (lf.innerText || ""); }
              if (c.parentElement && (c.parentElement.innerText || "").length < 240) lab += " " + (c.parentElement.innerText || "");
              if (kws.some((kw) => norm(lab).indexOf(kw) >= 0)) { cb = c; break; }
            }
            if (cb && !cb.checked) {
              marcarRadioEl(cb); marcarParaClicReal(cb);
              let previo = cajas.length;
              for (let it = 0; it < 8; it++) {
                await dur(400);
                const ahora = buscarCajas();
                if (ahora.length >= urls.length || ahora.length === previo) { cajas = ahora; if (ahora.length >= urls.length) break; }
                previo = ahora.length; cajas = ahora;
              }
            }
            cajas = buscarCajas();
          }
          // Rellena en orden: la URL i-ésima que aún no esté puesta -> caja libre i.
          const pendientesU = urls.filter((u) => {
            const dominio = norm(p.dominio || "");
            return !Array.prototype.slice.call(
              document.querySelectorAll('textarea, input[type=text], input[type=url], input:not([type])'))
              .some((e) => e.value && e.value.trim() === u && norm(e.placeholder || "").indexOf(dominio) >= 0);
          });
          let puestas = 0;
          for (let i = 0; i < pendientesU.length && i < cajas.length; i++) { setNative(cajas[i], pendientesU[i]); puestas++; }
          const total = yaPuestas(); // recuenta el DOM: incluye las que se acaban de poner
          if (puestas > 0) ok++;
          if (total < urls.length) faltan.push("urls:" + total + "/" + urls.length + " (tope 30 de Meta)");
        }
      } else if (p.tipo === "fillDifamUrls") {
        // Formulario de difamación (FB/IG): primero elige en el <select> nativo
        // "¿Cuántas URL quieres denunciar?" la cantidad N (= número de URLs del Excel),
        // espera a que el formulario revele los N bloques, llena cada "URL n.º i" con su
        // URL y pone el MISMO texto de difamación (ctx.justif) en cada "Motivo:".
        const urls = (p.urls || []).map((u) => (u || "").toString().trim()).filter(Boolean);
        const motivo = (p.motivo || "").toString();
        const cant = Math.max(urls.length, 1);
        // Cuenta los inputs/textarea de URL visibles (placeholder contiene "url (http").
        const buscarUrlInputs = () => Array.prototype.slice.call(
          document.querySelectorAll('input, textarea'))
          .filter((e) => {
            const ph = norm(e.placeholder || "");
            if (!ph || ph.indexOf("url (http") < 0) return false;
            const r = e.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
          });
        // a) Ubica el <select> de cantidad por su rótulo cercano.
        const selects = Array.prototype.slice.call(document.querySelectorAll('select'));
        let selCant = null;
        for (const s of selects) {
          let rot = "";
          try { if (s.id) { const lf = document.querySelector('label[for="' + (s.id + "").replace(/"/g, '\\"') + '"]'); if (lf) rot += " " + (lf.innerText || ""); } } catch (e) {}
          if (s.parentElement) rot += " " + (s.parentElement.innerText || "");
          if (s.previousElementSibling) rot += " " + (s.previousElementSibling.innerText || "");
          const nr = norm(rot);
          if (nr.indexOf("cuantas url") >= 0 || nr.indexOf("how many url") >= 0) { selCant = s; break; }
        }
        // b) Elige la opción = cant (match exacto por text/value; si no, la que lo contenga).
        if (selCant) {
          const objetivo = String(cant);
          let idx = -1, idxContiene = -1;
          for (let i = 0; i < selCant.options.length; i++) {
            const op = selCant.options[i];
            const tx = (op.text || "").trim();
            const vl = (op.value || "").trim();
            if (tx === objetivo || vl === objetivo) { idx = i; break; }
            if (idxContiene < 0 && ((tx.match(/\d+/) && tx.match(/\d+/)[0] === objetivo) || (vl.match(/\d+/) && vl.match(/\d+/)[0] === objetivo))) idxContiene = i;
          }
          if (idx < 0) idx = idxContiene;
          if (idx >= 0) {
            selCant.selectedIndex = idx;
            selCant.dispatchEvent(new Event("change", { bubbles: true }));
          }
          // c) Espera (máx. 10 iteraciones) a que aparezcan los bloques de URL.
          for (let it = 0; it < 10; it++) {
            if (buscarUrlInputs().length >= cant) break;
            await dur(300);
          }
        }
        // d) Llena las URLs en orden: URL i -> caja i.
        const urlInputs = buscarUrlInputs();
        let puestasU = 0;
        for (let i = 0; i < urls.length && i < urlInputs.length; i++) { setNative(urlInputs[i], urls[i]); puestasU++; }
        // e) Llena los Motivos con el MISMO texto de difamación en cada uno.
        let puestasM = 0;
        if (motivo) {
          const motTextareas = Array.prototype.slice.call(document.querySelectorAll('textarea'))
            .filter((e) => {
              const ph = norm(e.placeholder || "");
              if (!ph || (ph.indexOf("perjudica tu reputacion") < 0 && ph.indexOf("afirmaciones concretas") < 0)) return false;
              const r = e.getBoundingClientRect();
              return r.width > 2 && r.height > 2;
            });
          for (let i = 0; i < cant && i < motTextareas.length; i++) { setNative(motTextareas[i], motivo); puestasM++; }
        }
        // f) Resultado.
        if (puestasU > 0 || puestasM > 0) ok++;
        if (urls.length > urlInputs.length) faltan.push("difam_urls:" + puestasU + "/" + urls.length);
      }
    } catch (e) { faltan.push((p.name || p.css || "?") + ": " + e.message); }
      if (faltan.length > antesFaltan) {
        // Pasos opcionales (p.ej. botón "Siguiente" inexistente en el form de una
        // página, o campos "tardíos" que llena el vigilante): ni bloquean ni se reportan.
        if (p.opcional || p.tardio) faltan.length = antesFaltan;
        else reintentar.push(p); // no se completó: reintentar en la próxima pasada
      }
    }
    pendientes = reintentar;
    if (opciones.unaPasada) break; // el service worker repite APLICAR cada pocos segundos
  }
  // (El relleno de campos TARDÍOS de la 2.ª etapa lo repite el service worker llamando
  //  a APLICAR con { unaPasada:true } cada pocos segundos; ver autorelleno() en background.js.)
  return { ok: ok, faltan: faltan, clicsReales: clicsReales };
}

// Exponer APLICAR como global para importScripts() del service worker y para el popup.
if (typeof self !== 'undefined') { self.APLICAR = APLICAR; }
