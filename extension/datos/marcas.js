// ============================================================================
//  Datos base de cada MARCA (entradas que el resto se deriva solo).
//  El usuario puede editar/agregar marcas desde la página de Opciones; lo que
//  edite se guarda en chrome.storage y tiene prioridad sobre esta base.
//  Campos por marca: pais, correo, sitio (opcional), play (URL oficial en Google
//  Play Store, opcional), appstore (URL oficial en Apple App Store, opcional) y
//  dominio (dominio legítimo de la marca, ej. credix.com, opcional).
//  El código postal y el código telefónico se derivan del país (ver justificaciones.js).
// ============================================================================
window.MARCAS_BASE = {
  "Banco de Guatemala":          { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Banco Industrial Guatemala":  { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BancoIndustrial/", play: "", appstore: "", dominio: "" },
  "Banco Industrial El Salvador":{ pais: "El Salvador", correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Seguros El Roble":            { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Bi Bank":                     { pais: "Panamá",      correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BiBankPanama/", play: "", appstore: "", dominio: "" },
  "Banco Promerica Honduras":    { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Banpais":                     { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Produbanco Grupo Promerica":  { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Banpro Grupo Promerica":      { pais: "Nicaragua",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "BANCO PICHINCHA":             { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "https://www.facebook.com/BancoPichinchaEcuador/", play: "", appstore: "", dominio: "" },
  "DEUNA":                       { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "", play: "", appstore: "", dominio: "" },
  "Diners Club":                 { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Banco Solidario":             { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Credix":                      { pais: "Costa Rica",  correo: "protecciondemarca@credix.com",    sitio: "", play: "https://play.google.com/store/apps/details?id=com.Mobtion.Credix.Credixcel", appstore: "", dominio: "credix.com" },
  "Zigi":                        { pais: "Costa Rica",  correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "FRCL":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Alerta Medica":               { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "La Paz":                      { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "" },
  "Banco GyT Continental":       { pais: "Guatemala",   correo: "protecciondemarca@gtc.com.gt",   sitio: "", play: "", appstore: "", dominio: "" }
};

// Correo de la persona: cuando una marca usa este correo, en LinkedIn Derechos de
// autor el Nombre/Apellidos/Firma van como "Diego"/"Arias" (ver formularios.js).
window.CORREO_PERSONA = "diegoarias@seguridadmaxima.net";
