// ============================================================================
//  Lógica del popup: arma el "plan de relleno" para (formulario, marca) y lo
//  inyecta en la pestaña activa con chrome.scripting (MV3). El motor de relleno
//  (función APLICAR) se ejecuta en el contexto de la página del formulario.
// ============================================================================

// --- Marcas: base + las editadas/agregadas en Opciones − las eliminadas ---
async function obtener_marcas() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  const todas = Object.assign({}, window.MARCAS_BASE, guardadas);
  eliminadas.forEach((n) => delete todas[n]);
  return todas;
}

const $ = (id) => document.getElementById(id);

function mostrar_estado(clase, html) {
  const e = $("estado");
  e.className = "estado " + clase;
  e.innerHTML = html;
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

function redes_disponibles() {
  const reds = [];
  Object.keys(window.FORMULARIOS).forEach((k) => {
    const f = window.FORMULARIOS[k];
    if (reds.indexOf(f.red) < 0) reds.push(f.red);
  });
  return reds;
}

function formularios_de_red(red) {
  return Object.keys(window.FORMULARIOS)
    .filter((k) => window.FORMULARIOS[k].red === red)
    .map((k) => ({ value: k, texto: window.FORMULARIOS[k].nombre }));
}

let MARCAS = {};

async function inicializar() {
  MARCAS = await obtener_marcas();
  llenar_select($("sel_red"), redes_disponibles().map((r) => ({ value: r, texto: r })));
  llenar_select($("sel_marca"), Object.keys(MARCAS).sort().map((m) => ({ value: m, texto: m })));
  refrescar_formularios();
}

function refrescar_formularios() {
  llenar_select($("sel_form"), formularios_de_red($("sel_red").value));
}

$("sel_red").addEventListener("change", refrescar_formularios);
$("abrir_opciones").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$("abrir_politicas").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("politicas.html") }); });
$("abrir_plantilla").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("plantilla.html") }); });

$("boton_rellenar").addEventListener("click", rellenar);

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
  if (!formKey || !marca) { mostrar_estado("aviso", "Elige red, formulario y marca."); return; }

  const form = window.FORMULARIOS[formKey];
  const datos = MARCAS[marca] || {};
  // Código de red para la justificación de difamación (fb/ig/tk).
  const redCode = { Facebook: "fb", Instagram: "ig", TikTok: "tk" }[form.red] || "";
  const pais = datos.pais || "";
  // Formularios web: justificación en INGLÉS. Para los correos también la versión española.
  const justif = window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, "en"), formKey, "en");
  const justif_es = window.JUSTIF.conPolitica(window.JUSTIF.justificacion(form.cat, redCode, marca, pais, "es"), formKey, "es");

  const ctx = { marca: marca, datos: datos, justif: justif, justif_es: justif_es, correoPersona: window.CORREO_PERSONA };

  // Redes SIN formulario web (Telegram): se genera un CORREO en una pestaña aparte.
  if (form.tipo === "email") {
    const em = form.construirEmail(ctx);
    chrome.storage.local.set({ email_reporte: em }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("correo.html") });
    });
    mostrar_estado("ok", "Correo de Telegram generado: revisa la pestaña, pega los enlaces t.me/… y envíalo.");
    return;
  }

  const plan = form.construirPlan(ctx);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { mostrar_estado("error", "No encuentro la pestaña activa."); return; }

  // ¿Estamos en el formulario correcto? Si no, lo abrimos, esperamos a que cargue
  // y rellenamos solo (sin tener que pulsar dos veces).
  const hostForm = new URL(plan.url).host.replace(/^www\./, "");
  const hostTab = (() => { try { return new URL(tab.url).host.replace(/^www\./, ""); } catch (e) { return ""; } })();
  $("boton_rellenar").disabled = true;
  if (hostTab.indexOf(hostForm.split(".").slice(-2).join(".")) < 0) {
    mostrar_estado("aviso", "Abriendo el formulario…");
    await chrome.tabs.update(tab.id, { url: plan.url });
    await esperar_carga(tab.id);
    await new Promise((r) => setTimeout(r, 1800)); // tiempo para que aparezcan los campos
  }
  mostrar_estado("aviso", "Rellenando…");
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: APLICAR,
      args: [plan.pasos]
    });
    const r = (res && res[0] && res[0].result) || { ok: 0, faltan: [], clicsReales: [] };
    // Clics REALES de los radios/casillas (los sintéticos no "pegan" en React).
    if (r.clicsReales && r.clicsReales.length) {
      mostrar_estado("aviso", "Marcando opciones…");
      try { await chrome.runtime.sendMessage({ accion: "clicsReales", tabId: tab.id, selectores: r.clicsReales }); }
      catch (e) { /* si falla el modo avanzado, los radios quedan manuales */ }
    }
    let html = "✓ <b>" + r.ok + "</b> campo(s) rellenado(s).";
    if (form.manual) html += "<br><br>📌 " + form.manual;
    if (r.faltan && r.faltan.length) html += "<br><br>No se encontraron (revisa a mano): " + r.faltan.join(", ");
    mostrar_estado(r.ok > 0 ? "ok" : "aviso", html);
  } catch (e) {
    mostrar_estado("error", "Error al rellenar: " + e.message + "<br>¿La pestaña es el formulario y está cargado?");
  } finally {
    $("boton_rellenar").disabled = false;
  }
}

// ===========================================================================
//  MOTOR DE RELLENO — se inyecta y ejecuta DENTRO de la página del formulario.
//  Debe ser autónomo (sin variables externas): se serializa con executeScript.
// ===========================================================================
async function APLICAR(pasos) {
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
  for (const p of pasos) {
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
          const ops = norm(p.opcion).split("|").filter(Boolean); // varias alternativas (es|en)
          let o = null;
          for (let intento = 0; intento < 7 && !o; intento++) {
            await dur(400);
            o = Array.prototype.slice.call(document.querySelectorAll('[role=option],li,[role=menuitem]'))
              .find((x) => { const t = norm(x.innerText); return ops.some((kw) => t.indexOf(kw) >= 0); });
          }
          if (o) { o.click(); ok++; } else { faltan.push("opcion:" + p.opcion); try { document.body.click(); } catch (e) {} }
        } else faltan.push("menu:" + (p.pregunta || p.indice));
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "fillLabel") {
        // Rellena el primer campo VISIBLE y vacío cuyo texto cercano contenga la etiqueta.
        if (p.valor != null && p.valor !== "") {
          const kws = (p.label || "").split("|").map(norm).filter(Boolean);
          const els = Array.prototype.slice.call(
            document.querySelectorAll('textarea,input[type=text],input[type=email],input[type=url],input:not([type])'));
          let hit = null;
          for (const e of els) {
            const r = e.getBoundingClientRect();
            if (r.width < 2 || r.height < 2 || e.value) continue;
            let ctx = " " + (e.placeholder || "") + " " + (e.getAttribute("aria-label") || "") + " ";
            if (e.id) { const lf = document.querySelector('label[for="' + e.id.replace(/"/g, '\\"') + '"]'); if (lf) ctx += " " + (lf.innerText || ""); }
            // En TikTok el título del campo suele ser el hermano ANTERIOR de un ancestro.
            let par = e.parentElement, k = 0;
            while (par && k < 6) {
              const ps = par.previousElementSibling;
              if (ps) ctx += " " + (ps.innerText || "");
              par = par.parentElement; k++;
            }
            const c = norm(ctx);
            if (kws.some((kw) => c.indexOf(kw) >= 0)) { hit = e; break; }
          }
          if (hit) { setNative(hit, p.valor); ok++; } else faltan.push("etiqueta:" + p.label);
        }
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
          if (el) { el.click(); okC = true; }
          if (!okC) await dur(300);
        }
        if (okC) ok++; else faltan.push("opcion:" + p.texto);
        if (p.esperaMs) await dur(p.esperaMs);
      } else if (p.tipo === "checkVarios") {
        // Marca TODAS las casillas cuyo texto coincida con alguna etiqueta (p.ej. las
        // 3 de "Declaración" de TikTok), hasta 'max'. Las deja para clic real.
        const kws = norm(p.etiquetas).split("|").filter(Boolean);
        const max = p.max || 99;
        const cbs = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
        let n = 0;
        for (const c of cbs) {
          if (n >= max) break;
          let t = " " + (c.getAttribute("aria-label") || "") + " ";
          let par = c.parentElement, k = 0;
          while (par && k < 4) { t += " " + (par.innerText || ""); par = par.parentElement; k++; }
          const ct = norm(t);
          if (kws.some((kw) => ct.indexOf(kw) >= 0)) {
            marcarRadioEl(c); marcarParaClicReal(c); ok++; n++;
          }
        }
        if (n === 0) faltan.push("checkVarios:" + p.etiquetas);
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
      }
    } catch (e) { faltan.push((p.name || p.css || "?") + ": " + e.message); }
  }
  return { ok: ok, faltan: faltan, clicsReales: clicsReales };
}

inicializar();
