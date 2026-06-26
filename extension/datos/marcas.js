// ============================================================================
//  Datos base de cada MARCA (entradas que el resto se deriva solo).
//  El usuario puede editar/agregar marcas desde la página de Opciones; lo que
//  edite se guarda en chrome.storage y tiene prioridad sobre esta base.
//  Campos por marca: pais, correo, sitio (opcional), play (URL oficial en Google
//  Play Store, opcional), appstore (URL oficial en Apple App Store, opcional) y
//  dominio (dominio legítimo de la marca, ej. credix.com, opcional) y telefono
//  (número de contacto SIN código de país; el código se deriva del país, opcional).
//  El código postal y el código telefónico se derivan del país (ver justificaciones.js).
// ============================================================================
window.MARCAS_BASE = {
  "Banco de Guatemala":          { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=bg.apps.banguapp", appstore: "https://apps.apple.com/us/app/banguapp/id1481911264", dominio: "", telefono: "2429 6000" },
  "Banco Industrial Guatemala":  { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BancoIndustrial/", play: "https://play.google.com/store/apps/details?id=gt.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id510761055", dominio: "", telefono: "2420 3000" },
  "Banco Industrial El Salvador":{ pais: "El Salvador", correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=sv.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id1019352077", dominio: "", telefono: "2213 1717" },
  "Seguros El Roble":            { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.mediprocesos.roblered&hl=es_419", appstore: "https://apps.apple.com/gt/app/roblered/id1090511544", dominio: "", telefono: "2420 3333" },
  "Bi Bank":                     { pais: "Panamá",      correo: "diegoarias@seguridadmaxima.net", sitio: "https://www.facebook.com/BiBankPanama/", play: "https://play.google.com/store/apps/details?id=pa.com.bi.bienlinea", appstore: "https://apps.apple.com/app/id1084721017", dominio: "", telefono: "308 0800" },
  "Banco Promerica Honduras":    { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.soteica.pmmovil.app", appstore: "https://apps.apple.com/app/id1550489214", dominio: "", telefono: "2280 8080" },
  "Banpais":                     { pais: "Honduras",    correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=hn.com.bi.banpais&hl=es_hn", appstore: "https://apps.apple.com/cr/app/banpa%C3%ADs/id1019342453", dominio: "", telefono: "2545 1212" },
  "Produbanco Grupo Promerica":  { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.produbanco", appstore: "https://apps.apple.com/app/id957153659", dominio: "", telefono: "1700 123 123" },
  "Banpro Grupo Promerica":      { pais: "Nicaragua",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.banprogrupopromerica.ni.bancadigital.prod", appstore: "https://apps.apple.com/app/id1548537395", dominio: "", telefono: "2255 9595" },
  "BANCO PICHINCHA":             { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "https://www.facebook.com/BancoPichinchaEcuador/", play: "https://play.google.com/store/apps/details?id=com.yellowpepper.pichincha&hl=es_419", appstore: "https://apps.apple.com/cr/app/pichincha-banca-movil/id999191728", dominio: "", telefono: "22999999" },
  "DEUNA":                       { pais: "Ecuador",     correo: "uspc0008@pichincha.com",         sitio: "", play: "https://play.google.com/store/apps/details?id=com.appdeuna.wallet", appstore: "https://apps.apple.com/app/id1490185584", dominio: "", telefono: "02 299 9999" },
  "Diners Club":                 { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.blu.de.diners.club", appstore: "https://apps.apple.com/app/id6744373951", dominio: "", telefono: "02 2984 400" },
  "Banco Solidario":             { pais: "Ecuador",     correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.solidariosa.banking", appstore: "https://apps.apple.com/app/id1162832934", dominio: "", telefono: "1700 765 432" },
  "Credix":                      { pais: "Costa Rica",  correo: "protecciondemarca@credix.com",    sitio: "", play: "https://play.google.com/store/apps/details?id=com.Mobtion.Credix.Credixcel", appstore: "https://apps.apple.com/app/id505208283", dominio: "credix.com", telefono: "2227 3349" },
  "Zigi":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=gt.com.bi.zigi&hl=es_gt", appstore: "https://apps.apple.com/gt/app/zigi-cr%C3%A9ditos-sin-drama/id6450487993", dominio: "", telefono: "2215 6002" },
  "FRCL":                        { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "", appstore: "", dominio: "", telefono: "2420 3248" },
  "Alerta Medica":               { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=com.doctoronline.alertamedica", appstore: "https://apps.apple.com/app/id6461566805", dominio: "", telefono: "2493 1818" },
  "Grupo Hospitalario La Paz":   { pais: "Guatemala",   correo: "diegoarias@seguridadmaxima.net", sitio: "", play: "https://play.google.com/store/apps/details?id=lapaz.app.starter", appstore: "", dominio: "", telefono: "2217 0300" },
  "Banco GyT Continental":       { pais: "Guatemala",   correo: "protecciondemarca@gtc.com.gt",   sitio: "", play: "https://play.google.com/store/apps/details?id=com.bancacel.bancacelweb2", appstore: "https://apps.apple.com/app/id571668292", dominio: "", telefono: "2338 6868" }
};

// Correo de la persona: cuando una marca usa este correo, en LinkedIn Derechos de
// autor el Nombre/Apellidos/Firma van como "Diego"/"Arias" (ver formularios.js).
window.CORREO_PERSONA = "diegoarias@seguridadmaxima.net";
