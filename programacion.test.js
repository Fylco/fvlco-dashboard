const assert = require('node:assert');
const { reconstruirAcumReal, datosInconsistentes, proyectarDiaCumplimiento } = require('./programacion.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// ── reconstruirAcumReal ──────────────────────────────────────────────────
t('reconstruirAcumReal: suma corrida simple sin huecos', () => {
  const out = reconstruirAcumReal([10, 20, 30]);
  assert.deepStrictEqual(out.acum, [10, 30, 60]);
  assert.strictEqual(out.lastIdx, 2);
  assert.strictEqual(out.total, 60);
});

t('reconstruirAcumReal: huecos (null) no rompen la suma ni avanzan lastIdx', () => {
  const out = reconstruirAcumReal([10, null, 20]);
  assert.deepStrictEqual(out.acum, [10, 10, 30]);
  assert.strictEqual(out.lastIdx, 2); // el día 3 sí reportó, avanza
});

t('reconstruirAcumReal: huecos al final no avanzan lastIdx (no reportados aún)', () => {
  const out = reconstruirAcumReal([10, 20, null, null]);
  assert.deepStrictEqual(out.acum, [10, 30, 30, 30]);
  assert.strictEqual(out.lastIdx, 1); // días 3 y 4 aún no se reportan
});

t('reconstruirAcumReal: un 0 explícito SÍ avanza lastIdx (a diferencia del bug original)', () => {
  const out = reconstruirAcumReal([10, 0, null]);
  assert.strictEqual(out.lastIdx, 1); // el día 2 reportó "0", cuenta como dato
  assert.deepStrictEqual(out.acum, [10, 10, 10]);
});

t('reconstruirAcumReal: reproduce el caso real de "Tapa 15 mm terra" (julio 2026)', () => {
  // fila CANTIDAD REAL (MANUAL) tal cual viene del Sheet — incluye el hueco del
  // 19/07 y el "reinicio" de ACUM REAL que ocurre a partir del 20/07 en el Sheet
  // (pero aquí usamos la fila DIARIA, que nunca se rompió)
  const realDiario = [
    146000, 143000, 143123, 113000, 43000, 149000, 101400, 87000, 99500, 48000,
    0, 0, 0, 34000, 63000, 97500, 126000, 47400, null, 45350,
    137199, 98000, 122000, null, null, null, null, null, null, null, null,
  ];
  const out = reconstruirAcumReal(realDiario);
  assert.strictEqual(out.total, 1843472); // coincide con SUMA TOTAL REAL del Sheet
  assert.strictEqual(out.lastIdx, 22); // 23/07/2026, último día reportado
});

// ── datosInconsistentes ───────────────────────────────────────────────────
t('datosInconsistentes: coincide dentro de tolerancia → false', () => {
  assert.strictEqual(datosInconsistentes(1843472, 1843472), false);
  assert.strictEqual(datosInconsistentes(1843472, 1843470), false); // diferencia mínima
});

t('datosInconsistentes: diferencia grande → true', () => {
  assert.strictEqual(datosInconsistentes(402549, 1843472), true);
});

t('datosInconsistentes: ambos en cero → false (no hay nada que comparar)', () => {
  assert.strictEqual(datosInconsistentes(0, 0), false);
});

// ── proyectarDiaCumplimiento ──────────────────────────────────────────────
const fechasJulio = Array.from({ length: 31 }, (_, i) => `${i + 1}/07/2026`);

t('proyectarDiaCumplimiento: no alcanza en el mes', () => {
  const { acum, lastIdx } = reconstruirAcumReal([10000, 10000, 10000]); // ritmo bajo
  const out = proyectarDiaCumplimiento({ requerida: 10000000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'No alcanza en el mes');
});

t('proyectarDiaCumplimiento: ya cumplido, muestra el día en que se alcanzó', () => {
  const { acum, lastIdx } = reconstruirAcumReal([50000, 50000, 50000]);
  const out = proyectarDiaCumplimiento({ requerida: 90000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'Cumplido el 2/07/2026'); // acum[1] = 100000 >= 90000
});

t('proyectarDiaCumplimiento: sin producción registrada', () => {
  const { acum, lastIdx } = reconstruirAcumReal([null, null, null]);
  const out = proyectarDiaCumplimiento({ requerida: 90000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, 'Sin producción registrada');
});

t('proyectarDiaCumplimiento: proyecta una fecha dentro del mes cuando el ritmo alcanza', () => {
  // ritmo 50.000/día, faltan 100.000 tras el día 2 → cumple el día 4
  const { acum, lastIdx } = reconstruirAcumReal([50000, 50000]);
  const out = proyectarDiaCumplimiento({ requerida: 200000, acum, lastIdx, fechas: fechasJulio });
  assert.strictEqual(out, '4/07/2026');
});

console.log(`\n${passed} pruebas OK`);
