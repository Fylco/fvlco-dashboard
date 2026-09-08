/***********************************************************************
 * supLotes.js — lógica pura de la asignación de lotes del supervisor
 * ---------------------------------------------------------------------
 * Vive aparte de app.js para poder probarse con `node`, igual que
 * turnos.js / capacidad.js en la raíz de fvlco-app. Aquí NO hay DOM ni
 * fetch: solo decisiones sobre datos. app.js se encarga de pintar.
 *
 * ES5 a propósito: este archivo lo carga el navegador del PC de planta.
 ***********************************************************************/
'use strict';

/* Las 3 columnas editables, en el orden de la hoja. El label es el que
   ve el supervisor en la confirmación, así que nombra la columna. */
var SUP_LOTES_CAMPOS = [
  { campo: 'mp',       label: 'Materia prima (col. M)' },
  { campo: 'loteMp',   label: 'Lote MP (col. N)' },
  { campo: 'loteProd', label: 'Lote producción (col. O)' }
];

function supLotesTxt(v) {
  return String(v == null ? '' : v).trim();
}

/** Qué lotes le faltan a una orden ya programada.
 *  La MP no entra en la cuenta: es obligatoria al programar, así que un
 *  blanco ahí no es un pendiente de lote sino una anomalía aparte. */
function supLotesFaltantes(p) {
  var faltaMp   = !supLotesTxt(p && p.loteMp);
  var faltaProd = !supLotesTxt(p && p.loteProd);
  return { loteMp: faltaMp, loteProd: faltaProd, alguno: faltaMp || faltaProd };
}

/** Las órdenes sin lote primero, para que quien viene a asignarlos vea su
 *  pendiente sin leer la lista completa. Estable: dentro de cada grupo se
 *  conserva el orden de la hoja, así la posición no baila entre recargas.
 *  Devuelve un arreglo NUEVO; no muta el que recibe. */
function supOrdenarProgramadas(prog) {
  var sin = [], con = [];
  (prog || []).forEach(function (p) {
    if (supLotesFaltantes(p).alguno) sin.push(p); else con.push(p);
  });
  return sin.concat(con);
}

/** Texto del contador del encabezado de "ÓRDENES PROGRAMADAS". */
function supResumenLotes(prog) {
  var lista = prog || [];
  if (!lista.length) return '';
  var n = 0;
  lista.forEach(function (p) { if (supLotesFaltantes(p).alguno) n++; });
  var txt = lista.length + ' en producción';
  return n ? (n + ' sin lote · ' + txt) : txt;
}

/** Compara lo que dice la hoja contra lo que escribió el supervisor.
 *  Valida que la MP no quede vacía (al programar es obligatoria, así que
 *  un blanco solo puede ser un borrado accidental) y devuelve SOLO los
 *  campos que cambiaron, para que la confirmación no muestre ruido. */
function supDiffLotes(actual, nuevo) {
  var a = actual || {}, b = nuevo || {};

  if (!supLotesTxt(b.mp)) {
    return { error: 'La materia prima no puede quedar vacía (columna M).',
             cambios: [], hayCambios: false };
  }

  var cambios = [];
  SUP_LOTES_CAMPOS.forEach(function (c) {
    var antes   = supLotesTxt(a[c.campo]);
    var despues = supLotesTxt(b[c.campo]);
    if (antes !== despues) {
      cambios.push({ campo: c.campo, label: c.label, antes: antes, despues: despues });
    }
  });

  return { error: null, cambios: cambios, hayCambios: cambios.length > 0 };
}

/* Node para las pruebas; en el navegador estas funciones quedan globales. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    supLotesFaltantes: supLotesFaltantes,
    supOrdenarProgramadas: supOrdenarProgramadas,
    supResumenLotes: supResumenLotes,
    supDiffLotes: supDiffLotes
  };
}
