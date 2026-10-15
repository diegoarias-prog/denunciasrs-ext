// ============================================================================
//  PREFIJOS TELEFÓNICOS INTERNACIONALES (E.164) -> PAÍS
//  Lo usan los 3 formularios de WhatsApp (wa_copy, wa_marca, wa_fals en
//  datos/formularios.js): el usuario pega en el popup el número a denunciar
//  (https://wa.me/51987654321, https://api.whatsapp.com/send?phone=50212345678
//  o el número suelto "+51 987 654 321") y aquí se separa en PREFIJO (+51),
//  PAÍS (Perú) y NÚMERO sin prefijo (987654321).
//
//  LA LISTA ES LA DEL PROPIO FORMULARIO. Se copió el 2026-10-15 del selector de
//  país REAL del formulario de WhatsApp (Chrome sin ventana, idioma es_LA): son
//  sus 239 opciones, en su orden y con sus nombres en español TAL CUAL los
//  escribe WhatsApp ("Antigua", no "Antigua y Barbuda"; "Bosnia-Herzegovina"),
//  más el nombre en inglés de respaldo por si la página sale en inglés. El
//  motor NO se fía solo del nombre: elige la opción cuyo "+NN" coincide, y el
//  nombre solo desempata entre los países que comparten prefijo (+1, +7, +44...).
//
//  Formato de cada fila: [prefijo sin "+", nombre en español, nombre en inglés]
//
//  Expone (en window, como el resto de datos/*.js):
//    window.PREFIJOS_TELEFONICOS.paises         -> la lista de abajo
//    window.PREFIJOS_TELEFONICOS.separar(dig)   -> { codigo, pais, pais_en, numero } | null
//    window.TELEFONO_DE_TEXTO(texto)            -> idem, a partir de una URL o texto
//    window.TELEFONO_DE_URLS(urls)              -> el 1.º número que se encuentre | null
// ============================================================================
(function () {
  var PAISES = [
    ["93", "Afganistán", "Afghanistan"],
    ["355", "Albania", "Albania"],
    ["213", "Argelia", "Algeria"],
    ["1", "Samoa Americana", "American Samoa"],
    ["376", "Andorra", "Andorra"],
    ["244", "Angola", "Angola"],
    ["1", "Anguila", "Anguilla"],
    ["1", "Antigua", "Antigua and Barbuda"],
    ["54", "Argentina", "Argentina"],
    ["374", "Armenia", "Armenia"],
    ["297", "Aruba", "Aruba"],
    ["61", "Australia", "Australia"],
    ["43", "Austria", "Austria"],
    ["994", "Azerbaiyán", "Azerbaijan"],
    ["973", "Baréin", "Bahrain"],
    ["880", "Bangladesh", "Bangladesh"],
    ["1", "Barbados", "Barbados"],
    ["375", "Bielorrusia", "Belarus"],
    ["32", "Bélgica", "Belgium"],
    ["501", "Belice", "Belize"],
    ["229", "Benín", "Benin"],
    ["1", "Bermudas", "Bermuda"],
    ["975", "Bután", "Bhutan"],
    ["591", "Bolivia", "Bolivia"],
    ["599", "Bonaire, San Eustaquio y Saba", "Bonaire, Sint Eustatius and Saba"],
    ["387", "Bosnia-Herzegovina", "Bosnia and Herzegovina"],
    ["267", "Botsuana", "Botswana"],
    ["55", "Brasil", "Brazil"],
    ["246", "Territorio Británico del Océano Índico", "British Indian Ocean Territory"],
    ["1", "Islas Vírgenes Británicas", "British Virgin Islands"],
    ["673", "Brunéi", "Brunei"],
    ["359", "Bulgaria", "Bulgaria"],
    ["226", "Burkina Faso", "Burkina Faso"],
    ["257", "Burundi", "Burundi"],
    ["855", "Camboya", "Cambodia"],
    ["237", "Camerún", "Cameroon"],
    ["1", "Canadá", "Canada"],
    ["238", "Cabo Verde", "Cape Verde"],
    ["1", "Islas Caimán", "Cayman Islands"],
    ["225", "Costa de Marfil", "Ivory Coast"],
    ["236", "República Centroafricana", "Central African Republic"],
    ["235", "Chad", "Chad"],
    ["56", "Chile", "Chile"],
    ["86", "China", "China"],
    ["57", "Colombia", "Colombia"],
    ["269", "Comoras", "Comoros"],
    ["682", "Islas Cook", "Cook Islands"],
    ["506", "Costa Rica", "Costa Rica"],
    ["385", "Croacia", "Croatia"],
    ["53", "Cuba", "Cuba"],
    ["599", "Curazao", "Curacao"],
    ["357", "Chipre", "Cyprus"],
    ["420", "República Checa", "Czech Republic"],
    ["243", "República Democrática del Congo", "Democratic Republic of the Congo"],
    ["45", "Dinamarca", "Denmark"],
    ["253", "Yibuti", "Djibouti"],
    ["1", "Dominica", "Dominica"],
    ["1", "República Dominicana", "Dominican Republic"],
    ["593", "Ecuador", "Ecuador"],
    ["20", "Egipto", "Egypt"],
    ["503", "El Salvador", "El Salvador"],
    ["240", "Guinea Ecuatorial", "Equatorial Guinea"],
    ["291", "Eritrea", "Eritrea"],
    ["372", "Estonia", "Estonia"],
    ["268", "Esuatini", "Eswatini"],
    ["251", "Etiopía", "Ethiopia"],
    ["500", "Islas Malvinas", "Falkland Islands"],
    ["298", "Islas Feroe", "Faroe Islands"],
    ["691", "Estados Federados de Micronesia", "Micronesia"],
    ["679", "Fiyi", "Fiji"],
    ["358", "Finlandia", "Finland"],
    ["33", "Francia", "France"],
    ["594", "Guayana Francesa", "French Guiana"],
    ["689", "Polinesia Francesa", "French Polynesia"],
    ["241", "Gabón", "Gabon"],
    ["995", "Georgia", "Georgia"],
    ["49", "Alemania", "Germany"],
    ["233", "Ghana", "Ghana"],
    ["350", "Gibraltar", "Gibraltar"],
    ["30", "Grecia", "Greece"],
    ["299", "Groenlandia", "Greenland"],
    ["1", "Granada", "Grenada"],
    ["590", "Guadalupe", "Guadeloupe"],
    ["1", "Guam", "Guam"],
    ["502", "Guatemala", "Guatemala"],
    ["44", "Guernsey", "Guernsey"],
    ["224", "Guinea", "Guinea"],
    ["245", "Guinea-Bisáu", "Guinea-Bissau"],
    ["592", "Guyana", "Guyana"],
    ["509", "Haití", "Haiti"],
    ["504", "Honduras", "Honduras"],
    ["852", "Hong Kong", "Hong Kong"],
    ["36", "Hungría", "Hungary"],
    ["354", "Islandia", "Iceland"],
    ["91", "India", "India"],
    ["62", "Indonesia", "Indonesia"],
    ["98", "Irán", "Iran"],
    ["964", "Irak", "Iraq"],
    ["353", "Irlanda", "Ireland"],
    ["44", "Isla de Man", "Isle of Man"],
    ["972", "Israel", "Israel"],
    ["39", "Italia", "Italy"],
    ["1", "Jamaica", "Jamaica"],
    ["81", "Japón", "Japan"],
    ["44", "Jersey", "Jersey"],
    ["962", "Jordania", "Jordan"],
    ["7", "Kazajistán", "Kazakhstan"],
    ["254", "Kenia", "Kenya"],
    ["686", "Kiribati", "Kiribati"],
    ["383", "Kosovo", "Kosovo"],
    ["965", "Kuwait", "Kuwait"],
    ["996", "Kirguistán", "Kyrgyzstan"],
    ["856", "Laos", "Laos"],
    ["371", "Letonia", "Latvia"],
    ["961", "Líbano", "Lebanon"],
    ["266", "Lesoto", "Lesotho"],
    ["231", "Liberia", "Liberia"],
    ["218", "Libia", "Libya"],
    ["423", "Liechtenstein", "Liechtenstein"],
    ["370", "Lituania", "Lithuania"],
    ["352", "Luxemburgo", "Luxembourg"],
    ["853", "Macao", "Macau"],
    ["261", "Madagascar", "Madagascar"],
    ["265", "Malaui", "Malawi"],
    ["60", "Malasia", "Malaysia"],
    ["960", "Maldivas", "Maldives"],
    ["223", "Mali", "Mali"],
    ["356", "Malta", "Malta"],
    ["692", "Islas Marshall", "Marshall Islands"],
    ["596", "Martinica", "Martinique"],
    ["222", "Mauritania", "Mauritania"],
    ["230", "Mauricio", "Mauritius"],
    ["262", "Mayotte", "Mayotte"],
    ["52", "México", "Mexico"],
    ["373", "Moldavia", "Moldova"],
    ["377", "Mónaco", "Monaco"],
    ["976", "Mongolia", "Mongolia"],
    ["382", "Montenegro", "Montenegro"],
    ["1", "Montserrat", "Montserrat"],
    ["212", "Marruecos", "Morocco"],
    ["258", "Mozambique", "Mozambique"],
    ["95", "Myanmar", "Myanmar"],
    ["264", "Namibia", "Namibia"],
    ["674", "Nauru", "Nauru"],
    ["977", "Nepal", "Nepal"],
    ["31", "Países Bajos", "Netherlands"],
    ["687", "Nueva Caledonia", "New Caledonia"],
    ["64", "Nueva Zelanda", "New Zealand"],
    ["505", "Nicaragua", "Nicaragua"],
    ["227", "Níger", "Niger"],
    ["234", "Nigeria", "Nigeria"],
    ["683", "Niue", "Niue"],
    ["672", "Isla Norfolk", "Norfolk Island"],
    ["850", "Corea del Norte", "North Korea"],
    ["389", "Macedonia del Norte", "North Macedonia"],
    ["1", "Islas Marianas del Norte", "Northern Mariana Islands"],
    ["47", "Noruega", "Norway"],
    ["968", "Omán", "Oman"],
    ["92", "Pakistán", "Pakistan"],
    ["680", "Palaos", "Palau"],
    ["970", "Palestina", "Palestine"],
    ["507", "Panamá", "Panama"],
    ["675", "Papúa Nueva Guinea", "Papua New Guinea"],
    ["595", "Paraguay", "Paraguay"],
    ["51", "Perú", "Peru"],
    ["63", "Filipinas", "Philippines"],
    ["48", "Polonia", "Poland"],
    ["351", "Portugal", "Portugal"],
    ["1", "Puerto Rico", "Puerto Rico"],
    ["974", "Catar", "Qatar"],
    ["262", "Reunión", "Reunion"],
    ["242", "República del Congo", "Republic of the Congo"],
    ["40", "Rumania", "Romania"],
    ["7", "Rusia", "Russia"],
    ["250", "Ruanda", "Rwanda"],
    ["590", "San Bartolomé", "Saint Barthelemy"],
    ["290", "Santa Elena", "Saint Helena"],
    ["1", "San Cristóbal y Nieves", "Saint Kitts and Nevis"],
    ["590", "San Martín", "Saint Martin"],
    ["508", "San Pedro y Miquelón", "Saint Pierre and Miquelon"],
    ["1", "San Vicente y las Granadinas", "Saint Vincent and the Grenadines"],
    ["685", "Samoa", "Samoa"],
    ["378", "San Marino", "San Marino"],
    ["239", "Santo Tomé y Príncipe", "Sao Tome and Principe"],
    ["966", "Arabia Saudita", "Saudi Arabia"],
    ["221", "Senegal", "Senegal"],
    ["381", "Serbia", "Serbia"],
    ["248", "Seychelles", "Seychelles"],
    ["232", "Sierra Leona", "Sierra Leone"],
    ["65", "Singapur", "Singapore"],
    ["1", "Sint Maarten", "Sint Maarten"],
    ["421", "Eslovaquia", "Slovakia"],
    ["386", "Eslovenia", "Slovenia"],
    ["677", "Islas Salomón", "Solomon Islands"],
    ["252", "Somalia", "Somalia"],
    ["27", "Sudáfrica", "South Africa"],
    ["82", "Corea del Sur", "South Korea"],
    ["211", "Sudán del Sur", "South Sudan"],
    ["34", "España", "Spain"],
    ["94", "Sri Lanka", "Sri Lanka"],
    ["1", "Santa Lucía", "Saint Lucia"],
    ["249", "Sudán", "Sudan"],
    ["597", "Surinam", "Suriname"],
    ["46", "Suecia", "Sweden"],
    ["41", "Suiza", "Switzerland"],
    ["963", "Siria", "Syria"],
    ["886", "Taiwán", "Taiwan"],
    ["992", "Tayikistán", "Tajikistan"],
    ["255", "Tanzania", "Tanzania"],
    ["66", "Tailandia", "Thailand"],
    ["1", "Bahamas", "Bahamas"],
    ["220", "Gambia", "Gambia"],
    ["670", "Timor Oriental", "Timor-Leste"],
    ["228", "Togo", "Togo"],
    ["690", "Tokelau", "Tokelau"],
    ["676", "Tonga", "Tonga"],
    ["1", "Trinidad y Tobago", "Trinidad and Tobago"],
    ["216", "Túnez", "Tunisia"],
    ["90", "Turquía", "Turkey"],
    ["993", "Turkmenistán", "Turkmenistan"],
    ["1", "Islas Turcas y Caicos", "Turks and Caicos Islands"],
    ["688", "Tuvalu", "Tuvalu"],
    ["256", "Uganda", "Uganda"],
    ["380", "Ucrania", "Ukraine"],
    ["971", "Emiratos Árabes Unidos", "United Arab Emirates"],
    ["44", "Reino Unido", "United Kingdom"],
    ["1", "Estados Unidos", "United States"],
    ["598", "Uruguay", "Uruguay"],
    ["1", "Islas Vírgenes de los Estados Unidos", "U.S. Virgin Islands"],
    ["998", "Uzbekistán", "Uzbekistan"],
    ["678", "Vanuatu", "Vanuatu"],
    ["39", "Ciudad del Vaticano", "Vatican City"],
    ["58", "Venezuela", "Venezuela"],
    ["84", "Vietnam", "Vietnam"],
    ["681", "Wallis y Futuna", "Wallis and Futuna"],
    ["212", "Sahara Occidental", "Western Sahara"],
    ["967", "Yemen", "Yemen"],
    ["260", "Zambia", "Zambia"],
    ["263", "Zimbabue", "Zimbabwe"]
  ];

  // PAÍS PRINCIPAL de cada prefijo COMPARTIDO, cuando el resto del número no
  // permite saber de cuál se trata. Regla pedida: con +1 indistinguible,
  // Estados Unidos.
  var PRINCIPAL = {
    "1": "Estados Unidos", "7": "Rusia", "44": "Reino Unido", "39": "Italia",
    "212": "Marruecos", "262": "Reunión", "590": "Guadalupe", "599": "Curazao"
  };

  // SUBPREFIJOS que SÍ distinguen el país dentro de un prefijo compartido.
  // +1 (Plan de Numeración de Norteamérica): el código de área de 3 cifras dice
  // si es Puerto Rico, República Dominicana, Canadá... Lo que no esté aquí se
  // queda en Estados Unidos (PRINCIPAL), que es lo que se pidió. Para WhatsApp el
  // número enviado es el mismo ("+1" + 10 cifras) elija el país que elija dentro
  // del +1: esto solo sirve para que el selector muestre el país correcto.
  var SUBPREFIJOS = {
    "1": {
      "684": "Samoa Americana", "264": "Anguila", "268": "Antigua", "242": "Bahamas",
      "246": "Barbados", "441": "Bermudas", "284": "Islas Vírgenes Británicas",
      "345": "Islas Caimán", "767": "Dominica", "809": "República Dominicana",
      "829": "República Dominicana", "849": "República Dominicana", "473": "Granada",
      "671": "Guam", "876": "Jamaica", "658": "Jamaica", "664": "Montserrat",
      "670": "Islas Marianas del Norte", "787": "Puerto Rico", "939": "Puerto Rico",
      "869": "San Cristóbal y Nieves", "758": "Santa Lucía", "784": "San Vicente y las Granadinas",
      "721": "Sint Maarten", "868": "Trinidad y Tobago", "649": "Islas Turcas y Caicos",
      "340": "Islas Vírgenes de los Estados Unidos",
      // Canadá
      "204": "Canadá", "226": "Canadá", "236": "Canadá", "249": "Canadá", "250": "Canadá",
      "257": "Canadá", "263": "Canadá", "289": "Canadá", "306": "Canadá", "343": "Canadá",
      "354": "Canadá", "365": "Canadá", "367": "Canadá", "368": "Canadá", "382": "Canadá",
      "387": "Canadá", "403": "Canadá", "416": "Canadá", "418": "Canadá", "428": "Canadá",
      "431": "Canadá", "437": "Canadá", "438": "Canadá", "450": "Canadá", "460": "Canadá",
      "468": "Canadá", "474": "Canadá", "506": "Canadá", "514": "Canadá", "519": "Canadá",
      "548": "Canadá", "579": "Canadá", "581": "Canadá", "584": "Canadá", "587": "Canadá",
      "604": "Canadá", "613": "Canadá", "639": "Canadá", "647": "Canadá", "672": "Canadá",
      "683": "Canadá", "705": "Canadá", "709": "Canadá", "742": "Canadá", "753": "Canadá",
      "778": "Canadá", "780": "Canadá", "782": "Canadá", "807": "Canadá", "819": "Canadá",
      "825": "Canadá", "867": "Canadá", "873": "Canadá", "879": "Canadá", "902": "Canadá",
      "905": "Canadá", "942": "Canadá"
    },
    "7": { "6": "Kazajistán", "7": "Kazajistán" },
    "44": { "1481": "Guernsey", "1534": "Jersey", "1624": "Isla de Man" },
    "39": { "06698": "Ciudad del Vaticano" },
    "262": { "269": "Mayotte", "639": "Mayotte" },
    "599": { "3": "Bonaire, San Eustaquio y Saba", "4": "Bonaire, San Eustaquio y Saba", "7": "Bonaire, San Eustaquio y Saba" }
  };

  var POR_CODIGO = {}, POR_NOMBRE = {};
  PAISES.forEach(function (f) {
    (POR_CODIGO[f[0]] = POR_CODIGO[f[0]] || []).push(f);
    POR_NOMBRE[f[1]] = f;
  });

  // Separa una tira de DÍGITOS internacionales (sin "+" ni "00") en prefijo +
  // número. Coincidencia por el PREFIJO MÁS LARGO (3 -> 2 -> 1 cifras): los
  // prefijos E.164 no son prefijo unos de otros, así que el más largo que exista
  // es el bueno (+502 Guatemala y no +50...; +593 Ecuador y no +59...).
  function separar(digitos) {
    digitos = String(digitos || "").replace(/\D/g, "");
    if (digitos.length < 8 || digitos.length > 15) return null;
    for (var k = 3; k >= 1; k--) {
      var codigo = digitos.slice(0, k), filas = POR_CODIGO[codigo];
      if (!filas) continue;
      var numero = digitos.slice(k);
      if (numero.length < 4) return null;
      var nombre = null, subs = SUBPREFIJOS[codigo];
      if (subs) {
        var mejor = "";
        for (var sp in subs) {
          if (numero.indexOf(sp) === 0 && sp.length > mejor.length) mejor = sp;
        }
        if (mejor) nombre = subs[mejor];
      }
      if (!nombre) nombre = filas.length === 1 ? filas[0][1] : (PRINCIPAL[codigo] || filas[0][1]);
      var fila = POR_NOMBRE[nombre] || filas[0];
      return { codigo: codigo, pais: fila[1], pais_en: fila[2], numero: numero };
    }
    return null;
  }

  // De UNA URL o texto, los dígitos internacionales del número de WhatsApp.
  //  - https://wa.me/51987654321 (con o sin "+", con o sin ?text=...)
  //  - https://api.whatsapp.com/send?phone=51987654321, whatsapp.com/send/?phone=,
  //    web.whatsapp.com/send?phone=, whatsapp://send?phone=
  //  - tel:+51987654321
  //  - el número suelto: "+51 987 654 321", "(+502) 1234-5678", "0051 987-654-321".
  //    Suelto y SIN "+" ni "00" solo se acepta con 11 cifras o más: un número local
  //    ("987654321") no dice de qué país es, y adivinarlo pondría otro país
  //    (987... se leería como +98 Irán). Mejor no rellenar que rellenar mal.
  // Los enlaces de WhatsApp SIN número (wa.me/message/XXXX, los de grupos o
  // canales) no devuelven nada: ese caso lo escribe el usuario a mano.
  function digitosDe(texto) {
    var t = String(texto || "").trim();
    if (!t) return "";
    var u = null;
    try {
      if (/^(https?|whatsapp|tel):/i.test(t)) u = new URL(t);
      else if (/^(www\.)?(wa\.me|(api\.|web\.)?whatsapp\.com)\//i.test(t)) u = new URL("https://" + t);
    } catch (e) { u = null; }
    var limpio = function (s) {
      var d = String(s || "").trim().replace(/^\+/, "").replace(/[\s().\-\/]/g, "");
      if (!/^\d+$/.test(d)) return "";
      return d.replace(/^00/, "");
    };
    if (u) {
      var proto = u.protocol.toLowerCase(), host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (proto === "tel:") return limpio(decodeURIComponent(u.pathname || ""));
      if (host === "wa.me") {
        var seg = "";
        try { seg = decodeURIComponent((u.pathname || "").split("/")[1] || ""); } catch (e) { seg = ""; }
        return limpio(seg) || limpio(u.searchParams.get("phone"));
      }
      if (proto === "whatsapp:" || host === "whatsapp.com" || /\.whatsapp\.com$/.test(host)) {
        return limpio(u.searchParams.get("phone"));
      }
      return "";   // otra web: sus números (ids de publicaciones...) no son teléfonos
    }
    if (!/^[+\d\s().\-\/]+$/.test(t)) return "";
    var d = t.replace(/\D/g, "");
    if (/^\(?\s*\+/.test(t)) return d;
    if (/^00/.test(d)) return d.slice(2);
    return d.length >= 11 ? d : "";
  }

  function telefonoDeTexto(texto) { return separar(digitosDe(texto)); }

  function telefonoDeUrls(urls) {
    var lista = Array.isArray(urls) ? urls : [urls];
    for (var i = 0; i < lista.length; i++) {
      var r = telefonoDeTexto(lista[i]);
      if (r) return r;
    }
    return null;
  }

  window.PREFIJOS_TELEFONICOS = { paises: PAISES, separar: separar, digitosDe: digitosDe };
  window.TELEFONO_DE_TEXTO = telefonoDeTexto;
  window.TELEFONO_DE_URLS = telefonoDeUrls;
})();
