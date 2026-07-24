// capacidad.js — Motor de capacidad de planta (FVLco), fuente única
// Cargado por index.html vía <script src="capacidad.js"> ANTES del <script>
// principal, y por capacidad.test.js vía require() en Node. Lógica pura: no
// toca DOM, Chart.js, localStorage ni las fuentes I/O (CAP_COSTOS/CAP_OPERARIOS).
// Ver docs/superpowers/specs/2026-07-24-motor-capacidad-unificado-design.md
//
// PROBLEMA: la pestaña "Capacidad" y la pestaña "Tablero Plan" respondían la
// misma pregunta ("¿alcanza la planta?") con dos motores distintos — Tablero
// Plan estimaba horas por pedido leyendo la hoja "restricciones" (frágil, y
// hoy caída en producción), mientras Capacidad ya calculaba turnos reales por
// máquina desde PROGRAMACIÓN. Este archivo es el único cálculo; ambas
// pestañas lo consumen.

// normaliza nombres de producto para cruzar tablas: mayúsculas, LYNNER→LINER,
// quita "MM" y puntuación, y ordena las palabras — así "VALVULA TERRA 15MM * 48"
// cruza con "valvula 15 mm terra *48" aunque el orden de palabras difiera.
function capNorm(s) {
  const clean = String(s || '').toUpperCase().replace(/LYNNER/g, 'LINER').replace(/MM/g, ' ');
  return (clean.match(/[A-Z0-9]+/g) || []).sort().join(' ');
}

// "1" → [INY#1] · "1-2" → [INY#1, INY#2] · "TV1-TV2" → [TV#1, TV#2] · "Maquila" → []
function capMaquinas(str) {
  const s = String(str || '').trim().toUpperCase();
  if (!s || s === 'MAQUILA') return [];
  const out = [];
  (s.match(/TV\s*#?\s*(\d+)/g) || []).forEach(m => out.push('TV#' + m.replace(/\D/g, '')));
  if (!out.length) (s.match(/\d+/g) || []).forEach(n => out.push('INY#' + n));
  return out;
}

// Turnos requeridos/disponibles por máquina a partir de bloques de PROGRAMACIÓN.
//   blocks:       PROG_BLOCKS ya filtrado (cavidades>0 && ciclo>0)
//   cavOv:        { [capNorm(producto)]: cavidadesOverride } — simulador de cavidades
//   turnosDiaOv:  { [maquina]: { [diaIdx]: turnosOverride } } — simulador de turnos/día
function calcCapacidadMotor(blocks, cavOv, turnosDiaOv) {
  cavOv = cavOv || {};
  turnosDiaOv = turnosDiaOv || {};

  const maqLoad = {};
  let turnosReqIny = 0, turnosReqTV = 0;
  const items = blocks.map(b => {
    const cavKey = capNorm(b.producto);
    const overridden = cavOv[cavKey] != null;
    const cavidades = overridden ? cavOv[cavKey] : b.cavidades;
    const und8h = b.ciclo > 0 ? Math.floor(cavidades * 28800 / b.ciclo * b.rendimiento) : 0;
    const turnos = und8h > 0 ? b.requerida / und8h : 0;
    const dias = turnos / 3;
    const maqLbl = /^\d+$/.test(String(b.maquina).trim()) ? 'INY#' + b.maquina : (b.maquina || '—');
    const maqs = capMaquinas(b.maquina);
    const esMaquila = !maqs.length;
    maqs.forEach(m => maqLoad[m] = (maqLoad[m] || 0) + turnos / maqs.length);
    if (!esMaquila) { if (maqs[0].startsWith('TV')) turnosReqTV += turnos; else turnosReqIny += turnos; }
    return { ...b, und8h, turnos, dias, maqLbl, maqs, esMaquila, cavidades, cavKey, overridden, cavReal: b.cavidades };
  });

  const maqNms = Object.keys(maqLoad).sort();

  // calendario de turnos reales del mes (festivos ya conciliados en PROGRAMACIÓN)
  const calBlock = blocks.find(b => b.turnosUsado && b.turnosUsado.length) || { turnosUsado: [] };
  const maqDias = {}, maqTurnosDisp = {};
  maqNms.forEach(m => {
    const ovM = turnosDiaOv[m] || {};
    maqDias[m] = calBlock.turnosUsado.map((v, d) => (ovM[d] != null ? ovM[d] : v));
    maqTurnosDisp[m] = maqDias[m].reduce((s, v) => s + v, 0);
  });

  // desborde por máquina → el producto de más turnos en esa máquina aporta el
  // desborde completo (no se reparte); costos se añaden por el llamador (I/O)
  const overflow = [];
  maqNms.forEach(m => {
    const exceso = maqLoad[m] - maqTurnosDisp[m];
    if (exceso <= 0.01) return;
    const prods = items.filter(i => i.maqs.includes(m)).sort((a, b) => b.turnos - a.turnos);
    if (!prods.length) return;
    const p = prods[0];
    const unidades = Math.round(exceso * p.und8h);
    overflow.push({ maquina: m, producto: p.producto, turnos: exceso, unidades, prodItem: p });
  });

  const turnosReqTotal = maqNms.reduce((s, m) => s + maqLoad[m], 0);
  const turnosDispTotal = maqNms.reduce((s, m) => s + maqTurnosDisp[m], 0);

  return {
    items, maqNms, maqLoad, maqTurnosDisp, maqDias, overflow, calBlock,
    turnosReqIny, turnosReqTV, turnosReqTotal, turnosDispTotal,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { capNorm, capMaquinas, calcCapacidadMotor };
}
