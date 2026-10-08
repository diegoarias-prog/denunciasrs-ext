// ============================================================================
//  Página "📒 Memoria de correos": ver, agregar, corregir y borrar los correos
//  de denuncia que ya se usaron con cada sitio (ver datos/correos_denuncia.js).
//  Todo se pinta con textContent / createElement: nada de innerHTML con datos
//  guardados (los correos y notas son texto del usuario, no HTML).
// ============================================================================
const $ = (id) => document.getElementById(id);
const CD = window.CORREOS_DENUNCIA;

function aviso(t) {
  $("aviso").textContent = t;
  setTimeout(() => ($("aviso").textContent = ""), 3500);
}

let MEMORIA = {};   // { clave: {nombre, nota, base, siempre, correos:[{correo,veces,ultima}]} }

function fecha_corta(iso) {
  if (!iso) return "";
  const f = new Date(iso);
  if (isNaN(f.getTime())) return "";
  return f.toLocaleDateString("es-GT");
}

// Pinta la tabla aplicando el texto del buscador.
function pintar_tabla() {
  const cuerpo = $("cuerpo_tabla");
  const filtro = ($("buscador").value || "").trim().toLowerCase();
  cuerpo.textContent = "";

  const claves = Object.keys(MEMORIA).sort().filter((k) => {
    if (!filtro) return true;
    const f = MEMORIA[k];
    const texto = [k, f.nombre, f.nota].concat(f.correos.map((c) => c.correo)).join(" ").toLowerCase();
    return texto.indexOf(filtro) >= 0;
  });

  $("vacio").style.display = claves.length ? "none" : "";

  claves.forEach((k) => {
    const f = MEMORIA[k];
    const tr = document.createElement("tr");

    const tdSitio = document.createElement("td");
    const spSitio = document.createElement("span");
    spSitio.className = "sitio_clave";
    spSitio.textContent = k;
    tdSitio.appendChild(spSitio);
    if (f.base) {
      tdSitio.appendChild(document.createTextNode(" "));
      const et = document.createElement("span");
      et.className = "etiqueta_base";
      et.textContent = "base";
      et.title = "Viene de fábrica con la extensión; puedes editarlo o borrarlo.";
      tdSitio.appendChild(et);
    }
    if (f.siempre) {
      tdSitio.appendChild(document.createTextNode(" "));
      const es = document.createElement("span");
      es.className = "etiqueta_siempre_correos";
      es.textContent = "siempre";
      es.title = "Estos correos se ponen solos en «Para» de cada reporte de esta red.";
      tdSitio.appendChild(es);
    }
    tr.appendChild(tdSitio);

    const tdNombre = document.createElement("td");
    tdNombre.textContent = f.nombre || "";
    tr.appendChild(tdNombre);

    const tdCorreos = document.createElement("td");
    f.correos.forEach((c) => {
      const linea = document.createElement("span");
      linea.className = "correo_guardado";
      linea.textContent = c.correo + " ";
      const v = document.createElement("span");
      v.className = "veces";
      const partes = [];
      if (c.veces) partes.push("usado " + c.veces + "×");
      if (c.ultima) partes.push("últ. " + fecha_corta(c.ultima));
      v.textContent = partes.length ? "(" + partes.join(", ") + ")" : "";
      linea.appendChild(v);
      tdCorreos.appendChild(linea);
    });
    tr.appendChild(tdCorreos);

    const tdNota = document.createElement("td");
    tdNota.textContent = f.nota || "";
    tr.appendChild(tdNota);

    const tdAcc = document.createElement("td");
    tdAcc.className = "celda_accion_correo";
    const bEd = document.createElement("button");
    bEd.className = "boton sec mini";
    bEd.textContent = "✏ Editar";
    bEd.addEventListener("click", () => cargar_en_formulario(k));
    tdAcc.appendChild(bEd);
    tdAcc.appendChild(document.createTextNode(" "));
    const bCop = document.createElement("button");
    bCop.className = "boton sec mini";
    bCop.textContent = "📋 Copiar";
    bCop.addEventListener("click", () => {
      const txt = f.correos.map((c) => c.correo).join(", ");
      navigator.clipboard.writeText(txt).then(() => aviso("✓ Correos copiados")).catch(() => aviso("No se pudo copiar."));
    });
    tdAcc.appendChild(bCop);
    tdAcc.appendChild(document.createTextNode(" "));
    // Encender / apagar "siempre" sin tener que editar la ficha. Una ficha
    // "red:<categoría>" (Apps maliciosas) NO puede ser "siempre": su
    // buzón depende del sitio denunciado y se pondría solo en TODOS (ver
    // migrar_categorias en datos/correos_denuncia.js). Se ve, pero sin ese botón.
    if (CD.es_clave_de_red_por_sitio && CD.es_clave_de_red_por_sitio(k) && !f.siempre) {
      const nota = document.createElement("span");
      nota.className = "nota_categoria_correos";
      nota.textContent = "Categoría: se guarda por sitio";
      nota.title = "Esta red agrupa muchos sitios y cada uno tiene su buzón: guarda los correos «siempre» en la ficha del sitio (aptoide.com, apkpure.com…).";
      tdAcc.appendChild(nota);
      tdAcc.appendChild(document.createTextNode(" "));
    } else {
      const bSie = document.createElement("button");
      bSie.className = "boton sec mini boton_alternar_siempre_correos";
      bSie.textContent = f.siempre ? "📌 Quitar «siempre»" : "📌 Siempre";
      bSie.title = f.siempre
        ? "Dejar de poner estos correos solos en cada reporte (se quedan como sugerencia)."
        : "Poner estos correos solos en «Para» de cada reporte futuro de esta red.";
      bSie.addEventListener("click", () => {
        CD.marcar_siempre(k, !f.siempre, (ok) => {
          aviso(ok ? (f.siempre ? "Ya no se ponen solos: " : "✅ Se pondrán solos siempre: ") + k : "⚠ No se pudo cambiar.");
          recargar();
        });
      });
      tdAcc.appendChild(bSie);
      tdAcc.appendChild(document.createTextNode(" "));
    }
    const bDel = document.createElement("button");
    bDel.className = "boton del mini";
    bDel.textContent = "🗑";
    bDel.title = "Borrar este sitio de la memoria";
    bDel.addEventListener("click", () => {
      if (!confirm("¿Borrar de la memoria los correos guardados para «" + k + "»?")) return;
      CD.borrar_ficha(k, () => { aviso("Sitio borrado de la memoria."); recargar(); });
    });
    tdAcc.appendChild(bDel);
    tr.appendChild(tdAcc);

    cuerpo.appendChild(tr);
  });
}

function cargar_en_formulario(clave) {
  const f = MEMORIA[clave];
  if (!f) return;
  $("campo_sitio").value = clave;
  $("campo_nombre").value = f.nombre || "";
  $("campo_correos").value = f.correos.map((c) => c.correo).join(", ");
  $("campo_nota").value = f.nota || "";
  $("campo_siempre").checked = !!f.siempre;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function limpiar_formulario() {
  ["campo_sitio", "campo_nombre", "campo_correos", "campo_nota"].forEach((id) => ($(id).value = ""));
  $("campo_siempre").checked = false;
}

function recargar() {
  CD.leer((mem) => { MEMORIA = mem; pintar_tabla(); });
}

$("guardar_sitio").addEventListener("click", () => {
  // Se acepta tanto un dominio como una URL completa (se extrae el dominio).
  const escrito = ($("campo_sitio").value || "").trim();
  const clave = CD.dominio_de(escrito) || escrito.toLowerCase();
  if (!clave) { aviso("⚠ Falta el sitio (dominio)."); return; }
  const correos = CD.lista_correos($("campo_correos").value);
  if (!correos.length) { aviso("⚠ Escribe al menos un correo válido."); return; }

  // Se conservan los contadores de uso de los correos que ya estaban.
  const previa = MEMORIA[clave];
  const correosFicha = correos.map((dir) => {
    const ya = previa ? previa.correos.filter((c) => c.correo.toLowerCase() === dir.toLowerCase())[0] : null;
    return { correo: dir, veces: (ya && ya.veces) || 0, ultima: (ya && ya.ultima) || "" };
  });

  CD.guardar_ficha(clave, {
    nombre: ($("campo_nombre").value || "").trim(),
    nota: ($("campo_nota").value || "").trim(),
    siempre: $("campo_siempre").checked,
    correos: correosFicha
  }, (ok) => {
    // guardar_ficha solo admite un dominio (ejemplo.com) o "red:<nombre>".
    if (!ok) { aviso("⚠ «" + clave + "» no es un sitio válido: escribe un dominio (ejemplo.com) o red:nombre."); return; }
    aviso("✅ Guardado: " + clave);
    limpiar_formulario();
    recargar();
  });
});

$("limpiar_form").addEventListener("click", limpiar_formulario);
$("buscador").addEventListener("input", pintar_tabla);

// ---------------------------------------------------------------------------
//  RESUMEN DE LAS MIGRACIONES (ver datos/correos_denuncia.js). Se enseña UNA vez:
//   - migrar_correos_del_registro: qué correos ya enviados se guardaron en qué
//     dominio, cuáles se descartaron por no ser de ese sitio, qué denuncias no
//     tenían enlace y qué fichas "siempre" se APAGARON por tener correos de otro
//     sitio (reparación), para que el usuario lo revise y lo añada a mano;
//   - migrar_categorias: qué fichas antiguas de categoría se movieron o apagaron.
//  Todo con createElement / textContent: los correos son datos, no HTML.
// ---------------------------------------------------------------------------
function linea_resumen(texto_linea) {
  const li = document.createElement("li");
  li.textContent = texto_linea;
  return li;
}
function bloque_resumen(caja, titulo, lineas) {
  if (!lineas.length) return;
  const p = document.createElement("p");
  p.textContent = titulo;
  caja.appendChild(p);
  const ul = document.createElement("ul");
  lineas.forEach((t) => ul.appendChild(linea_resumen(t)));
  caja.appendChild(ul);
}
const POR_QUE_SIN_SIEMPRE = {
  apagada: "lo apagaste tú a mano",
  borrada: "borraste esa ficha a mano (no se ha vuelto a crear)",
  red_con_dominio: "es una red con dominio propio: sus correos van por la red",
  sin_confirmar_envio: "no consta que se ENVIARAN",
  no_anadidos_sin_envio: "no se añadieron a su lista «siempre» porque no consta que se enviaran",
  ajenos: "su ficha tiene correos de OTRO sitio"
};
function texto_sin_siempre(s) {
  let t = s.sitio + ": " + (POR_QUE_SIN_SIEMPRE[s.razon] || s.razon);
  if (s.correos && s.correos.length) t += " (" + s.correos.join(", ") + ")";
  if (s.ajenos && s.ajenos.length) t += ": " + s.ajenos.join(", ") + ". Quítalos con ✏ Editar y pulsa 📌 Siempre";
  return t;
}
const POR_QUE_CATEGORIA = {
  encendida: "se movieron a %s y se pondrán solos al denunciar ese sitio",
  ya_encendida: "se añadieron a la lista «siempre» de %s",
  apagada: "se movieron a %s como sugerencia (esa ficha la apagaste tú)",
  red_con_dominio: "se movieron a %s como sugerencia (va por la red)",
  ajenos: "se movieron a %s como sugerencia: esa ficha tiene correos de otro sitio, revísala",
  oculta: "NO se movieron: borraste la ficha de %s. La de la categoría queda apagada",
  red_con_dominio_siempre: "NO se movieron a %s (ya tiene su lista «siempre»). La de la categoría queda apagada",
  varios_sitios: "son de varios sitios: la ficha de la categoría queda apagada (no se pone sola)"
};
function texto_aviso_categoria(a) {
  const que = (POR_QUE_CATEGORIA[a.razon] || a.razon).replace("%s", a.a || "");
  return a.de + " (" + (a.correos || []).join(", ") + "): " + que;
}

function pintar_resumen_migraciones(resumen, avisos, restauracion) {
  const caja = $("resumen_migracion_registro");
  if (!caja || (!resumen && !avisos && !restauracion)) return;
  caja.textContent = "";
  const titulo = document.createElement("div");
  titulo.className = "titulo_resumen_migracion_correos";
  titulo.textContent = resumen
    ? "📥 Correos de tus denuncias ya enviadas, guardados en el sitio que les corresponde"
    : "📥 Cambios en tus correos guardados";
  // El título va ENCIMA de todo (también de los bloques de la restauración).
  caja.appendChild(titulo);

  // RESTAURACIÓN (ver restaurar_categorias): Delisting, Ofertas falsas de trabajo y
  // Sitios maliciosos Banguat vuelven a guardar sus correos por RED, como antes.
  if (restauracion) {
    const r = restauracion;
    bloque_resumen(caja, "Delisting, Ofertas falsas de trabajo y Sitios maliciosos Banguat vuelven a funcionar como antes. Se restauró:",
      (r.recreadas || []).map((x) => x.clave + " → " + x.correos.join(", ") + " (otra vez «siempre»)")
        .concat((r.reencendidas || []).map((k) => k + " (otra vez «siempre»)"))
        .concat((r.siempre_devuelto || []).map((k) => k + ": «siempre» como estaba antes"))
        .concat((r.quitados || []).map((x) => x.sitio + ": quitados los que había puesto la migración (" + x.correos.join(", ") + ")"))
        .concat((r.fichas_quitadas || []).map((k) => k + ": quitada (la había creado la migración)")));
    bloque_resumen(caja, "Para revisar:", r.dudas || []);
  }

  if (resumen) {
    const guardados = (resumen.guardados || []).filter((g) => g && g.correos && g.correos.length);
    if (!guardados.length) {
      const p = document.createElement("p");
      p.textContent = "No había correos nuevos que guardar: lo que encontré en el Registro ya estaba aquí.";
      caja.appendChild(p);
    }
    bloque_resumen(caja, "Se guardaron:",
      guardados.map((g) => g.sitio + " → " + g.correos.join(", ") + (g.siempre ? " (se ponen solos en «Para» al denunciar ese sitio)" : " (como sugerencia)")));
    bloque_resumen(caja, "En estos sitios NO se encendió «siempre»:", (resumen.sin_siempre || []).map(texto_sin_siempre));
    bloque_resumen(caja, "Se APAGÓ «siempre» porque la ficha tenía correos de OTRO sitio (no se borró nada; revísala con ✏ Editar y pulsa 📌 Siempre):",
      (resumen.reparadas || []).map((r) => r.sitio + ": " + r.ajenos.join(", ")));
    bloque_resumen(caja, "Descartados por no corresponder al sitio denunciado (si eran buenos, añádelos a mano arriba):",
      (resumen.descartados || []).map((d) => d.correo + " (en una denuncia de " + (d.sitios || []).join(", ") + ")"));
    bloque_resumen(caja, "Denuncias sin enlace (no se sabe de qué sitio son sus correos; añádelos a mano si quieres):",
      (resumen.sin_enlace || []).map((d) => (d.marca ? d.marca + " · " : "") + (d.plataforma || "") + " → " + d.correos.join(", ")));
  }
  if (avisos) bloque_resumen(caja, "Fichas antiguas de Apps maliciosas:", avisos.map(texto_aviso_categoria));

  caja.style.display = "";
  // Ya se enseñó: no vuelve a salir la próxima vez que se abra esta página.
  if (resumen) CD.marcar_resumen_migracion_visto();
  if (avisos) CD.marcar_avisos_vistos();
  if (restauracion) CD.marcar_restauracion_vista();
}

// Primero la migración (si el service worker no la hizo ya), luego la tabla.
CD.migrar_correos_del_registro(() => {
  recargar();
  CD.resumen_migracion_registro_pendiente((resumen) => {
    CD.avisos_pendientes((avisos) => {
      CD.informe_restauracion_pendiente((rest) => pintar_resumen_migraciones(resumen, avisos, rest));
    });
  });
});
