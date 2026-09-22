const assert = require('node:assert');
const {
  retEntero, retFechaISO, retFechaDMY,
  validarRetenido, retenidoAntiguo, retenidoAFilaNC, retenidosAFilasNC
} = require('./retenidos.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

const BASE = {
  orden: '1317', maquina: '6', turno: '3', operario: '7 · JUAN CAMILO USMA',
  cantidad: '4000', fechaProd: '2026-09-20', fechaRev: '2026-09-22',
  motivo: 'producto Rechazado'
};
const HOY = '2026-09-22';

// ── retEntero ──────────────────────────────────────────────────────
t('entero simple', () => assert.strictEqual(retEntero('4095'), 4095));
t('numero nativo', () => assert.strictEqual(retEntero(4095), 4095));
t('punto de miles del locale ES', () => assert.strictEqual(retEntero('13.600'), 13600));
t('dos grupos de miles', () => assert.strictEqual(retEntero('1.234.567'), 1234567));

// Un decimal NO se convierte en silencio: "1,5" piezas no existe, y
// aceptarlo como 15 metia un error de 10x en el indicador.
t('decimal con coma es invalido', () => assert.ok(Number.isNaN(retEntero('1,5'))));
t('decimal con punto es invalido', () => assert.ok(Number.isNaN(retEntero('12.34'))));
t('negativo es invalido', () => assert.ok(Number.isNaN(retEntero('-5'))));
t('texto es invalido', () => assert.ok(Number.isNaN(retEntero('cuatro mil'))));
t('vacio es invalido', () => assert.ok(Number.isNaN(retEntero(''))));

// ── retFechaISO / retFechaDMY ──────────────────────────────────────
t('ISO del input type=date', () => assert.strictEqual(retFechaISO('2026-09-20'), '2026-09-20'));
t('DD/MM/YYYY del sheet', () => assert.strictEqual(retFechaISO('5/9/2026'), '2026-09-05'));
t('DD-MM-YYYY', () => assert.strictEqual(retFechaISO('20-9-2026'), '2026-09-20'));
t('objeto Date', () => assert.strictEqual(retFechaISO(new Date(2026, 8, 20)), '2026-09-20'));
t('mes 13 es invalido', () => assert.strictEqual(retFechaISO('20/13/2026'), ''));
t('basura es invalida', () => assert.strictEqual(retFechaISO('ayer'), ''));
t('vacio es invalido', () => assert.strictEqual(retFechaISO(''), ''));
t('ISO a DMY sin ceros a la izquierda', () => assert.strictEqual(retFechaDMY('2026-09-05'), '5/9/2026'));

// ── validarRetenido ────────────────────────────────────────────────
t('fila completa no tiene errores', () => {
  assert.deepStrictEqual(validarRetenido(BASE, HOY), []);
});

const falta = (campo, valor, textoEsperado) => {
  const d = Object.assign({}, BASE); d[campo] = valor;
  const e = validarRetenido(d, HOY);
  assert.ok(e.some(x => x.includes(textoEsperado)), campo + ' → ' + JSON.stringify(e));
};
t('sin orden', () => falta('orden', '', 'orden'));
t('sin maquina', () => falta('maquina', '  ', 'máquina'));
t('sin operario', () => falta('operario', '', 'operario'));
t('sin motivo', () => falta('motivo', '', 'motivo'));
t('turno 0', () => falta('turno', '0', 'turno'));
t('turno 6', () => falta('turno', '6', 'turno'));
t('cantidad cero', () => falta('cantidad', '0', 'cantidad'));
t('cantidad negativa', () => falta('cantidad', '-10', 'cantidad'));
t('cantidad decimal', () => falta('cantidad', '1,5', 'cantidad'));
t('cantidad vacia', () => falta('cantidad', '', 'cantidad'));
t('fecha de produccion invalida', () => falta('fechaProd', 'ayer', 'producción no es válida'));
t('fecha de revision invalida', () => falta('fechaRev', '', 'revisión no es válida'));

t('fecha de produccion futura', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-30', fechaRev: '2026-09-30' });
  assert.ok(validarRetenido(d, HOY).some(x => x.includes('producción no puede ser futura')));
});
t('produccion posterior a revision', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-22', fechaRev: '2026-09-20' });
  assert.ok(validarRetenido(d, HOY).some(x => x.includes('posterior a la de revisión')));
});
// Producción de un fin de semana reportada el lunes: es el caso normal, no un error.
t('produccion de hace tres dias es valida', () => {
  const d = Object.assign({}, BASE, { fechaProd: '2026-09-19' });
  assert.deepStrictEqual(validarRetenido(d, HOY), []);
});
// Decisión del usuario: los TRES motivos restan igual. Ninguno se filtra.
t('los tres motivos pasan igual', () => {
  ['Seleccionar', 'producto Rechazado', 'Derogacion por varíacion'].forEach(m => {
    assert.deepStrictEqual(validarRetenido(Object.assign({}, BASE, { motivo: m }), HOY), []);
  });
});

// ── retenidoAntiguo ────────────────────────────────────────────────
t('de ayer no es antiguo', () => assert.strictEqual(retenidoAntiguo('2026-09-21', HOY), false));
t('de hace 40 dias es antiguo', () => assert.strictEqual(retenidoAntiguo('2026-08-13', HOY), true));
t('fecha invalida no es antiguo', () => assert.strictEqual(retenidoAntiguo('', HOY), false));

// ── retenidoAFilaNC ────────────────────────────────────────────────
const FILA = {
  'FECHA PRODUCCION': '2026-09-20', 'FECHA REVISION': '2026-09-22',
  'ORDEN': '1317', 'MAQUINA': '6', 'TURNO': '3', 'OPERARIO': '7 · JUAN CAMILO USMA',
  'PRODUCTO': 'CONJUNTO TERRA 15MM', 'COLOR': 'BLANCO',
  'CANTIDAD RETENIDA': '4000', 'MOTIVO RECHAZO': 'producto Rechazado',
  'OBSERVACION': 'lote de la noche', 'REGISTRADO': '22/9/2026 8:15:00'
};

t('la cantidad retenida llega como CANTIDAD NC', () => {
  assert.strictEqual(retenidoAFilaNC(FILA)['CANTIDAD NC'], 4000);
});
t('el motivo llega como CAUSA', () => {
  assert.strictEqual(retenidoAFilaNC(FILA)['CAUSA'], 'producto Rechazado');
});
// La fecha que pesa es la de PRODUCCION. Si aqui se colara la de revision,
// el indicador bajaria el dia equivocado y nadie lo notaria.
t('las dos fechas de la fila NC son la de PRODUCCION', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['FECHA Y HORA'], '20/9/2026');
  assert.strictEqual(f['FECHAS SEGUN TURNO DE TRABAJO'], '20/9/2026');
});
t('maquina, turno, orden y producto se conservan', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['MÁQUINA'], '6');
  assert.strictEqual(f['TURNO'], '3');
  assert.strictEqual(f['ORDEN'], '1317');
  assert.strictEqual(f['PRODUCTO'], 'CONJUNTO TERRA 15MM');
  assert.strictEqual(f['COLOR'], 'BLANCO');
  assert.strictEqual(f['OPERARIO1'], '7 · JUAN CAMILO USMA');
});
// Una fila a medio llenar no debe ensuciar el Pareto con un cero.
t('cantidad cero no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC(Object.assign({}, FILA, { 'CANTIDAD RETENIDA': '0' })), null);
});
t('sin fecha de produccion no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC(Object.assign({}, FILA, { 'FECHA PRODUCCION': '' })), null);
});
t('fila vacia no produce fila', () => {
  assert.strictEqual(retenidoAFilaNC({}), null);
});
t('retenidosAFilasNC descarta las nulas', () => {
  const out = retenidosAFilasNC([FILA, {}, Object.assign({}, FILA, { 'CANTIDAD RETENIDA': '' })]);
  assert.strictEqual(out.length, 1);
});
t('lista vacia o undefined devuelve lista vacia', () => {
  assert.deepStrictEqual(retenidosAFilasNC([]), []);
  assert.deepStrictEqual(retenidosAFilasNC(undefined), []);
});

// El tablero lee r['MES'] CRUDO en tres sitios (filtro de No Conformes,
// acumulado por maquina del Resumen Diario, grafico "NC por mes"), no el
// campo derivado _mes. Sin esta columna el retenido desaparece de esas
// vistas en cuanto se filtra el tablero a un mes concreto.
t('la fila de septiembre trae MES en septiembre', () => {
  const f = retenidoAFilaNC(FILA); // FECHA PRODUCCION: 2026-09-20
  assert.strictEqual(f['MES'], 'septiembre');
});
// El mes sale de la fecha de PRODUCCION, no de la de revision: aqui
// producen el 30/8 y revisan el 2/9, y debe pesar agosto.
t('el mes sale de la fecha de produccion, no de la de revision', () => {
  const f = retenidoAFilaNC(Object.assign({}, FILA, {
    'FECHA PRODUCCION': '2026-08-30', 'FECHA REVISION': '2026-09-02'
  }));
  assert.strictEqual(f['MES'], 'agosto');
});
// mesMatch y el grafico de NC por mes comparan en minuscula.
t('el mes va en minuscula', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(f['MES'], f['MES'].toLowerCase());
});

// ── La fila sintetica tiene que servirle a resolveFechaTurnoRaw ────
// Es lo unico que garantiza que el retenido caiga en el DIA correcto, y hay
// dos caminos distintos: turnos 1/2/4 y turnos 3/5 (que cruzan medianoche).
const { resolveFechaTurnoRaw } = require('../turnos.js');
t('turno 4 (no cruza medianoche) resuelve al dia de produccion', () => {
  const f = retenidoAFilaNC(Object.assign({}, FILA, { 'TURNO': '4' }));
  assert.strictEqual(resolveFechaTurnoRaw(f), '20/9/2026');
});
t('turno 3 (cruza medianoche) resuelve al dia de produccion', () => {
  const f = retenidoAFilaNC(FILA);
  assert.strictEqual(resolveFechaTurnoRaw(f), '20/9/2026');
});

console.log('\n' + passed + ' pruebas OK');
