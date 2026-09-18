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

/* Las 4 columnas editables, en el orden de la hoja. El label es el que
   ve el supervisor en la confirmación, así que nombra la columna.

   La MÁQUINA (P) entró el 2026-09-18: los moldes se cambian de máquina, y
   el desplegable de órdenes del operario filtra por col. P
   (`oMaq === maqTrim` en app.js). Sin poder corregirla, al mover un molde
   la orden desaparece de la máquina nueva y no hay forma de reportar.

   La CANT. POR CAJA (Q) sigue fuera a propósito: cambiarla altera hacia
   atrás la aritmética de cajas ya reportadas. La máquina no — el acumulado
   de cada orden se arma con `orden + loteProd`, sin la máquina. */
var SUP_LOTES_CAMPOS = [
  { campo: 'mp',       label: 'Materia prima (col. M)' },
  { campo: 'loteMp',   label: 'Lote MP (col. N)' },
  { campo: 'loteProd', label: 'Lote producción (col. O)' },
  { campo: 'maquina',  label: 'Máquina (col. P)' }
];

/* Campos obligatorios, en el orden en que se revisan. Los dos lo son al
   programar, así que un blanco solo puede ser un borrado accidental. */
var SUP_LOTES_OBLIG_ = [
  { campo: 'mp',      error: 'La materia prima no puede quedar vacía (columna M).' },
  { campo: 'maquina', error: 'La máquina no puede quedar vacía (columna P).' }
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
 *  Valida los campos obligatorios y devuelve SOLO los campos que
 *  cambiaron, para que la confirmación no muestre ruido.
 *  `campoError` dice cuál campo señalar en el formulario. */
function supDiffLotes(actual, nuevo) {
  var a = actual || {}, b = nuevo || {};

  for (var i = 0; i < SUP_LOTES_OBLIG_.length; i++) {
    if (!supLotesTxt(b[SUP_LOTES_OBLIG_[i].campo])) {
      return { error: SUP_LOTES_OBLIG_[i].error, campoError: SUP_LOTES_OBLIG_[i].campo,
               cambios: [], hayCambios: false };
    }
  }

  var cambios = [];
  SUP_LOTES_CAMPOS.forEach(function (c) {
    var antes   = supLotesTxt(a[c.campo]);
    var despues = supLotesTxt(b[c.campo]);
    if (antes !== despues) {
      cambios.push({ campo: c.campo, label: c.label, antes: antes, despues: despues });
    }
  });

  return { error: null, campoError: null, cambios: cambios, hayCambios: cambios.length > 0 };
}

/** Saca el cambio de máquina de una lista de cambios, o null si no lo hay.
 *  Se trata aparte porque no es un dato más: mover una orden de máquina la
 *  saca del desplegable de una y la mete en el de la otra. Esa consecuencia
 *  tiene que verse en la confirmación, no deducirse. */
function supCambioMaquina(cambios) {
  var out = null;
  (cambios || []).forEach(function (c) {
    if (c && c.campo === 'maquina') out = { antes: c.antes, despues: c.despues };
  });
  return out;
}

/* Node para las pruebas; en el navegador estas funciones quedan globales. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    supLotesFaltantes: supLotesFaltantes,
    supOrdenarProgramadas: supOrdenarProgramadas,
    supResumenLotes: supResumenLotes,
    supDiffLotes: supDiffLotes,
    supCambioMaquina: supCambioMaquina
  };
}
