const assert = require('node:assert');
const { supLotesFaltantes, supOrdenarProgramadas, supResumenLotes, supDiffLotes } = require('./supLotes.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// ── supLotesFaltantes ─────────────────────────────────────────────
t('fila completa → no falta nada', () => {
  const f = supLotesFaltantes({ mp: '9018 MARLEX', loteMp: 'DTB920720', loteProd: '821-0' });
  assert.strictEqual(f.loteMp, false);
  assert.strictEqual(f.loteProd, false);
  assert.strictEqual(f.alguno, false);
});

t('sin lote de produccion → falta solo ese', () => {
  const f = supLotesFaltantes({ mp: '9018 MARLEX', loteMp: 'DTB920720', loteProd: '' });
  assert.strictEqual(f.loteMp, false);
  assert.strictEqual(f.loteProd, true);
  assert.strictEqual(f.alguno, true);
});

t('sin ninguno de los dos lotes', () => {
  const f = supLotesFaltantes({ mp: 'LH5420' });
  assert.strictEqual(f.loteMp, true);
  assert.strictEqual(f.loteProd, true);
  assert.strictEqual(f.alguno, true);
});

t('solo espacios cuenta como vacio', () => {
  const f = supLotesFaltantes({ mp: 'LH5420', loteMp: '   ', loteProd: '\t' });
  assert.strictEqual(f.alguno, true);
});

t('la MP vacia NO cuenta como falta de lote', () => {
  // La MP es obligatoria al programar; su ausencia no es un pendiente de lote.
  const f = supLotesFaltantes({ mp: '', loteMp: 'A1', loteProd: 'B2' });
  assert.strictEqual(f.alguno, false);
});

// ── supOrdenarProgramadas ─────────────────────────────────────────
t('las que les falta lote van primero, y es estable', () => {
  const prog = [
    { fila: 3, orden: 'A', loteMp: 'x', loteProd: 'y' },
    { fila: 4, orden: 'B', loteMp: '',  loteProd: '' },
    { fila: 5, orden: 'C', loteMp: 'x', loteProd: 'y' },
    { fila: 6, orden: 'D', loteMp: 'x', loteProd: '' },
  ];
  const out = supOrdenarProgramadas(prog);
  assert.deepStrictEqual(out.map(p => p.orden), ['B', 'D', 'A', 'C']);
  assert.strictEqual(prog[0].orden, 'A', 'no debe mutar el arreglo original');
});

t('lista vacia y undefined no explotan', () => {
  assert.deepStrictEqual(supOrdenarProgramadas([]), []);
  assert.deepStrictEqual(supOrdenarProgramadas(undefined), []);
});

// ── supResumenLotes ───────────────────────────────────────────────
t('resumen con pendientes', () => {
  const prog = [
    { loteMp: '',  loteProd: '' },
    { loteMp: 'x', loteProd: '' },
    { loteMp: 'x', loteProd: 'y' },
  ];
  assert.strictEqual(supResumenLotes(prog), '2 sin lote · 3 en producción');
});

t('resumen sin pendientes', () => {
  assert.strictEqual(supResumenLotes([{ loteMp: 'x', loteProd: 'y' }]), '1 en producción');
});

t('resumen de lista vacia es cadena vacia', () => {
  assert.strictEqual(supResumenLotes([]), '');
  assert.strictEqual(supResumenLotes(undefined), '');
});

// ── supDiffLotes ──────────────────────────────────────────────────
t('MP vacia es error de validacion', () => {
  const d = supDiffLotes({ mp: 'LH5420', loteMp: '', loteProd: '' },
                         { mp: '',       loteMp: 'A', loteProd: 'B' });
  assert.strictEqual(d.error, 'La materia prima no puede quedar vacía (columna M).');
  assert.strictEqual(d.hayCambios, false);
  assert.deepStrictEqual(d.cambios, []);
});

t('sin cambios → hayCambios false', () => {
  const fila = { mp: 'LH5420', loteMp: 'A1', loteProd: 'B2' };
  const d = supDiffLotes(fila, { mp: 'LH5420', loteMp: 'A1', loteProd: 'B2' });
  assert.strictEqual(d.error, null);
  assert.strictEqual(d.hayCambios, false);
});

t('espacios de sobra no son un cambio', () => {
  const d = supDiffLotes({ mp: 'LH5420', loteMp: 'A1', loteProd: 'B2' },
                         { mp: ' LH5420 ', loteMp: 'A1  ', loteProd: ' B2' });
  assert.strictEqual(d.hayCambios, false);
});

t('llenar un lote vacio → un cambio, antes vacio', () => {
  const d = supDiffLotes({ mp: 'LH5420', loteMp: 'A1', loteProd: '' },
                         { mp: 'LH5420', loteMp: 'A1', loteProd: '821-0' });
  assert.strictEqual(d.hayCambios, true);
  assert.strictEqual(d.cambios.length, 1);
  assert.strictEqual(d.cambios[0].campo, 'loteProd');
  assert.strictEqual(d.cambios[0].label, 'Lote producción (col. O)');
  assert.strictEqual(d.cambios[0].antes, '');
  assert.strictEqual(d.cambios[0].despues, '821-0');
});

t('sobrescribir conserva el valor anterior', () => {
  const d = supDiffLotes({ mp: 'LH5420', loteMp: 'A1', loteProd: '821-0' },
                         { mp: '9018 MARLEX', loteMp: 'A1', loteProd: '822-1' });
  assert.strictEqual(d.cambios.length, 2);
  assert.deepStrictEqual(d.cambios.map(c => c.campo), ['mp', 'loteProd']);
  assert.strictEqual(d.cambios[0].antes, 'LH5420');
  assert.strictEqual(d.cambios[0].despues, '9018 MARLEX');
  assert.strictEqual(d.cambios[1].antes, '821-0');
});

t('borrar un lote que tenia valor es un cambio con despues vacio', () => {
  const d = supDiffLotes({ mp: 'LH5420', loteMp: 'A1', loteProd: '821-0' },
                         { mp: 'LH5420', loteMp: '',   loteProd: '821-0' });
  assert.strictEqual(d.hayCambios, true);
  assert.strictEqual(d.cambios[0].campo, 'loteMp');
  assert.strictEqual(d.cambios[0].antes, 'A1');
  assert.strictEqual(d.cambios[0].despues, '');
});

console.log('\n' + passed + ' pruebas OK');
