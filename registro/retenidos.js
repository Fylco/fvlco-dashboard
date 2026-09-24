'use strict';

/* ═══════════════════════════════════════════════════════════════════
   retenidos.js — Producto RETENIDO por Calidad (FVLco)
   ───────────────────────────────────────────────────────────────────
   Lógica pura, sin DOM y sin red. La cargan tres consumidores:

     · la PWA  /registro/  →  <script src="retenidos.js">   (valida el form)
     · el tablero          →  <script src="registro/retenidos.js">
                                                (convierte a filas NC)
     · retenidos.test.js   →  require()        (las pruebas)

   Vive en registro/ y NO en la raíz de fvlco-app a propósito: el service
   worker de la PWA tiene alcance /registro/, y un archivo de la raíz
   quedaría fuera de ese alcance — no se serviría desde caché y la app se
   rompería sin internet.

   ── QUÉ ES UN RETENIDO ──
   Calidad revisa DESPUÉS de producido, a veces días después, y cuenta
   UNIDADES. El no conforme del operario es otra cosa: tiempo real, en la
   máquina, por peso. Por eso son dos hojas y no una.

   ── LA REGLA QUE NO SE PUEDE ROMPER ──
   La fecha que pesa es la de PRODUCCIÓN, nunca la de revisión. Un retenido
   reportado el jueves por producto del lunes baja el indicador DEL LUNES.
   Si se colara la fecha de revisión, el indicador bajaría el día equivocado
   y nadie lo notaría, porque ambos números se ven igual de plausibles.
═══════════════════════════════════════════════════════════════════ */

/* Días desde la producción a partir de los cuales la app AVISA (no bloquea).
   Calidad puede demorarse: producción de fin de semana se reporta el lunes,
   y a veces pasa una semana. Bloquear sería peor que avisar. */
var RET_DIAS_AVISO_ = 30;

/* Nombres de mes en español, minúscula, sin acentos (ninguno de los doce
   lleva). Hacen falta porque retenidoAFilaNC tiene que fijar la columna
   MES de la fila sintética: tres sitios del tablero (el filtro del panel
   No Conformes, el acumulado de NC por máquina del Resumen Diario y el
   gráfico "NC por mes") leen r['MES'] CRUDO del sheet, no el campo
   derivado _mes. Sin esta columna, en cuanto el tablero se filtra a un
   mes concreto esas tres vistas dejan de contar el retenido —en
   silencio, porque la vista sin filtrar sigue cuadrando igual. */
var RET_MESES_ES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function retTexto(v) { return String(v == null ? '' : v).trim(); }

/* Mayúsculas, sin tildes, espacios colapsados y sin bordes — MISMO criterio
   que _calNorm_ (Calidad.gs), copiado a propósito en vez de compartido: ese
   archivo lo pega el usuario a mano en Apps Script y no hay forma de que
   ambos importen lo mismo.

   _calVerificarEncabezados_ compara los encabezados de la hoja con esta
   misma tolerancia, así que una hoja con "FECHA PRODUCCIÓN" (con tilde) o
   "FECHA PRODUCCION " (espacio final) PASA esa verificación y el backend
   escribe sin quejarse. Si retenidoAFilaNC no aplicara la misma tolerancia
   al leer, esas filas devolverían null en silencio: el retenido queda
   guardado en la hoja pero nunca resta del indicador.

   Sin String.prototype.normalize (no está en el ES5 que exige este archivo
   para navegadores viejos de planta): se reemplazan a mano las vocales
   acentuadas que de verdad aparecen en encabezados en español. */
function _retNormClave_(s) {
  s = String(s == null ? '' : s).toUpperCase();
  s = s.replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
       .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U');
  s = s.replace(/\s+/g, ' ');
  return s.replace(/^\s+|\s+$/g, '');   // trim ES5-safe (sin String.prototype.trim de más)
}

/* Copia la fila con las llaves normalizadas (_retNormClave_), para que
   retenidoAFilaNC pueda leer con llave literal 'FECHA PRODUCCION' aunque la
   hoja real diga 'Fecha Producción ' o 'fecha produccion'. Las llaves que
   usa retenidoAFilaNC ya están en su propia forma normalizada, así que basta
   con normalizar las de la fila de entrada. */
function _retNormalizarFila_(fila) {
  var out = {};
  for (var k in fila) {
    if (Object.prototype.hasOwnProperty.call(fila, k)) {
      out[_retNormClave_(k)] = fila[k];
    }
  }
  return out;
}

function _ret2_(n) { return (n < 10 ? '0' : '') + n; }

/* Entero desde texto del sheet o del formulario.

   Acepta el punto de miles del locale ES ("13.600"), porque así es como el
   sheet exporta los números. NO acepta decimales: "1,5" piezas no existe, y
   convertirlo en silencio a 15 metía un error de 10x en el indicador que
   nadie iba a poder rastrear. Un decimal se rechaza y el formulario lo dice. */
function retEntero(v) {
  if (typeof v === 'number') return (isFinite(v) && v === Math.floor(v)) ? v : NaN;
  var s = retTexto(v);
  if (!s) return NaN;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 1.234.567
  if (!/^\d+$/.test(s)) return NaN;
  return parseInt(s, 10);
}

function _retArma_(y, m, d) {
  if (!(m >= 1 && m <= 12)) return '';
  if (!(d >= 1 && d <= 31)) return '';
  if (!(y >= 2000 && y <= 2100)) return '';
  return y + '-' + _ret2_(m) + '-' + _ret2_(d);
}

/* Fecha a 'YYYY-MM-DD' (clave ordenable). Acepta las tres formas en que
   llega: objeto Date (Apps Script), 'YYYY-MM-DD' (<input type="date">) y
   'D/M/YYYY' o 'D-M-YYYY' (como exporta el sheet en locale ES). */
function retFechaISO(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + _ret2_(v.getMonth() + 1) + '-' + _ret2_(v.getDate());
  }
  var s = retTexto(v);
  if (!s) return '';
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return _retArma_(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    var y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    return _retArma_(y, parseInt(dmy[2], 10), parseInt(dmy[1], 10));
  }
  return '';
}

/* 'YYYY-MM-DD' → 'D/M/YYYY'. Es el formato que normalizeProd y
   resolveFechaTurnoRaw del tablero ya saben leer del sheet; devolver la fila
   sintética en ese formato evita tocar el parser. */
function retFechaDMY(iso) {
  var m = String(iso == null ? '' : iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (parseInt(m[3], 10) + '/' + parseInt(m[2], 10) + '/' + m[1]) : '';
}

/* Valida un retenido. Devuelve [] si está bien, o la lista de problemas en
   español listos para mostrar. Lo usan el formulario Y el backend: el
   formulario para no hacer viajar basura, el backend porque es el que manda. */
function validarRetenido(d, hoyISO) {
  d = d || {};
  var e = [];

  if (!retTexto(d.orden))    e.push('Falta la orden.');
  if (!retTexto(d.maquina))  e.push('Falta la máquina.');
  if (!retTexto(d.operario)) e.push('Falta el operario.');
  if (!retTexto(d.motivo))   e.push('Falta el motivo de rechazo.');

  var t = retEntero(d.turno);
  if (!(t >= 1 && t <= 5)) e.push('El turno debe ser 1, 2, 3, 4 o 5.');

  var c = retEntero(d.cantidad);
  if (!(c > 0)) e.push('La cantidad retenida debe ser un número entero mayor que cero.');

  var fp = retFechaISO(d.fechaProd), fr = retFechaISO(d.fechaRev);
  if (!fp) e.push('La fecha de producción no es válida.');
  if (!fr) e.push('La fecha de revisión no es válida.');

  var hoy = retFechaISO(hoyISO) || retFechaISO(new Date());
  if (fp && hoy && fp > hoy) e.push('La fecha de producción no puede ser futura.');
  if (fr && hoy && fr > hoy) e.push('La fecha de revisión no puede ser futura.');
  if (fp && fr && fp > fr) e.push('La fecha de producción no puede ser posterior a la de revisión.');

  return e;
}

/* ¿La producción es de hace mucho? Solo para AVISAR en pantalla. No bloquea:
   un retenido viejo sigue siendo información buena, y el indicador del día
   viejo se corrige igual. */
function retenidoAntiguo(fechaProd, hoyISO) {
  var fp = retFechaISO(fechaProd);
  var hoy = retFechaISO(hoyISO) || retFechaISO(new Date());
  if (!fp || !hoy) return false;
  var ms = Date.parse(hoy + 'T00:00:00Z') - Date.parse(fp + 'T00:00:00Z');
  return (ms / 86400000) > RET_DIAS_AVISO_;
}

/* Una fila de CALIDAD RETENIDOS → una fila con forma de NO CONFORMES.

   Así el tablero no necesita una segunda fórmula de Calidad: el retenido
   entra por el mismo tubo que el NC y los OCHO sitios que leen DATA.nc
   (global, diario, compacto, OEE por máquina, PPM, Pareto, PDF y resumen
   por mes) se mueven solos. Duplicar la fórmula en ocho sitios es el error
   más caro que se puede cometer en ese archivo.

   Las DOS columnas de fecha se llenan con la fecha de producción a
   propósito: resolveFechaTurnoRaw usa DIA/MES/AÑO o la columna que diga
   FECHA+TURNO para los turnos 3/5 (que cruzan medianoche) y otra ruta para
   1/2/4. Poniendo las dos iguales, el día sale igual por cualquier ruta y
   no hay que replicar aquí la regla de turnos.

   Devuelve null —no una fila en cero— cuando la fila no sirve: un cero en
   el Pareto de causas es ruido que después nadie sabe de dónde salió. */
function retenidoAFilaNC(fila) {
  fila = _retNormalizarFila_(fila || {});
  var cant = retEntero(fila['CANTIDAD RETENIDA']);
  if (!(cant > 0)) return null;
  var iso = retFechaISO(fila['FECHA PRODUCCION']);
  if (!iso) return null;
  var dmy = retFechaDMY(iso);
  var mesNum = parseInt(iso.substring(5, 7), 10);

  return {
    'FECHA Y HORA': dmy,
    'FECHAS SEGUN TURNO DE TRABAJO': dmy,
    'MES': RET_MESES_ES_[mesNum - 1],
    'ORDEN': retTexto(fila['ORDEN']),
    'MÁQUINA': retTexto(fila['MAQUINA']),
    'TURNO': retTexto(fila['TURNO']),
    'OPERARIO1': retTexto(fila['OPERARIO']),
    'PRODUCTO': retTexto(fila['PRODUCTO']),
    'COLOR': retTexto(fila['COLOR']),
    'CANTIDAD NC': cant,
    'CAUSA': retTexto(fila['MOTIVO RECHAZO'])
  };
}

function retenidosAFilasNC(filas) {
  var out = [];
  (filas || []).forEach(function (f) {
    var r = retenidoAFilaNC(f);
    if (r) out.push(r);
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   SALDO RETENIDO POR ORDEN
   ───────────────────────────────────────────────────────────────────
   Lo que el operario ve al buscar una orden en REPROCESOS: cuánto retuvo
   calidad de esa orden y todavía no ha pasado por revisión.

       saldo = Σ CANTIDAD RETENIDA con motivo "Seleccionar"
             − Σ UNIDADES REVISADAS de esa orden en REPROCESOS

   Se descuenta por REVISADAS y no por las que salieron malas: lo que
   consume la retención es haber pasado el producto por la revisión, no
   cuánto resultó defectuoso.

   Solo el motivo "Seleccionar" genera saldo. "producto Rechazado" se va al
   molino y no se escoge; "Derogación por variación" se liberó.

   Devuelve solo saldos POSITIVOS: si se revisó de más, la orden no aparece
   y el operario no ve un número negativo que no sabría interpretar.
═══════════════════════════════════════════════════════════════════ */

/* La orden se digita a mano en la pestaña de calidad, en reprocesos y en el
   sheet. Sin normalizar, "1317" y " 1317" son dos órdenes distintas y el
   saldo no bajaría nunca. */
function retClaveOrden(v) {
  return retTexto(v).toUpperCase();
}

/* El motivo también se compara normalizado: en el catálogo está escrito
   "Seleccionar", pero la celda puede llegar con espacios o en minúscula. */
function _retEsSeleccionar_(v) {
  return _retNormClave_(v) === 'SELECCIONAR';
}

function saldosRetenidos(filasRetenidos, filasReprocesos) {
  var retenido = {}, revisado = {};

  (filasRetenidos || []).forEach(function (cruda) {
    var f = _retNormalizarFila_(cruda || {});
    if (!_retEsSeleccionar_(f['MOTIVO RECHAZO'])) return;
    var orden = retClaveOrden(f['ORDEN']);
    var cant = retEntero(f['CANTIDAD RETENIDA']);
    if (!orden || !(cant > 0)) return;
    retenido[orden] = (retenido[orden] || 0) + cant;
  });

  (filasReprocesos || []).forEach(function (cruda) {
    var f = _retNormalizarFila_(cruda || {});
    var orden = retClaveOrden(f['ORDEN']);
    var cant = retEntero(f['UNIDADES REVISADAS']);
    if (!orden || !(cant > 0)) return;
    revisado[orden] = (revisado[orden] || 0) + cant;
  });

  var out = {};
  for (var orden in retenido) {
    if (!retenido.hasOwnProperty(orden)) continue;
    var saldo = retenido[orden] - (revisado[orden] || 0);
    if (saldo > 0) out[orden] = saldo;
  }
  return out;
}

/* Node para las pruebas; en el navegador estas funciones quedan globales. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    retTexto: retTexto,
    retEntero: retEntero,
    retFechaISO: retFechaISO,
    retFechaDMY: retFechaDMY,
    validarRetenido: validarRetenido,
    retenidoAntiguo: retenidoAntiguo,
    retenidoAFilaNC: retenidoAFilaNC,
    retenidosAFilasNC: retenidosAFilasNC,
    retClaveOrden: retClaveOrden,
    saldosRetenidos: saldosRetenidos,
    _retNormClave_: _retNormClave_
  };
}
