// ============================================================================
//  AGENDA + MEMORIA DE CORREOS DE DENUNCIA
//
//  Dos cosas distintas viven aquí:
//
//  1) DESTINOS FIJOS POR RED (FIJOS_POR_RED): correos que van SIEMPRE en toda
//     denuncia por correo de esa red, sea cual sea la marca, la categoría del
//     reporte (propiedad intelectual, difamación, apps, lo que sea) y el
//     formato. Se aplican solos a TODOS los formularios tipo "email" de esa red
//     (ver el final de datos/formularios.js) y también al abrir correo.html.
//     TikTok: copyright@tiktok.com, ip-reports@tiktok.com, ip_reports@tiktok.com.
//
//  2) MEMORIA DE CORREOS (chrome.storage.local -> "memoria_correos"): la libreta
//     de direcciones que se llena SOLA. Cada vez que se envía (o se abre en
//     Gmail / en el cliente de correo) un reporte, se guarda a qué correo se
//     mandó, indexado por el DOMINIO del sitio denunciado (softonic.com,
//     mediafire.com…). La próxima vez que se denuncie algo de ese mismo sitio,
//     correo.html propone —y rellena si el "Para" viene vacío— el correo que ya
//     funcionó, sin tener que buscarlo otra vez en la web oficial.
//     La memoria arranca con una SEMILLA de correos ya confirmados y se puede
//     ver/editar/borrar a mano en la página "📒 Correos" (memoria_correos.html).
// ============================================================================
(function () {
  "use strict";

  // ---- 1) Destinos fijos por red (clave = nombre de la red en minúsculas) ----
  var FIJOS_POR_RED = {
    "tiktok": ["copyright@tiktok.com", "ip-reports@tiktok.com", "ip_reports@tiktok.com"]
  };

  // Dominio "oficial" de cada red, para que un reporte de esa red comparta la
  // misma ficha de memoria que un enlace denunciado de ese mismo sitio.
  var DOMINIO_DE_RED = {
    "tiktok": "tiktok.com",
    "facebook": "facebook.com",
    "instagram": "instagram.com",
    "whatsapp": "whatsapp.com",
    "linkedin": "linkedin.com",
    "youtube": "youtube.com",
    "x": "x.com",
    "x / twitter": "x.com",
    "twitter": "x.com",
    "telegram": "telegram.org",
    "github": "github.com",
    "studocu": "studocu.com",
    "scribd": "scribd.com"
  };

  // ---- 2) Semilla de la agenda: correos de denuncia YA confirmados ----
  //  clave = dominio del sitio al que se le denuncia (no el del contenido).
  var SEMILLA = {
    "tiktok.com":    { nombre: "TikTok",    correos: ["copyright@tiktok.com", "ip-reports@tiktok.com", "ip_reports@tiktok.com"], nota: "Propiedad intelectual / derechos de autor (van los tres siempre)" },
    "softonic.com":  { nombre: "Softonic",  correos: ["dmca.softonic@delevitagent.com"], nota: "DMCA / apps no oficiales que suplantan a la marca" },
    "facebook.com":  { nombre: "Facebook",  correos: ["ip@fb.com"], nota: "Propiedad intelectual" },
    "instagram.com": { nombre: "Instagram", correos: ["ip@instagram.com"], nota: "Propiedad intelectual" },
    "whatsapp.com":  { nombre: "WhatsApp",  correos: ["ip@whatsapp.com"], nota: "Propiedad intelectual" },
    "studocu.com":   { nombre: "Studocu",   correos: ["privacy@studocu.com", "support@studocu.com"], nota: "Eliminación de información" },
    "scribd.com":    { nombre: "Scribd",    correos: ["copyright@scribd.com", "support@scribd.com"], nota: "Información confidencial / derechos de autor" }
  };

  var CLAVE_MEMORIA = "memoria_correos";

  // Sufijos de dos niveles (dominio.com.gt, dominio.co.uk…): para quedarnos con
  // el dominio de verdad y no con "com.gt".
  var SEGUNDO_NIVEL = { com: 1, co: 1, net: 1, org: 1, gob: 1, gov: 1, edu: 1, ac: 1, mil: 1, info: 1 };

  function texto(s) { return (s === 0 ? "0" : (s || "")) + ""; }

  // Dominio (registrable) de una URL o de un host suelto. "" si no se puede.
  function dominio_de(u) {
    var v = texto(u).trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
    var host = "";
    try { host = new URL(v).hostname; } catch (e) { return ""; }
    host = host.replace(/^www\./i, "").toLowerCase();
    if (!host || host.indexOf(".") < 0) return "";
    var p = host.split(".");
    if (p.length <= 2) return host;
    var ultimo = p[p.length - 1], penultimo = p[p.length - 2];
    if (ultimo.length === 2 && SEGUNDO_NIVEL[penultimo]) return p.slice(-3).join(".");
    return p.slice(-2).join(".");
  }

  // Dominios (sin repetir) de una lista de URLs.
  function dominios_de(urls) {
    var out = [], vistos = {};
    (Array.isArray(urls) ? urls : []).forEach(function (u) {
      var d = dominio_de(u);
      if (d && !vistos[d]) { vistos[d] = 1; out.push(d); }
    });
    return out;
  }

  // Correos VÁLIDOS que hay en un texto (acepta comas, punto y coma o saltos).
  // Filtro estricto: lo que se guarde o se ponga en el "Para" tiene que ser un
  // correo de verdad (evita basura y cabeceras raras en el envío).
  function lista_correos(t) {
    var out = [], vistos = {};
    texto(t).split(/[\s,;]+/).forEach(function (c) {
      c = c.trim().replace(/^[<("']+|[>)"'.,;]+$/g, "");
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(c)) return;
      var k = c.toLowerCase();
      if (vistos[k]) return;
      vistos[k] = 1;
      out.push(c);
    });
    return out;
  }

  // Une varios textos/listas de correos en una sola cadena "a@x, b@y" sin repetir.
  function unir_correos() {
    var partes = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      partes = partes.concat(Array.isArray(a) ? a : [texto(a)]);
    }
    return lista_correos(partes.join(", ")).join(", ");
  }

  // Correos fijos de una red (array vacío si esa red no tiene).
  function fijos_de_red(red) {
    return FIJOS_POR_RED[texto(red).trim().toLowerCase()] || [];
  }

  function dominio_de_red(red) {
    return DOMINIO_DE_RED[texto(red).trim().toLowerCase()] || "";
  }

  // Claves de memoria que aplican a un reporte: el dominio de la red + los
  // dominios de los enlaces que se están denunciando.
  function claves_de(red, urls) {
    var claves = [], vistos = {};
    [dominio_de_red(red)].concat(dominios_de(urls)).forEach(function (d) {
      if (d && !vistos[d]) { vistos[d] = 1; claves.push(d); }
    });
    return claves;
  }

  // ---- Lectura de la memoria (semilla + lo aprendido/editado a mano) ----
  //  Devuelve { dominio: {nombre, nota, correos:[{correo, veces, ultima}], base:bool} }
  function leer(cb) {
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var guardado = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      var out = {};
      Object.keys(SEMILLA).forEach(function (k) {
        out[k] = {
          nombre: SEMILLA[k].nombre, nota: SEMILLA[k].nota || "", base: true,
          correos: SEMILLA[k].correos.map(function (c) { return { correo: c, veces: 0, ultima: "" }; })
        };
      });
      Object.keys(guardado).forEach(function (k) {
        var g = guardado[k] || {};
        if (g.oculto) { delete out[k]; return; }   // ficha base borrada a mano
        var base = out[k] || { nombre: "", nota: "", base: false, correos: [] };
        var correos = base.correos.slice();
        (Array.isArray(g.correos) ? g.correos : []).forEach(function (c) {
          var dir = texto(c && c.correo).trim();
          if (!lista_correos(dir).length) return;
          var ya = correos.filter(function (o) { return o.correo.toLowerCase() === dir.toLowerCase(); })[0];
          if (ya) { ya.veces = Math.max(ya.veces || 0, c.veces || 0); ya.ultima = c.ultima || ya.ultima; }
          else correos.push({ correo: dir, veces: c.veces || 0, ultima: c.ultima || "" });
        });
        // Los más usados primero; a igual uso, el más reciente.
        correos.sort(function (a, b) {
          return (b.veces || 0) - (a.veces || 0) || texto(b.ultima).localeCompare(texto(a.ultima));
        });
        out[k] = {
          nombre: texto(g.nombre) || base.nombre || "",
          nota: g.nota !== undefined ? texto(g.nota) : (base.nota || ""),
          base: !!base.base, correos: correos
        };
      });
      cb(out);
    });
  }

  // Escribe una ficha completa en la memoria (la usa la página de edición).
  function guardar_ficha(clave, ficha, cb) {
    var k = texto(clave).trim().toLowerCase();
    if (!k) { if (cb) cb(false); return; }
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      mem[k] = {
        nombre: texto(ficha && ficha.nombre),
        nota: texto(ficha && ficha.nota),
        correos: (ficha && Array.isArray(ficha.correos) ? ficha.correos : []).map(function (c) {
          return { correo: texto(c.correo), veces: c.veces || 0, ultima: texto(c.ultima) };
        })
      };
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Borra una ficha. Si venía de la SEMILLA se marca como oculta para que no vuelva.
  function borrar_ficha(clave, cb) {
    var k = texto(clave).trim().toLowerCase();
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      if (SEMILLA[k]) mem[k] = { oculto: true };
      else delete mem[k];
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Apunta en la memoria que se usaron estos correos para denunciar a estos
  // sitios (sube el contador y la fecha). Es lo que hace que la próxima denuncia
  // al mismo sitio ya traiga el correo puesto. Nunca debe romper el envío.
  function recordar_uso(claves, correos, extra, cb) {
    var dirs = lista_correos(Array.isArray(correos) ? correos.join(", ") : correos);
    var ks = (Array.isArray(claves) ? claves : [claves]).map(function (k) { return texto(k).trim().toLowerCase(); }).filter(Boolean);
    if (!dirs.length || !ks.length) { if (cb) cb(false); return; }
    var ahora = new Date().toISOString();
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      ks.forEach(function (k) {
        var f = (mem[k] && !mem[k].oculto) ? mem[k] : { nombre: "", nota: "", correos: [] };
        if (!Array.isArray(f.correos)) f.correos = [];
        if (!f.nombre) f.nombre = texto(extra && extra.nombre) || (SEMILLA[k] ? SEMILLA[k].nombre : "");
        dirs.forEach(function (dir) {
          var ya = f.correos.filter(function (o) { return texto(o.correo).toLowerCase() === dir.toLowerCase(); })[0];
          if (ya) { ya.veces = (ya.veces || 0) + 1; ya.ultima = ahora; }
          else f.correos.push({ correo: dir, veces: 1, ultima: ahora });
        });
        delete f.oculto;
        mem[k] = f;
      });
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Sugerencias para un reporte concreto: [{clave, nombre, correo, veces, ultima}]
  // ordenadas por uso. La red va primero (es el destinatario más probable).
  function sugerencias(red, urls, cb) {
    var claves = claves_de(red, urls);
    if (!claves.length) { cb([], claves); return; }
    leer(function (mem) {
      var out = [];
      claves.forEach(function (k) {
        var f = mem[k];
        if (!f) return;
        f.correos.forEach(function (c) {
          out.push({ clave: k, nombre: f.nombre || k, nota: f.nota || "", correo: c.correo, veces: c.veces || 0, ultima: c.ultima || "" });
        });
      });
      cb(out, claves);
    });
  }

  window.CORREOS_DENUNCIA = {
    CLAVE_MEMORIA: CLAVE_MEMORIA,
    FIJOS_POR_RED: FIJOS_POR_RED,
    SEMILLA: SEMILLA,
    dominio_de: dominio_de,
    dominios_de: dominios_de,
    dominio_de_red: dominio_de_red,
    claves_de: claves_de,
    lista_correos: lista_correos,
    unir_correos: unir_correos,
    fijos_de_red: fijos_de_red,
    leer: leer,
    guardar_ficha: guardar_ficha,
    borrar_ficha: borrar_ficha,
    recordar_uso: recordar_uso,
    sugerencias: sugerencias
  };
})();
