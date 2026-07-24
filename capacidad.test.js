const assert = require('node:assert');
const { capNorm, capMaquinas, calcCapacidadMotor } = require('./capacidad.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// ── capMaquinas ─────────────────────────────────────────────────────────────
t('capMaquinas: "1" → [INY#1]', () => {
  assert.deepStrictEqual(capMaquinas('1'), ['INY#1']);
});
t('capMaquinas: "1-2" → [INY#1, INY#2]', () => {
  assert.deepStrictEqual(capMaquinas('1-2'), ['INY#1', 'INY#2']);
});
t('capMaquinas: "TV1-TV2" → [TV#1, TV#2]', () => {
  assert.deepStrictEqual(capMaquinas('TV1-TV2'), ['TV#1', 'TV#2']);
});
t('capMaquinas: "Maquila" → []', () => {
  assert.deepStrictEqual(capMaquinas('Maquila'), []);
});

// ── capNorm ─────────────────────────────────────────────────────────────────
t('capNorm: normaliza LYNNER→LINER y cruza con LINER ya escrito', () => {
  assert.strictEqual(capNorm('valvula lynner 15mm'), capNorm('VALVULA LINER 15MM'));
});
t('capNorm: orden de palabras no importa', () => {
  assert.strictEqual(capNorm('TERRA VALVULA 15MM * 48'), capNorm('VALVULA TERRA 15MM * 48'));
});

// ── calcCapacidadMotor ────────────────────────────────────────────────────
// Fixture: producto A en 2 máquinas (INY#1 + INY#2), calendario 11 turnos/mes.
const blockA = (overrides = {}) => ({
  producto: 'PRODUCTO A', cavidades: 10, ciclo: 12, rendimiento: 1,
  maquina: '1-2', requerida: 48000,
  fechas: ['01/07/2026', '02/07/2026', '03/07/2026', '04/07/2026', '05/07/2026', '06/07/2026', '07/07/2026'],
  turnosUsado: [2, 2, 2, 2, 2, 1, 0], // suma = 11
  acumPlan: [], acumReal: [], totalPlaneada: 0, totalReal: 0, diaCumpl: '',
  ...overrides,
});

t('calcCapacidadMotor: reparte turnos requeridos entre las 2 máquinas asignadas', () => {
  const out = calcCapacidadMotor([blockA()], {}, {});
  // und8h = floor(10 * 28800/12 * 1) = 24000 und/turno; turnos = 48000/24000 = 2
  // repartido entre INY#1 e INY#2 → 1 turno cada una
  assert.deepStrictEqual(out.maqNms, ['INY#1', 'INY#2']);
  assert.strictEqual(out.maqLoad['INY#1'], 1);
  assert.strictEqual(out.maqLoad['INY#2'], 1);
  assert.strictEqual(out.turnosReqTotal, 2);
});

t('calcCapacidadMotor: turnos disponibles vienen del calendario (turnosUsado)', () => {
  const out = calcCapacidadMotor([blockA()], {}, {});
  assert.strictEqual(out.maqTurnosDisp['INY#1'], 11);
  assert.strictEqual(out.maqTurnosDisp['INY#2'], 11);
});

t('calcCapacidadMotor: override de cavidades afecta solo al producto ajustado', () => {
  const blockB = blockA({ producto: 'PRODUCTO B', maquina: '3' });
  const cavOv = { [capNorm('PRODUCTO B')]: 5 }; // baja de 10 a 5 cavidades
  const out = calcCapacidadMotor([blockA(), blockB], cavOv, {});
  const itemA = out.items.find(i => i.producto === 'PRODUCTO A');
  const itemB = out.items.find(i => i.producto === 'PRODUCTO B');
  assert.strictEqual(itemA.cavidades, 10); // sin cambio
  assert.strictEqual(itemA.overridden, false);
  assert.strictEqual(itemB.cavidades, 5); // override aplicado
  assert.strictEqual(itemB.overridden, true);
  // und8h de B a la mitad → turnos de B se duplican frente a los que tendría sin override
  assert.strictEqual(itemB.und8h, 12000);
  assert.strictEqual(itemB.turnos, 4);
});

t('calcCapacidadMotor: override de turnos-por-día afecta solo esa máquina/día', () => {
  const blockC = blockA({ producto: 'PRODUCTO C', maquina: '3' }); // máquina propia, no compartida
  const turnosDiaOv = { 'INY#3': { 0: 0 } }; // día 0 (índice) pasa de 2 a 0 turnos
  const out = calcCapacidadMotor([blockC], {}, turnosDiaOv);
  assert.strictEqual(out.maqDias['INY#3'][0], 0);
  assert.deepStrictEqual(out.maqDias['INY#3'].slice(1), [2, 2, 2, 2, 1, 0]);
  assert.strictEqual(out.maqTurnosDisp['INY#3'], 9); // 11 - 2
});

t('calcCapacidadMotor: detecta desborde cuando lo requerido excede lo disponible', () => {
  const blockD = blockA({ producto: 'PRODUCTO D', maquina: '4', requerida: 480000 }); // turnos = 20
  const out = calcCapacidadMotor([blockD], {}, {});
  assert.strictEqual(out.overflow.length, 1);
  assert.strictEqual(out.overflow[0].maquina, 'INY#4');
  assert.strictEqual(out.overflow[0].producto, 'PRODUCTO D');
  assert.strictEqual(out.overflow[0].turnos, 20 - 11);
});

t('calcCapacidadMotor: sin desborde cuando lo disponible alcanza', () => {
  const out = calcCapacidadMotor([blockA()], {}, {}); // requiere 2 turnos, hay 11
  assert.strictEqual(out.overflow.length, 0);
});

t('calcCapacidadMotor: producto en maquila no aporta a maqLoad ni a los totales', () => {
  const blockMaq = blockA({ producto: 'PRODUCTO MAQUILA', maquina: 'Maquila' });
  const out = calcCapacidadMotor([blockMaq], {}, {});
  const item = out.items.find(i => i.producto === 'PRODUCTO MAQUILA');
  assert.strictEqual(item.esMaquila, true);
  assert.deepStrictEqual(out.maqNms, []);
  assert.strictEqual(out.turnosReqTotal, 0);
  assert.strictEqual(out.turnosReqIny, 0);
  assert.strictEqual(out.turnosReqTV, 0);
});

t('calcCapacidadMotor: máquina TV suma a turnosReqTV, no a turnosReqIny', () => {
  const blockTV = blockA({ producto: 'PRODUCTO TV', maquina: 'TV1' });
  const out = calcCapacidadMotor([blockTV], {}, {});
  assert.strictEqual(out.turnosReqTV, 2);
  assert.strictEqual(out.turnosReqIny, 0);
});

console.log(`\n${passed} pruebas OK`);
