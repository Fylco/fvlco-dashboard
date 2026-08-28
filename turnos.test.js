const assert = require('node:assert');
const { canonicalizeTurnos, windowForRow, calcShiftHours, turnoSeconds, unidadesTeoricas, resolveFechaTurnoRaw, esParoProgramado, fechaColDiaKey } = require('./turnos.js');
const S = (...t) => new Set(t.map(String));

const ts = (h, m = 0) => new Date(2026, 5, 10, h, m, 0).getTime(); // hora local del 2026-06-10
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// 1. T1 + T4 mismo día/máquina → ambas quedan '4' (diurno 12h)
t('T1+T4 → ambas 4', () => {
  const rows = [
    { _turno: '1', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(7) },
    { _turno: '4', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(9) },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[0]._turno, '4');
  assert.strictEqual(rows[1]._turno, '4');
  assert.strictEqual(rows[0]._turnoRaw, '1'); // preserva original
});

// 2. T2 por la tarde (<6pm) con T4 presente → '4'
t('T2 tarde + T4 → 4', () => {
  const rows = [
    { _turno: '4', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(7) },
    { _turno: '2', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(15) },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[1]._turno, '4');
});

// 3. T3 + T5 → ambas '5' (nocturno 12h)
t('T3+T5 → ambas 5', () => {
  const rows = [
    { _turno: '3', _maq: '5', _fechaKey: '2026-06-10', _ts: ts(23) },
    { _turno: '5', _maq: '5', _fechaKey: '2026-06-10', _ts: ts(19) },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[0]._turno, '5');
  assert.strictEqual(rows[1]._turno, '5');
});

// 4. T2 de noche (>=6pm) con T5 → '5'
t('T2 noche + T5 → 5', () => {
  const rows = [
    { _turno: '5', _maq: '5', _fechaKey: '2026-06-10', _ts: ts(19) },
    { _turno: '2', _maq: '5', _fechaKey: '2026-06-10', _ts: ts(20) },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[1]._turno, '5');
});

// 5. Día normal sin extras: T1, T2, T3 quedan intactos
t('día 3x8h → sin cambio', () => {
  const rows = [
    { _turno: '1', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(7) },
    { _turno: '2', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(15) },
    { _turno: '3', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(23) },
  ];
  canonicalizeTurnos(rows);
  assert.deepStrictEqual(rows.map(r => r._turno), ['1', '2', '3']);
});

// 6. T4 sin timestamp → sigue '4'
t('T4 sin _ts → 4', () => {
  const rows = [{ _turno: '4', _maq: '3', _fechaKey: '2026-06-10', _ts: null }];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[0]._turno, '4');
});

// 7. T2 sin _ts con T4 y T5 ambos presentes → default diurno '4'
t('T2 sin _ts, ambos extras → 4', () => {
  const rows = [
    { _turno: '4', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(7) },
    { _turno: '5', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(19) },
    { _turno: '2', _maq: '3', _fechaKey: '2026-06-10', _ts: null },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[2]._turno, '4');
});

// 8. Aislamiento por máquina: T4 en máq 3 no reescribe T1 de máq 7
t('grupos por máquina son independientes', () => {
  const rows = [
    { _turno: '4', _maq: '3', _fechaKey: '2026-06-10', _ts: ts(7) },
    { _turno: '1', _maq: '7', _fechaKey: '2026-06-10', _ts: ts(7) },
  ];
  canonicalizeTurnos(rows);
  assert.strictEqual(rows[1]._turno, '1'); // otra máquina, sin extras → intacto
});

// 9. windowForRow directo
t('windowForRow ubica T1/T3', () => {
  assert.strictEqual(windowForRow({ _turno: '1' }, false, false), 'D');
  assert.strictEqual(windowForRow({ _turno: '3' }, false, false), 'N');
});

// ── calcShiftHours ────────────────────────────────────────────────────────
// 10. Días sin turno de 12h: T1/T2/T3 suman 8h cada uno
t('horas: 3x8h = 24', () => assert.strictEqual(calcShiftHours(S('1','2','3')), 24));
t('horas: T1 solo = 8',  () => assert.strictEqual(calcShiftHours(S('1')), 8));
t('horas: T1+T2 = 16',   () => assert.strictEqual(calcShiftHours(S('1','2')), 16));

// 11. Turnos de 12h solos
t('horas: T4 solo = 12',  () => assert.strictEqual(calcShiftHours(S('4')), 12));
t('horas: T5 solo = 12',  () => assert.strictEqual(calcShiftHours(S('5')), 12));
t('horas: T4+T5 = 24',    () => assert.strictEqual(calcShiftHours(S('4','5')), 24));

// 12. UNIÓN de ventanas físicas (los turnos SE SOLAPAN, no se suman duraciones).
//     REGRESIÓN bug 2026-07-16: T4+T2-noche debe dar 16h (no 12), pero sin
//     sobre-contar solapes (T5+T3 = 12 porque T3 va dentro de T5; tope 24h).
t('horas: T4 + T2-noche (extiende) = 16', () => assert.strictEqual(calcShiftHours(S('4','2')), 16));
t('horas: T5 + T3 (contenido) = 12',      () => assert.strictEqual(calcShiftHours(S('5','3')), 12));
t('horas: T4 + T3 (sin solape) = 20',     () => assert.strictEqual(calcShiftHours(S('4','3')), 20));
t('horas: T2 + T5 = 16',                  () => assert.strictEqual(calcShiftHours(S('2','5')), 16));
t('horas: T1+T2+T5 = 24 (tope)',          () => assert.strictEqual(calcShiftHours(S('1','2','5')), 24));
t('horas: T2+T3+T4 = 24 (tope)',          () => assert.strictEqual(calcShiftHours(S('2','3','4')), 24));
t('horas: nunca supera 24',               () => assert.strictEqual(calcShiftHours(S('1','2','3','4','5')), 24));

// ── turnoSeconds (fuente única de segundos por turno) ─────────────────────
t('turnoSeconds: T1/T2/T3 = 28800 (8h)', () => {
  assert.strictEqual(turnoSeconds('1'), 28800);
  assert.strictEqual(turnoSeconds('2'), 28800);
  assert.strictEqual(turnoSeconds('3'), 28800);
});
t('turnoSeconds: T4/T5 = 43200 (12h)', () => {
  assert.strictEqual(turnoSeconds('4'), 43200);
  assert.strictEqual(turnoSeconds('5'), 43200);
});
t('turnoSeconds: turno desconocido = 28800 (default)', () => {
  assert.strictEqual(turnoSeconds('9'), 28800);
  assert.strictEqual(turnoSeconds(''), 28800);
});

// ── unidadesTeoricas = round(tiempo/ciclo × cav); ciclo<=0 → 0 ────────────
t('unidadesTeoricas: T4 12h, ciclo 13, cav 24 = 79754', () =>
  assert.strictEqual(unidadesTeoricas(43200, 13, 24), 79754));
t('unidadesTeoricas: T2 8h, ciclo 13, cav 24 = 53169', () =>
  assert.strictEqual(unidadesTeoricas(28800, 13, 24), 53169));
t('unidadesTeoricas: ciclo 0 → 0 (guarda)', () =>
  assert.strictEqual(unidadesTeoricas(43200, 0, 24), 0));
t('unidadesTeoricas: tiempo 0 → 0', () =>
  assert.strictEqual(unidadesTeoricas(0, 13, 24), 0));

// ── resolveFechaTurnoRaw ───────────────────────────────────────────────────
// Turnos 1/2/4 (no cruzan medianoche): DIA/MES/AÑO manda SIEMPRE — es la
// selección directa del operario, y ni "FECHAS SEGUN TURNO DE TRABAJO" ni
// "FECHA Y HORA ULTIMO REPORTE" son confiables para ellos (ver 2026-08-04).
// Turnos 3/5 (cruzan medianoche): "FECHAS SEGUN TURNO DE TRABAJO" manda.
t('Turno 1: usa DIA/MES/AÑO, ignora FECHAS SEGUN TURNO y FECHA Y HORA', () => {
  const row = {
    'TURNO': '1',
    'DIA': 3, 'MES': 'agosto', 'AÑO': 2026,
    'FECHA Y HORA ULTIMO REPORTE': '01/08/2026 21:49:42',
    'FECHAS SEGUN TURNO DE TRABAJO': '1/8/2026', // formula del sheet, desfasada
  };
  assert.strictEqual(resolveFechaTurnoRaw(row), '3/8/2026');
});
t('Turno 1 de madrugada (6:00-6:15am): DIA ya trae el día correcto, no la fórmula', () => {
  // Caso real: reporte de arranque a las 06:45 del día 2, pero la fórmula
  // "FECHAS SEGUN TURNO DE TRABAJO" retrocede un día (bug conocido del sheet)
  const row = {
    'TURNO': '1',
    'DIA': 2, 'MES': 'enero', 'AÑO': 2026,
    'FECHA Y HORA ULTIMO REPORTE': '02/01/2026 06:45:47',
    'FECHAS SEGUN TURNO DE TRABAJO': '1/1/2026',
  };
  assert.strictEqual(resolveFechaTurnoRaw(row), '2/1/2026');
});
t('Turno 3 (cruza medianoche): sigue usando FECHAS SEGUN TURNO, no DIA', () => {
  const row = {
    'TURNO': '3',
    'DIA': 4, 'MES': 'agosto', 'AÑO': 2026, // día calendario del reporte (después de medianoche)
    'FECHAS SEGUN TURNO DE TRABAJO': '3/8/2026', // día en que arrancó el turno — el correcto
  };
  assert.strictEqual(resolveFechaTurnoRaw(row), '3/8/2026');
});
t('Caja partida T3/T4 (Máquina 1, caja 40, 3/4-ago-2026): cada turno a su día', () => {
  // Misma caja partida entre el turno 3 que termina y el turno 4 que arranca;
  // la fórmula del sheet copiaba el día del T3 (3/8) también a la fila del T4.
  const filaT3 = {
    'TURNO': '3', 'DIA': 4, 'MES': 'agosto', 'AÑO': 2026,
    'FECHAS SEGUN TURNO DE TRABAJO': '3/8/2026',
  };
  const filaT4 = {
    'TURNO': '4', 'DIA': 4, 'MES': 'agosto', 'AÑO': 2026,
    'FECHAS SEGUN TURNO DE TRABAJO': '3/8/2026', // heredado por error del T3 vecino
  };
  assert.strictEqual(resolveFechaTurnoRaw(filaT3), '3/8/2026'); // T3: arrancó el 3
  assert.strictEqual(resolveFechaTurnoRaw(filaT4), '4/8/2026'); // T4: es del 4, no del 3
});
t('Turno 2 sin DIA/MES/AÑO usables: cae a FECHAS SEGUN TURNO', () => {
  const row = {
    'TURNO': '2',
    'FECHAS SEGUN TURNO DE TRABAJO': '10/6/2026',
  };
  assert.strictEqual(resolveFechaTurnoRaw(row), '10/6/2026');
});
t('Sin ninguna columna de fecha de turno: cae a cualquier columna FECHA con formato válido', () => {
  const row = {
    'TURNO': '2',
    'FECHA Y HORA ULTIMO REPORTE': '10/06/2026 15:00:00',
  };
  assert.strictEqual(resolveFechaTurnoRaw(row), '10/06/2026 15:00:00');
});
t('Turno 5 sin FECHAS SEGUN TURNO: último recurso, DIA/MES/AÑO', () => {
  const row = { 'TURNO': '5', 'DIA': 15, 'MES': 'marzo', 'AÑO': 2026 };
  assert.strictEqual(resolveFechaTurnoRaw(row), '15/3/2026');
});
t('MES numérico (no texto): también resuelve DIA/MES/AÑO', () => {
  const row = { 'TURNO': '1', 'DIA': 9, 'MES': 8, 'AÑO': 2026 };
  assert.strictEqual(resolveFechaTurnoRaw(row), '9/8/2026');
});


// ── esParoProgramado ──────────────────────────────────────────────────────
// El paro PROGRAMADO no descuenta Disponibilidad (nunca fue tiempo de
// producción planeado); el NO programado sí. Clasificar mal una razón mueve
// la Disponibilidad de todas las pestañas, así que la regla vive aquí sola.
t('Razones realmente programadas → true', () => {
  ['PARO PROGRAMADO',
   'MANTENIMIENTO PREVENTIVO PROGRAMADO',
   'MONTAJE MOLDE PROGRAMADO',
   'DESMONTAJE MOLDE PROGRAMADO',
   'paro programado'].forEach(rz =>
    assert.strictEqual(esParoProgramado(rz), true, rz));
});
// El bug: /programado/i también hace match con "PARO NO PROGRAMADO" y el
// tablero lo descontaba del tiempo disponible como si hubiera sido planeado,
// inflando la Disponibilidad (1.629 min en julio y agosto de 2026).
t('"PARO NO PROGRAMADO" NO es paro programado', () => {
  ['PARO NO PROGRAMADO',
   'paro no programado',
   'PARO  NO  PROGRAMADO',
   'NO PROGRAMADO',
   'NOPROGRAMADO'].forEach(rz =>
    assert.strictEqual(esParoProgramado(rz), false, rz));
});
t('Razones sin la palabra y vacías → false', () => {
  ['DAÑO ELECTRICO MAQUINA', 'AJUSTE TAPADORA', 'AUSENTISMO', '', null, undefined]
    .forEach(rz => assert.strictEqual(esParoProgramado(rz), false, String(rz)));
});

// ── fechaColDiaKey: el día TAL COMO LO DIGITÓ el operario (DIA/MES/AÑO) ──
// Existe para CONCILIAR el reporte con una suma manual hecha en el sheet.
// El tablero asigna cada caja al día de TRABAJO (6am-6am), que para T3/T5 no
// es el de estas columnas; sin poder comparar los dos, la diferencia parecía
// "el tablero suma mal". Ver Reporte Compacto → panel de conciliación.
t('fechaColDiaKey: mes en texto → YYYY-MM-DD', () => {
  assert.strictEqual(fechaColDiaKey({ DIA: 27, MES: 'agosto', 'AÑO': 2026 }), '2026-08-27');
});
t('fechaColDiaKey: todo como string y mes numérico', () => {
  assert.strictEqual(fechaColDiaKey({ DIA: '27', MES: '8', 'AÑO': '2026' }), '2026-08-27');
});
t('fechaColDiaKey: rellena a dos dígitos (ordenable)', () => {
  assert.strictEqual(fechaColDiaKey({ DIA: 5, MES: 8, 'AÑO': 2026 }), '2026-08-05');
});
t('fechaColDiaKey: año de 2 dígitos → 20XX', () => {
  assert.strictEqual(fechaColDiaKey({ DIA: 5, MES: 8, 'AÑO': 26 }), '2026-08-05');
});
t('fechaColDiaKey: columnas inservibles → null', () => {
  [{ DIA: '', MES: 'agosto', 'AÑO': 2026 },
   { DIA: 32, MES: 'agosto', 'AÑO': 2026 },
   { DIA: 27, MES: '#REF!', 'AÑO': 2026 },
   { DIA: 27, MES: 'agosto', 'AÑO': '' },
   {}].forEach(r => assert.strictEqual(fechaColDiaKey(r), null, JSON.stringify(r)));
});

console.log(`\n${passed} pruebas OK`);
