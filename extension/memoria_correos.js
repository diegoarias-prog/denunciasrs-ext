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

let MEMORIA = {};   // { dominio: {nombre, nota, base, correos:[{correo,veces,ultima}]} }

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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function limpiar_formulario() {
  ["campo_sitio", "campo_nombre", "campo_correos", "campo_nota"].forEach((id) => ($(id).value = ""));
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
    correos: correosFicha
  }, () => {
    aviso("✅ Guardado: " + clave);
    limpiar_formulario();
    recargar();
  });
});

$("limpiar_form").addEventListener("click", limpiar_formulario);
$("buscador").addEventListener("input", pintar_tabla);

recargar();
