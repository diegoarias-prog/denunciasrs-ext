// ============================================================================
//  Datos base de cada MARCA (entradas que el resto se deriva solo).
//  El usuario puede editar/agregar marcas desde la página de Opciones; lo que
//  edite se guarda en chrome.storage y tiene prioridad sobre esta base.
//  Campos por marca: pais, correo, sitio (opcional). El código postal y el
//  código telefónico se derivan del país (ver justificaciones.js).
// ============================================================================
window.MARCAS_BASE = {
  "Banco de Guatemala":          { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Banco Industrial Guatemala":  { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BancoIndustrial/" },
  "Banco Industrial El Salvador":{ pais: "El Salvador", correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Seguros El Roble":            { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Bi Bank":                     { pais: "Panamá",      correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BiBankPanama/" },
  "Banco Promerica Honduras":    { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Banpais":                     { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Produbanco Grupo Promerica":  { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Banpro Grupo Promerica":      { pais: "Nicaragua",   correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "BANCO PICHINCHA":             { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "https://www.facebook.com/BancoPichinchaEcuador/" },
  "DEUNA":                       { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "" },
  "Diners Club":                 { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Banco Solidario":             { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Credix":                      { pais: "Costa Rica",  correo: "protecciondemarca@credix.com",    sitio: "" },
  "Zigi":                        { pais: "Costa Rica",  correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "FRCL":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Alerta Medica":               { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "La Paz":                      { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "" },
  "Banco GyT Continental":       { pais: "Guatemala",   correo: "protecciondemarca@gtc.com.gt",   sitio: "" }
};

// Correo de la persona: cuando una marca usa este correo, en LinkedIn Derechos de
// autor el Nombre/Apellidos/Firma van como "Diego"/"Arias" (ver formularios.js).
window.CORREO_PERSONA = "diegoarias@seguridadmaxima.net";
