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
//
//  3) CLAVE DE LA RED (clave_de_red): además del sitio denunciado, cada reporte
//     se apunta también bajo la clave de SU RED. Si la red tiene dominio conocido
//     (DOMINIO_DE_RED) la clave es ese dominio ("cloudflare.com"); si no —las
//     plataformas que crea el usuario en el popup, con nombres libres— la clave
//     es "red:" + el nombre en minúsculas ("red:miplataforma"). Un dominio nunca
//     lleva ":", así que las dos clases de clave no pueden chocar.
//     Una clave "red:" SOLO guarda correos "para siempre": muchas de esas redes
//     son categorías ("Apps maliciosas", "Delisting") cuyo buzón depende del
//     sitio, así que no se le apunta nada al enviar ni se usa para sugerir.
//     SEGURIDAD: ninguna clave con nombre del prototipo ("toString",
//     "constructor"…) y cada correo guardado tiene que ser UNO solo.
//
//  4) CORREOS GUARDADOS PARA SIEMPRE (`siempre: true` en la ficha de una red):
//     con el botón "💾 Guardar estos correos para futuros reportes" de
//     correo.html se guarda EXACTAMENTE la lista del "Para" de ese momento, y en
//     cada reporte futuro de esa red se ponen solos en el "Para". Una ficha
//     "siempre" no se mezcla con la semilla: es la lista que dejó el usuario, así
//     que quitar un correo y volver a guardar lo quita de verdad.
// ============================================================================
(function () {
  "use strict";

  // ---- 1) Destinos fijos por red (clave = nombre de la red en minúsculas) ----
  var FIJOS_POR_RED = {
    "tiktok": ["copyright@tiktok.com", "ip-reports@tiktok.com", "ip_reports@tiktok.com"],
    // Cloudflare: abuso general, respuestas de abuso y abuso del registrador.
    "cloudflare": ["abuse@cloudflare.com", "abusereply@cloudflare.com", "registrar-abuse@cloudflare.com"]
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
    "scribd": "scribd.com",
    "cloudflare": "cloudflare.com"
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
    "scribd.com":    { nombre: "Scribd",    correos: ["copyright@scribd.com", "support@scribd.com"], nota: "Información confidencial / derechos de autor" },
    "cloudflare.com": { nombre: "Cloudflare", correos: ["abuse@cloudflare.com", "abusereply@cloudflare.com", "registrar-abuse@cloudflare.com"], nota: "Sitios fraudulentos / phishing alojados o registrados en Cloudflare (van los tres siempre)" }
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

  // UNA dirección de correo, y nada más. Devuelve la dirección (sin espacios en los
  // extremos) o "" si `t` no es exactamente un correo válido. Lo que se GUARDA en la
  // memoria pasa por aquí: una entrada "ip@instagram.com\r\nx@evil.com" contaría
  // como un correo y, al pasar al "Para", se partiría en dos destinatarios.
  var REGEX_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  function correo_unico(t) {
    var c = texto(t).trim();
    return REGEX_CORREO.test(c) ? c : "";
  }

  // Clave de ficha ADMITIDA: cualquier texto no vacío salvo los nombres que existen
  // en el prototipo de los objetos ("__proto__", "constructor", "toString",
  // "valueOf", "hasOwnProperty"…) y "prototype": una clave así rompía leer() y
  // dejaba la memoria vacía. NO se exige forma de dominio: versiones anteriores
  // guardaban la clave tal cual la escribía el usuario ("softonic", "mi sitio") y
  // esas fichas no pueden desaparecer. Los dominios IDN (.xn--p1ai) también valen.
  function clave_valida(k) {
    var t = texto(k);
    return t.trim() !== "" && t !== "prototype" && t !== "__proto__" && !(t in Object.prototype);
  }
  function propia(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

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
    var k = texto(red).trim().toLowerCase();
    return propia(FIJOS_POR_RED, k) ? FIJOS_POR_RED[k] : [];
  }

  function dominio_de_red(red) {
    var k = texto(red).trim().toLowerCase();
    return propia(DOMINIO_DE_RED, k) ? DOMINIO_DE_RED[k] : "";
  }

  // Clave de memoria PROPIA de una red. Toda red tiene una:
  //   - con dominio conocido (DOMINIO_DE_RED): ese dominio ("cloudflare.com"), y así
  //     comparte ficha con los enlaces denunciados de ese mismo sitio;
  //   - si no (plataformas creadas por el usuario, nombres libres): PREFIJO_RED +
  //     el nombre en minúsculas con los espacios juntados ("red:mi plataforma").
  //     Un dominio nunca lleva ":", así que no puede chocar con uno;
  //   - sin red: "".
  var PREFIJO_RED = "red:";
  function clave_de_red(red) {
    var dom = dominio_de_red(red);
    if (dom) return dom;
    var nombre = texto(red).trim().toLowerCase().replace(/\s+/g, " ");
    return nombre ? PREFIJO_RED + nombre : "";
  }

  function es_clave_de_categoria(k) { return texto(k).indexOf(PREFIJO_RED) === 0; }

  // Claves de memoria que aplican a un reporte: la clave de la red + los
  // dominios de los enlaces que se están denunciando. ORDEN: el dominio de la red
  // (si lo tiene) va primero, como siempre; una clave "red:" va al FINAL, detrás
  // de los sitios denunciados.
  // OJO: una clave "red:" (red SIN dominio) SOLO sirve para los correos guardados
  // "para siempre". Muchas de esas "redes" son categorías ("Apps maliciosas",
  // "Delisting", "Ofertas falsas"…) cuyo buzón depende del sitio: si se fueran
  // acumulando ahí los buzones de cada envío, un sitio nuevo sin ficha heredaría
  // el de OTRO sitio. Por eso recordar_uso no la llena y sugerencias solo la usa
  // si está marcada `siempre`.
  function claves_de(red, urls) {
    var claves = [], vistos = {};
    var de_red = clave_de_red(red);
    var primero = de_red.indexOf(PREFIJO_RED) === 0 ? [] : [de_red];
    var ultimo = primero.length ? [] : [de_red];
    primero.concat(dominios_de(urls), ultimo).forEach(function (d) {
      if (d && !vistos[d]) { vistos[d] = 1; claves.push(d); }
    });
    return claves;
  }

  // ---- Lectura de la memoria (semilla + lo aprendido/editado a mano) ----
  //  Devuelve { clave: {nombre, nota, correos:[{correo, veces, ultima}], base:bool, siempre:bool} }
  //  Una ficha `siempre` NO se mezcla con la semilla: su lista es la que dejó el
  //  usuario, tal cual (si quitó un correo de fábrica, no vuelve).
  function leer(cb) {
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var guardado = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      // Sin prototipo: out["toString"] no puede devolver una función heredada.
      var out = Object.create(null);
      Object.keys(SEMILLA).forEach(function (k) {
        out[k] = {
          nombre: SEMILLA[k].nombre, nota: SEMILLA[k].nota || "", base: true,
          correos: SEMILLA[k].correos.map(function (c) { return { correo: c, veces: 0, ultima: "" }; })
        };
      });
      Object.keys(guardado).forEach(function (k) {
        if (!clave_valida(k)) return;              // clave del prototipo: se ignora, no rompe
        var g = (guardado[k] && typeof guardado[k] === "object") ? guardado[k] : {};
        if (g.oculto) { delete out[k]; return; }   // ficha base borrada a mano
        var base = out[k] || { nombre: "", nota: "", base: false, correos: [] };
        var correos = g.siempre === true ? [] : base.correos.slice();
        (Array.isArray(g.correos) ? g.correos : []).forEach(function (c) {
          var dir = correo_unico(c && c.correo);
          if (!dir) return;
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
          base: !!base.base, siempre: g.siempre === true, correos: correos
        };
      });
      cb(out);
    });
  }

  // Escribe una ficha completa en la memoria (la usa la página de edición).
  // `ficha.siempre` (true/false) lo fija; si no viene, se conserva el que tuviera.
  function guardar_ficha(clave, ficha, cb) {
    var k = texto(clave).trim().toLowerCase();
    if (!clave_valida(k)) { if (cb) cb(false); return; }
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      var previa = (propia(mem, k) && mem[k] && typeof mem[k] === "object") ? mem[k] : {};
      var siempre = (ficha && typeof ficha.siempre === "boolean") ? ficha.siempre : previa.siempre === true;
      var vistos = {};
      mem[k] = {
        nombre: texto(ficha && ficha.nombre),
        nota: texto(ficha && ficha.nota),
        // Solo entradas que son UN correo válido, sin repetir.
        correos: (ficha && Array.isArray(ficha.correos) ? ficha.correos : []).map(function (c) {
          return { correo: correo_unico(c && c.correo), veces: (c && c.veces) || 0, ultima: texto(c && c.ultima) };
        }).filter(function (c) {
          var id = c.correo.toLowerCase();
          if (!c.correo || vistos[id]) return false;
          vistos[id] = 1;
          return true;
        })
      };
      // También se guarda el `false` de una ficha que el usuario APAGÓ: así la
      // importación (opciones.js) sabe que aquí se apagó a propósito y no la
      // vuelve a encender con lo que traiga otra PC.
      if (siempre || typeof previa.siempre === "boolean") mem[k].siempre = siempre;
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Borra una ficha. Si venía de la SEMILLA se marca como oculta para que no vuelva.
  function borrar_ficha(clave, cb) {
    var k = texto(clave).trim().toLowerCase();
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      if (propia(SEMILLA, k)) mem[k] = { oculto: true };
      else if (propia(mem, k)) delete mem[k];
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Apunta en la memoria que se usaron estos correos para denunciar a estos
  // sitios (sube el contador y la fecha). Es lo que hace que la próxima denuncia
  // al mismo sitio ya traiga el correo puesto. Nunca debe romper el envío.
  function recordar_uso(claves, correos, extra, cb) {
    var dirs = lista_correos(Array.isArray(correos) ? correos.join(", ") : correos);
    var ks = (Array.isArray(claves) ? claves : [claves]).map(function (k) { return texto(k).trim().toLowerCase(); }).filter(clave_valida);
    if (!dirs.length || !ks.length) { if (cb) cb(false); return; }
    var ahora = new Date().toISOString();
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      ks.forEach(function (k) {
        var existe = propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto;
        // Clave "red:" (red sin dominio, a menudo una CATEGORÍA): no se le apunta
        // nada; solo suben los contadores si es una ficha "para siempre".
        if (es_clave_de_categoria(k) && !(existe && mem[k].siempre === true)) return;
        var f = existe ? mem[k] : { nombre: "", nota: "", correos: [] };
        if (!Array.isArray(f.correos)) f.correos = [];
        if (!f.nombre) f.nombre = texto(extra && extra.nombre) || (propia(SEMILLA, k) ? SEMILLA[k].nombre : "");
        dirs.forEach(function (dir) {
          var ya = f.correos.filter(function (o) { return texto(o.correo).toLowerCase() === dir.toLowerCase(); })[0];
          if (ya) { ya.veces = (ya.veces || 0) + 1; ya.ultima = ahora; }
          // Una ficha "para siempre" es la lista EXACTA que guardó el usuario: un
          // correo suelto de un envío no se le cuela (solo suben los contadores).
          else if (f.siempre !== true) f.correos.push({ correo: dir, veces: 1, ultima: ahora });
        });
        delete f.oculto;
        mem[k] = f;
      });
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true); });
    });
  }

  // Sugerencias para un reporte concreto: [{clave, nombre, correo, veces, ultima}]
  // ordenadas por uso. La red con dominio va primero (es el destinatario más
  // probable). Una ficha "red:" solo cuenta si está marcada `siempre`.
  function sugerencias(red, urls, cb) {
    var claves = claves_de(red, urls);
    if (!claves.length) { cb([], claves); return; }
    leer(function (mem) {
      var out = [], vistos = {};
      claves.forEach(function (k) {
        var f = mem[k];
        if (!f) return;
        if (es_clave_de_categoria(k) && !f.siempre) return;
        f.correos.forEach(function (c) {
          // El mismo correo puede estar en la ficha del sitio y en la de la red:
          // se propone una sola vez (con la clave que va primero).
          var id = texto(c.correo).toLowerCase();
          if (vistos[id]) return;
          vistos[id] = 1;
          out.push({ clave: k, nombre: f.nombre || k, nota: f.nota || "", correo: c.correo, veces: c.veces || 0, ultima: c.ultima || "" });
        });
      });
      cb(out, claves);
    });
  }

  // ---- Correos guardados PARA SIEMPRE de una red ----
  // Guarda EXACTAMENTE la lista de `texto_correos` (el "Para" de correo.html) en la
  // ficha de la red, marcada `siempre: true`. Reemplaza la lista anterior —así,
  // quitar un correo y volver a guardar lo quita— pero conserva los contadores de
  // uso de los que sigan. cb(ok, clave, correos).
  function guardar_para_siempre(red, texto_correos, cb) {
    var k = clave_de_red(red);
    // lista_correos ya devuelve entradas que son, cada una, UN correo válido.
    var dirs = lista_correos(texto_correos).filter(correo_unico);
    if (!clave_valida(k) || !dirs.length) { if (cb) cb(false, k, dirs); return; }
    chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
      var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
      var previa = (propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto) ? mem[k] : {};
      var antes = Array.isArray(previa.correos) ? previa.correos : [];
      mem[k] = {
        nombre: texto(previa.nombre) || (propia(SEMILLA, k) ? SEMILLA[k].nombre : "") || texto(red).trim(),
        nota: previa.nota !== undefined ? texto(previa.nota) : (propia(SEMILLA, k) ? SEMILLA[k].nota : ""),
        siempre: true,
        correos: dirs.map(function (dir) {
          var ya = antes.filter(function (o) { return texto(o && o.correo).toLowerCase() === dir.toLowerCase(); })[0];
          return { correo: dir, veces: (ya && ya.veces) || 0, ultima: texto(ya && ya.ultima) };
        })
      };
      var set = {}; set[CLAVE_MEMORIA] = mem;
      chrome.storage.local.set(set, function () { if (cb) cb(true, k, dirs); });
    });
  }

  // Correos que van SOLOS en el "Para" de todo reporte de esa red: los de su ficha
  // si está marcada `siempre`. cb([correos]); vacío si no hay.
  function correos_para_siempre(red, cb) {
    var k = clave_de_red(red);
    if (!k) { cb([]); return; }
    leer(function (mem) {
      var f = mem[k];
      cb(f && f.siempre ? f.correos.map(function (c) { return c.correo; }) : []);
    });
  }

  // Enciende o apaga la marca `siempre` de una ficha (la usa la página de la
  // memoria). Al encenderla queda fija la lista que el usuario ve en ese momento
  // (semilla incluida); al apagarla los correos se quedan como simples sugerencias.
  function marcar_siempre(clave, valor, cb) {
    var k = texto(clave).trim().toLowerCase();
    if (!clave_valida(k)) { if (cb) cb(false); return; }
    leer(function (vista) {
      var v = vista[k];
      if (!v) { if (cb) cb(false); return; }
      chrome.storage.local.get([CLAVE_MEMORIA], function (x) {
        var mem = (x && x[CLAVE_MEMORIA] && typeof x[CLAVE_MEMORIA] === "object") ? x[CLAVE_MEMORIA] : {};
        var f = (propia(mem, k) && mem[k] && typeof mem[k] === "object" && !mem[k].oculto) ? mem[k] : { nombre: v.nombre || "", nota: v.nota || "", correos: [] };
        if (valor) {
          // La vista de leer() ya trae solo correos válidos; se vuelve a filtrar por si acaso.
          f.correos = v.correos.filter(function (c) { return correo_unico(c.correo); })
            .map(function (c) { return { correo: correo_unico(c.correo), veces: c.veces || 0, ultima: c.ultima || "" }; });
        }
        f.siempre = !!valor;
        mem[k] = f;
        var set = {}; set[CLAVE_MEMORIA] = mem;
        chrome.storage.local.set(set, function () { if (cb) cb(true); });
      });
    });
  }

  window.CORREOS_DENUNCIA = {
    CLAVE_MEMORIA: CLAVE_MEMORIA,
    FIJOS_POR_RED: FIJOS_POR_RED,
    SEMILLA: SEMILLA,
    dominio_de: dominio_de,
    dominios_de: dominios_de,
    dominio_de_red: dominio_de_red,
    PREFIJO_RED: PREFIJO_RED,
    clave_de_red: clave_de_red,
    claves_de: claves_de,
    lista_correos: lista_correos,
    correo_unico: correo_unico,
    clave_valida: clave_valida,
    unir_correos: unir_correos,
    fijos_de_red: fijos_de_red,
    leer: leer,
    guardar_ficha: guardar_ficha,
    borrar_ficha: borrar_ficha,
    recordar_uso: recordar_uso,
    sugerencias: sugerencias,
    guardar_para_siempre: guardar_para_siempre,
    correos_para_siempre: correos_para_siempre,
    marcar_siempre: marcar_siempre
  };
})();
