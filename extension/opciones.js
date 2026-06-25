// ============================================================================
//  Editor de marcas. Combina las marcas base con las del usuario (chrome.storage)
//  y guarda los cambios (país, correo, sitio) en chrome.storage.local.
// ============================================================================
const cuerpo = document.getElementById("cuerpo");

function fila(marca, datos) {
  const tr = document.createElement("tr");
  tr.innerHTML =
    '<td><input data-campo="marca" value="' + escAttr(marca) + '"></td>' +
    '<td><input data-campo="pais" value="' + escAttr(datos.pais || "") + '"></td>' +
    '<td><input data-campo="correo" value="' + escAttr(datos.correo || "") + '"></td>' +
    '<td><input data-campo="sitio" value="' + escAttr(datos.sitio || "") + '"></td>' +
    '<td class="acc"><button class="boton del">Quitar</button></td>';
  tr.querySelector(".del").addEventListener("click", () => tr.remove());
  return tr;
}

function escAttr(s) { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

async function cargar() {
  const d = await new Promise((res) =>
    chrome.storage.local.get(["marcas_usuario", "marcas_eliminadas"], (x) => res(x)));
  const guardadas = d.marcas_usuario || {};
  const eliminadas = d.marcas_eliminadas || [];
  const todas = Object.assign({}, window.MARCAS_BASE, guardadas);
  eliminadas.forEach((n) => delete todas[n]);
  cuerpo.innerHTML = "";
  Object.keys(todas).sort().forEach((m) => cuerpo.appendChild(fila(m, todas[m])));
}

document.getElementById("agregar").addEventListener("click", () => {
  cuerpo.appendChild(fila("", { pais: "", correo: "", sitio: "" }));
});

document.getElementById("guardar").addEventListener("click", () => {
  const marcas = {};
  cuerpo.querySelectorAll("tr").forEach((tr) => {
    const v = (c) => tr.querySelector('[data-campo="' + c + '"]').value.trim();
    const nombre = v("marca");
    if (!nombre) return;
    marcas[nombre] = { pais: v("pais"), correo: v("correo"), sitio: v("sitio") };
  });
  // Marcas BASE que el usuario quitó de la tabla = eliminadas (para que no reaparezcan).
  const eliminadas = Object.keys(window.MARCAS_BASE).filter((n) => !(n in marcas));
  chrome.storage.local.set({ marcas_usuario: marcas, marcas_eliminadas: eliminadas }, () => {
    const a = document.getElementById("aviso");
    a.textContent = "✓ Guardado (" + Object.keys(marcas).length + " marcas).";
    setTimeout(() => (a.textContent = ""), 2500);
  });
});

cargar();
