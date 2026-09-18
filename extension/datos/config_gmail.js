// ============================================================================
//  Configuración del envío directo por la API de Gmail (OAuth).
//  - client_id: ID de cliente OAuth (aplicación web) del proyecto de Google Cloud.
//    NO es secreto: es público y puede ir versionado en la extensión.
//  - dominios: cuentas de Google Workspace propias desde las que se puede ENVIAR
//    directamente (un clic). Si el remitente de un reporte pertenece a uno de estos
//    dominios, se envía DESDE ese mismo correo.
//  - cuenta_envio: la cuenta propia con la que se envía cuando el correo de contacto
//    de la marca es del CLIENTE (uspc0008@pichincha.com, protecciondemarca@credix.com…).
//    Google no deja enviar en nombre de una cuenta ajena, así que esos reportes salen
//    DESDE esta cuenta y llevan "Responder a:" el correo de la marca, para que la
//    respuesta de la plataforma le llegue al cliente igual.
//    Si se deja vacío se usa window.CORREO_PERSONA (datos/marcas.js), que es la cuenta
//    de quien opera la extensión. Tiene que ser de uno de los `dominios` de arriba.
//  El permiso solicitado es SOLO envío (gmail.send): la extensión no puede leer correo.
// ============================================================================
window.CONFIG_GMAIL = {
  client_id: "656838260592-l95p0iptdv8na3lf5teti0l4ebnuoueg.apps.googleusercontent.com",
  dominios: ["seguridadmaxima.net", "securesoft-antifraude.com"],
  cuenta_envio: ""
};
