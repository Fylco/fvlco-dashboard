const assert = require('node:assert');
const { canonicalizeTurnos, windowForRow, calcShiftHours } = require('./turnos.js');
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

// 12. REGRESIÓN (bug 2026-07-16): un turno de 8h que sobrevive junto a un 12h es
//     un turno físico EXTRA y DEBE sumar sus horas (antes se ignoraba → 12).
t('horas: T4 + T2-noche residual = 20', () => assert.strictEqual(calcShiftHours(S('4','2')), 20));
t('horas: T5 + T3 residual = 20',       () => assert.strictEqual(calcShiftHours(S('5','3')), 20));
t('horas: T4 + T3 residual = 20',       () => assert.strictEqual(calcShiftHours(S('4','3')), 20));

console.log(`\n${passed} pruebas OK`);
