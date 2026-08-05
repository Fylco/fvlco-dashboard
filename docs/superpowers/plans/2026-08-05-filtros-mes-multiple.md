# Filtros de Mes Múltiples + Tamaño de Filtros + Hover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir los 6 filtros de mes de "reporte histórico" (Global, Costos, Tiempos de Paro, No Conformes, Plan vs Real Referencias, Reporte Diario) de selección única a selección múltiple, agrandar los controles de filtro en toda la app, y agregar resalte al pasar el mouse.

**Architecture:** Todo el trabajo es en un único archivo, `fvlco-app/index.html` (HTML+CSS+JS inline, sin build step). Se sigue el patrón YA existente de "día"/"máquina" (botón `.multi-sel-btn` + dropdown `.multi-sel-dropdown` de checkboxes + `Set` en JS), pero factorizado en funciones genéricas reutilizables (no 6 copias). El filtro de mes de "Tablero Plan" (`po-mes-sel`) queda **fuera de alcance** — es el mes activo de planeación (un entero, usado en 12+ funciones), no un filtro de reporte.

**Tech Stack:** HTML/CSS/JS vanilla, sin frameworks. No hay test runner para este archivo — la verificación es manual en navegador (Browser pane) contra `DATA` cargado en vivo, siguiendo la misma técnica usada en el resto de esta sesión.

## Global Constraints
- No tocar el filtro de "día" existente (`SEL_DIAS`, `toggleDiaDD`, etc.) — solo se usa como referencia de patrón.
- No tocar nada de "Tablero Plan" (`po-mes-sel`) ni sus 12+ funciones consumidoras.
- No cambiar ninguna fórmula/cálculo de negocio — solo cómo se lee/aplica el filtro de mes y el CSS de los controles.
- Todas las claves de mes en los `Set` se guardan en **minúsculas** (igual que `r._mes`/`r._mesTurno`), y se capitalizan solo para mostrar (`cap()`, ya existente) o para indexar columnas del plan (`MESES_CAP`, ya existente).
- Verificar cada tarea en `http://localhost:3001` (preview local, `.claude/launch.json` ya tiene la config `fvlco-app`) antes de pasar a la siguiente.

---

### Task 1: CSS — tamaño de filtros + hover

**Files:**
- Modify: `fvlco-app/index.html:65-90` (clases `.btn-filter`, `.btn-clear`, `.multi-sel-btn`, `.fp-select`)

**Interfaces:** Ninguna — cambio puramente visual, no toca JS.

- [ ] **Paso 1: Agrandar las clases compartidas de filtro**

Reemplazar (buscar cada línea exacta y reemplazar solo esa línea):

```css
/* ANTES (línea 65) */
.btn-filter { background: #8B5CF6; color: #fff; border: none; border-radius: 8px; padding: 6px 16px; font-size: .78rem; font-weight: 600; cursor: pointer; font-family: Tahoma, Arial, sans-serif; }
/* DESPUÉS */
.btn-filter { background: #8B5CF6; color: #fff; border: none; border-radius: 8px; padding: 8px 20px; font-size: .88rem; font-weight: 600; cursor: pointer; font-family: Tahoma, Arial, sans-serif; transition: background-color .15s; }
```

```css
/* ANTES (línea 66) */
.btn-clear { background: #1F2937; color: #9CA3AF; border: 1px solid #374151; border-radius: 8px; padding: 6px 14px; font-size: .78rem; cursor: pointer; font-family: Tahoma, Arial, sans-serif; }
/* DESPUÉS */
.btn-clear { background: #1F2937; color: #9CA3AF; border: 1px solid #374151; border-radius: 8px; padding: 8px 18px; font-size: .88rem; cursor: pointer; font-family: Tahoma, Arial, sans-serif; transition: border-color .15s, background-color .15s; }
```

```css
/* ANTES (línea 76) */
.multi-sel-btn { background:#1F2937; border:1px solid #374151; border-radius:6px; padding:4px 10px; color:#EEEEEE; font-size:.73rem; cursor:pointer; font-family:Tahoma,Arial,sans-serif; white-space:nowrap; transition:border-color .2s; }
/* DESPUÉS */
.multi-sel-btn { background:#1F2937; border:1px solid #374151; border-radius:6px; padding:7px 14px; color:#EEEEEE; font-size:.85rem; cursor:pointer; font-family:Tahoma,Arial,sans-serif; white-space:nowrap; transition:border-color .15s, background-color .15s; }
```

```css
/* ANTES (línea 89) */
.fp-select { width:100%; background:#1F2937; border:1px solid #374151; border-radius:6px; padding:5px 8px; color:#EEEEEE; font-size:.74rem; outline:none; font-family:Tahoma,Arial,sans-serif; margin-bottom:2px; }
/* DESPUÉS */
.fp-select { width:100%; background:#1F2937; border:1px solid #374151; border-radius:6px; padding:8px 10px; color:#EEEEEE; font-size:.85rem; outline:none; font-family:Tahoma,Arial,sans-serif; margin-bottom:2px; transition:border-color .15s, background-color .15s; }
```

- [ ] **Paso 2: Agregar reglas de hover** (justo después de la línea 77, `.multi-sel-btn.active`)

```css
.multi-sel-btn:hover, .fp-select:hover, select:hover { background:#2A3441; border-color:#8B5CF6; }
.btn-filter:hover { background:#7C3AED; }
.btn-clear:hover { border-color:#8B5CF6; color:#C4B5FD; }
```

- [ ] **Paso 3: Verificar en el navegador**

```bash
# el servidor local ya debería estar corriendo (preview_start name:"fvlco-app", puerto 3001)
```
Recargar `http://localhost:3001`, pasar el mouse sobre cualquier botón de filtro (ej. "Todos los días ▾") y confirmar visualmente que: (a) el botón se ve más grande que antes, (b) al pasar el mouse el fondo/borde se resalta en violeta. Repetir en 2-3 pestañas distintas (Reporte Diario, Costos) para confirmar que el cambio aplica en toda la app (clases compartidas).

- [ ] **Paso 4: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: agranda controles de filtro y agrega resalte hover en toda la app"
```

---

### Task 2: Infraestructura genérica de filtro de mes múltiple

**Files:**
- Modify: `fvlco-app/index.html:1731` (declarar los 6 nuevos `Set`, justo después de `SEL_MAQ_COSTOS`)
- Modify: `fvlco-app/index.html:3052` (agregar las funciones genéricas, cerca de `gMes()`)

**Interfaces:**
- Produces: `SEL_MESES`, `SEL_MESES_COSTOS`, `SEL_MESES_PARO`, `SEL_MESES_NC`, `SEL_MESES_PREF`, `SEL_MESES_RD` (todo `Set` de strings en minúsculas).
- Produces: `registrarFiltroMes(ddId, btnId, selSet, onChange)`, `buildMesMultiDd(ddId, meses)`, `toggleMesMultiDD(ddId, e)`, `toggleMesMulti(ddId, mes)`, `clearMesMulti(ddId)`, `mesMatch(selSet, mesStr)`.
- Consumes: nada nuevo — usa `document`, `Set` estándar.

- [ ] **Paso 1: Declarar los 6 Sets nuevos**

En `index.html:1731`, después de `let SEL_MAQ_COSTOS  = new Set();`, agregar:

```js
let SEL_MESES         = new Set();  // filtro global (Informe de Cierre)
let SEL_MESES_COSTOS  = new Set();
let SEL_MESES_PARO    = new Set();
let SEL_MESES_NC      = new Set();
let SEL_MESES_PREF    = new Set();
let SEL_MESES_RD      = new Set();
```

- [ ] **Paso 2: Escribir las funciones genéricas**

Justo antes de `function gMes()` (línea 3052), agregar:

```js
// ── Filtro de mes de selección múltiple (genérico, reutilizado en 6 pestañas) ──
// Registro: ddId -> { selSet, btnId, onChange }. Los checkboxes del dropdown
// llaman a toggleMesMulti(ddId, mes) con el ddId como clave, así una sola
// función sirve para las 6 instancias sin duplicar código por pestaña.
const MES_MULTI_REG = {};

function registrarFiltroMes(ddId, btnId, selSet, onChange) {
  MES_MULTI_REG[ddId] = { selSet, btnId, onChange };
}

// true si no hay filtro (set vacío = "todos") o si mesStr (ya en minúsculas)
// está en el set.
function mesMatch(selSet, mesStr) {
  return !selSet.size || selSet.has(String(mesStr || '').toLowerCase());
}

function buildMesMultiDd(ddId, meses) {
  const dd = document.getElementById(ddId);
  const reg = MES_MULTI_REG[ddId];
  if (!dd || !reg) return;
  dd.innerHTML = meses.map(m => {
    const ml = m.toLowerCase();
    return `<label class="ms-item">
      <input type="checkbox" onchange="toggleMesMulti('${ddId}','${ml}')" ${reg.selSet.has(ml)?'checked':''}>
      <span>${cap(ml)}</span>
    </label>`;
  }).join('');
}

function toggleMesMultiDD(ddId, e) {
  e.stopPropagation();
  const dd = document.getElementById(ddId);
  dd.classList.toggle('show');
  if (dd.classList.contains('show')) dd.onclick = ev => ev.stopPropagation();
}

function toggleMesMulti(ddId, mes) {
  const reg = MES_MULTI_REG[ddId]; if (!reg) return;
  if (reg.selSet.has(mes)) reg.selSet.delete(mes); else reg.selSet.add(mes);
  updateMesMultiBtn(ddId);
  reg.onChange();
}

function clearMesMulti(ddId) {
  const reg = MES_MULTI_REG[ddId]; if (!reg) return;
  reg.selSet.clear();
  document.querySelectorAll(`#${ddId} input[type=checkbox]`).forEach(cb => cb.checked = false);
  updateMesMultiBtn(ddId);
  reg.onChange();
}

function updateMesMultiBtn(ddId) {
  const reg = MES_MULTI_REG[ddId]; if (!reg) return;
  const btn = document.getElementById(reg.btnId); if (!btn) return;
  if (reg.selSet.size === 0) { btn.textContent = 'Todos los meses ▾'; btn.classList.remove('active'); }
  else { btn.textContent = `${reg.selSet.size} mes(es) ▾`; btn.classList.add('active'); }
}
```

- [ ] **Paso 3: Verificar que no rompe nada**

Recargar `http://localhost:3001` y confirmar en la consola del navegador (no debe haber errores nuevos):

```js
typeof registrarFiltroMes === 'function' && typeof mesMatch === 'function'
// debe devolver true
```

Ninguna pestaña cambia de comportamiento todavía (las funciones existen pero no están conectadas a ningún HTML). Este paso solo confirma que el JS no tiene errores de sintaxis.

- [ ] **Paso 4: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: infraestructura genérica de filtro de mes múltiple (sin conectar aún)"
```

---

### Task 3: Filtro GLOBAL (Informe de Cierre) → múltiple

**Files:**
- Modify: `fvlco-app/index.html:295-297` (HTML del select)
- Modify: `fvlco-app/index.html:3052` (`gMes()`)
- Modify: `fvlco-app/index.html:3056, 3100, 3353, 5752` (los 4 call-sites de `gMes()`)
- Modify: `fvlco-app/index.html:2988` (`populateAllFilters`, reemplaza `fillSel('g-mes', ...)`)
- Modify: `fvlco-app/index.html:6489, 6628-6629, 6766-6767` (`exportPDF`)

**Interfaces:**
- Consumes: `registrarFiltroMes`, `buildMesMultiDd`, `toggleMesMultiDD`, `mesMatch`, `SEL_MESES` (Task 2).
- Produces: `gMes()` ahora devuelve el `Set` `SEL_MESES` (antes devolvía un string).

- [ ] **Paso 1: Reemplazar el HTML del select global**

```html
<!-- ANTES (líneas 295-297) -->
<select id="g-mes" onchange="applyGlobalFilter()" style="background:#1F2937;border:1px solid #374151;border-radius:6px;padding:4px 10px;color:#EEEEEE;font-size:.73rem;outline:none;font-family:Tahoma,Arial,sans-serif">
  <option value="">Todos los meses</option>
</select>
<!-- DESPUÉS -->
<div class="multi-sel-wrap">
  <button class="multi-sel-btn" id="g-mes-btn" onclick="toggleMesMultiDD('g-mes-dd', event)">Todos los meses ▾</button>
  <div class="multi-sel-dropdown" id="g-mes-dd"></div>
</div>
```

- [ ] **Paso 2: Cambiar `gMes()` para que devuelva el Set**

```js
// ANTES (línea 3052)
function gMes() { return getVal('g-mes').toLowerCase(); }
// DESPUÉS
function gMes() { return SEL_MESES; }
```

- [ ] **Paso 3: Actualizar los 4 call-sites de `gMes()`**

```js
// filterProd() — ANTES (línea 3059)
(!m        || r._mes === m) &&
// DESPUÉS
(mesMatch(m, r._mes)) &&
```

```js
// filterVentas() — ANTES (línea 3102)
(!m || String(r['MES ']||r['MES']||'').trim().toLowerCase() === m) &&
// DESPUÉS
(mesMatch(m, String(r['MES ']||r['MES']||'').trim())) &&
```

```js
// gráfico mini OEE por máquina — ANTES (línea 3355)
(!_mSel || r._mes === _mSel) && (!_dias.size || _dias.has(r._diaTurno||''))
// DESPUÉS
(mesMatch(_mSel, r._mes)) && (!_dias.size || _dias.has(r._diaTurno||''))
```

```js
// renderMaquilas() — ANTES (líneas 5756-5758)
if (!mm) return !_gm && !_gd.size;            // sin fecha válida: solo si no hay filtro
const dia = String(parseInt(mm[1])), mes = _MES[parseInt(mm[2])] || '';
if (_gm && mes !== _gm) return false;
// DESPUÉS
if (!mm) return !_gm.size && !_gd.size;       // sin fecha válida: solo si no hay filtro
const dia = String(parseInt(mm[1])), mes = _MES[parseInt(mm[2])] || '';
if (!mesMatch(_gm, mes)) return false;
```

- [ ] **Paso 4: Reemplazar el `fillSel` global por el registro + build del dropdown**

```js
// ANTES (línea 2988, dentro de populateAllFilters())
fillSel('g-mes', meses.map(cap), 'Mes');
// DESPUÉS
registrarFiltroMes('g-mes-dd', 'g-mes-btn', SEL_MESES, applyGlobalFilter);
buildMesMultiDd('g-mes-dd', meses);
```

- [ ] **Paso 5: Actualizar los 3 sitios en `exportPDF` (línea 6475)**

```js
// ANTES (línea 6489)
const mesLabel  = getVal('g-mes') ? cap(getVal('g-mes')) : 'Todos los meses';
// DESPUÉS
const mesLabel  = SEL_MESES.size ? [...SEL_MESES].map(cap).join(', ') : 'Todos los meses';
```

```js
// ANTES (líneas 6628-6629)
const mesSel2  = getVal('pref-f-mes')||getVal('g-mes');
const mesesR2  = mesSel2 ? [cap(mesSel2)] : MESES_CAP;
// DESPUÉS — código final (usa SEL_MESES_PREF, declarado en Task 2; el HTML/UI de
// pref-mes-btn se conecta recién en Task 7, pero el Set ya existe y empieza
// vacío, así que este código cae correctamente al fallback SEL_MESES/MESES_CAP
// hasta que Task 7 lo conecte — no hace falta tocar esta línea de nuevo.
const _mesesEfectPref = SEL_MESES_PREF.size ? SEL_MESES_PREF : SEL_MESES;
const mesesR2  = _mesesEfectPref.size ? [..._mesesEfectPref].map(cap) : MESES_CAP;
```

```js
// ANTES (líneas 6766-6767)
if (!mm) return !getVal('g-mes');
if (getVal('g-mes') && _MES2p[parseInt(mm[2])] !== getVal('g-mes').toLowerCase()) return false;
// DESPUÉS
if (!mm) return !SEL_MESES.size;
if (!mesMatch(SEL_MESES, _MES2p[parseInt(mm[2])])) return false;
```

- [ ] **Paso 6: Verificar en el navegador**

```js
// En la consola del navegador, tras recargar http://localhost:3001:
document.getElementById('g-mes-btn').click();          // abre el dropdown
document.querySelector('#g-mes-dd input').click();     // marca el primer mes
document.getElementById('g-mes-btn').textContent;       // debe decir "1 mes(es) ▾"
```
Ir a la pestaña "OEE" o "Costos" y confirmar visualmente que los datos mostrados cambian a solo ese mes. Marcar un SEGUNDO mes en el dropdown y confirmar que ahora se ven datos de AMBOS meses combinados (no solo uno). Desmarcar todo y confirmar que vuelve a "Todos los meses" con todos los datos.

- [ ] **Paso 7: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro global de mes pasa a selección múltiple"
```

---

### Task 4: Filtro de mes de COSTOS → múltiple

**Files:**
- Modify: `fvlco-app/index.html:792-794` (HTML)
- Modify: `fvlco-app/index.html:3003` (`populateAllFilters`)
- Modify: `fvlco-app/index.html:3068` (`filterCostos`)
- Modify: `fvlco-app/index.html:805` (agregar botón "✕ Limpiar mes" junto al de días)

**Interfaces:**
- Consumes: `SEL_MESES_COSTOS`, `SEL_MESES` (Task 2/3), `registrarFiltroMes`, `buildMesMultiDd`, `toggleMesMultiDD`, `mesMatch`, `clearMesMulti`.

- [ ] **Paso 1: Reemplazar el HTML**

```html
<!-- ANTES (líneas 792-794) -->
<select id="costos-f-mes" class="fp-select" onchange="renderCostos()">
  <option value="">Todos los meses</option>
</select>
<!-- DESPUÉS -->
<div class="multi-sel-wrap">
  <button class="multi-sel-btn" id="costos-mes-btn" onclick="toggleMesMultiDD('costos-mes-dd', event)" style="width:100%;text-align:left">Todos los meses ▾</button>
  <div class="multi-sel-dropdown" id="costos-mes-dd"></div>
</div>
<button onclick="clearMesMulti('costos-mes-dd')" style="margin-top:4px;background:none;border:1px solid #374151;color:#9CA3AF;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.68rem;width:100%">✕ Limpiar mes</button>
```

- [ ] **Paso 2: `populateAllFilters` — registrar y construir el dropdown**

```js
// ANTES (línea 3003)
fillSel('costos-f-mes', (mesesTurno.length ? mesesTurno : meses).map(cap), 'Mes');
// DESPUÉS
registrarFiltroMes('costos-mes-dd', 'costos-mes-btn', SEL_MESES_COSTOS, renderCostos);
buildMesMultiDd('costos-mes-dd', mesesTurno.length ? mesesTurno : meses);
```

- [ ] **Paso 3: `filterCostos()` — usar el Set con fallback al global**

```js
// ANTES (líneas 3067-3076)
function filterCostos() {
  const m   = (getVal('costos-f-mes') || getVal('g-mes')).toLowerCase();
  const dias = SEL_DIAS_COSTOS.size ? SEL_DIAS_COSTOS : SEL_DIAS;
  return DATA.prod.filter(r => {
    const mes = r._mesTurno || r._mes || '';
    return (!m    || mes === m) &&
           (!dias.size || dias.has(r._diaTurno||'')) &&
           (!SEL_MAQ_COSTOS.size || SEL_MAQ_COSTOS.has(String(r._maq)));
  });
}
// DESPUÉS
function filterCostos() {
  const m   = SEL_MESES_COSTOS.size ? SEL_MESES_COSTOS : SEL_MESES;
  const dias = SEL_DIAS_COSTOS.size ? SEL_DIAS_COSTOS : SEL_DIAS;
  return DATA.prod.filter(r => {
    const mes = r._mesTurno || r._mes || '';
    return mesMatch(m, mes) &&
           (!dias.size || dias.has(r._diaTurno||'')) &&
           (!SEL_MAQ_COSTOS.size || SEL_MAQ_COSTOS.has(String(r._maq)));
  });
}
```

- [ ] **Paso 4: Verificar en el navegador**

Ir a la pestaña Costos, abrir el dropdown de mes, marcar 2 meses distintos, pulsar "Filtrar" y confirmar que la tabla de costos muestra la suma de ambos meses (comparar contra marcar cada mes por separado y sumar a mano). Pulsar "✕ Limpiar mes" y confirmar que vuelve a mostrar todos los meses.

- [ ] **Paso 5: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro de mes de Costos pasa a selección múltiple"
```

---

### Task 5: Filtro de mes de TIEMPOS DE PARO → múltiple

**Files:**
- Modify: `fvlco-app/index.html:601` (HTML — reemplazar `paro-fp-mes`)
- Modify: `fvlco-app/index.html:2997` (`populateAllFilters`)
- Modify: `fvlco-app/index.html:3078` (`filterParo`)
- Modify: `fvlco-app/index.html:2126` (`clearParoPanel`)
- Modify: `fvlco-app/index.html:6890-6891` (`exportPDFParos`)

**Interfaces:**
- Consumes: `SEL_MESES_PARO`, `SEL_MESES` (Task 2/3).

- [ ] **Paso 1: HTML**

```html
<!-- ANTES (líneas 599-604) -->
<div style="display:flex;flex-direction:column;gap:4px">
  <span style="font-size:.7rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em">Mes</span>
  <select id="paro-fp-mes" class="fp-select" style="min-width:130px" onchange="syncParoMes()">
    <option value="">Todo (Mes)</option>
  </select>
</div>
<!-- DESPUÉS -->
<div style="display:flex;flex-direction:column;gap:4px">
  <span style="font-size:.7rem;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em">Mes</span>
  <div class="multi-sel-wrap">
    <button class="multi-sel-btn" id="paro-mes-btn" onclick="toggleMesMultiDD('paro-mes-dd', event)" style="min-width:140px;text-align:left">Todos los meses ▾</button>
    <div class="multi-sel-dropdown" id="paro-mes-dd"></div>
  </div>
</div>
```

(`syncParoMes()`, el `onchange` original, solo llamaba a `renderParos()` — por eso `registrarFiltroMes` en el Paso 2 usa `renderParos` directo, sin necesidad de mantener `syncParoMes`.)

- [ ] **Paso 2: `populateAllFilters`**

```js
// ANTES (línea 2997)
fillSel('paro-fp-mes', meses.map(cap), 'Mes');
// DESPUÉS
registrarFiltroMes('paro-mes-dd', 'paro-mes-btn', SEL_MESES_PARO, renderParos);
buildMesMultiDd('paro-mes-dd', meses);
```

- [ ] **Paso 3: `filterParo()`**

```js
// ANTES (líneas 3077-3087)
function filterParo() {
  const m   = (getVal('paro-fp-mes')||getVal('g-mes')).toLowerCase();
  const dias = SEL_DIAS_PARO.size ? SEL_DIAS_PARO : SEL_DIAS;
  return DATA.prod.filter(r =>
    (!m        || (r._mesTurno || r._mes) === m) &&
    (!dias.size || dias.has(r._diaTurno||'')) &&
    (!SEL_MAQ_PARO.size || SEL_MAQ_PARO.has(String(r._maq))) &&
    (!SEL_RAZONES.size || SEL_RAZONES.has(String(r['RAZON PARO']||'').trim())) &&
    (!SEL_PROCESOS.size || SEL_PROCESOS.has(_getProc(r)))
  );
}
// DESPUÉS
function filterParo() {
  const m   = SEL_MESES_PARO.size ? SEL_MESES_PARO : SEL_MESES;
  const dias = SEL_DIAS_PARO.size ? SEL_DIAS_PARO : SEL_DIAS;
  return DATA.prod.filter(r =>
    (mesMatch(m, r._mesTurno || r._mes)) &&
    (!dias.size || dias.has(r._diaTurno||'')) &&
    (!SEL_MAQ_PARO.size || SEL_MAQ_PARO.has(String(r._maq))) &&
    (!SEL_RAZONES.size || SEL_RAZONES.has(String(r['RAZON PARO']||'').trim())) &&
    (!SEL_PROCESOS.size || SEL_PROCESOS.has(_getProc(r)))
  );
}
```

- [ ] **Paso 4: `clearParoPanel()`**

```js
// ANTES (línea 2126)
document.getElementById('paro-fp-mes').value='';
// DESPUÉS
clearMesMulti('paro-mes-dd');
```

- [ ] **Paso 5: `exportPDFParos()`**

```js
// ANTES (líneas 6890-6891)
const mesFiltro = getVal('paro-fp-mes') || getVal('g-mes');
const mesLabel  = mesFiltro ? cap(mesFiltro) : 'Todos los meses';
// DESPUÉS
const _mesEfectParo = SEL_MESES_PARO.size ? SEL_MESES_PARO : SEL_MESES;
const mesLabel  = _mesEfectParo.size ? [..._mesEfectParo].map(cap).join(', ') : 'Todos los meses';
```

- [ ] **Paso 6: Verificar en el navegador**

Ir a "Tiempos de Paro", marcar 2 meses, pulsar "Filtrar", confirmar que el Pareto y las tablas muestran datos combinados de ambos meses. Pulsar "Limpiar" y confirmar que se resetea el botón de mes a "Todos los meses ▾".

- [ ] **Paso 7: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro de mes de Tiempos de Paro pasa a selección múltiple"
```

---

### Task 6: Filtro de mes de NO CONFORMES → múltiple

**Files:**
- Modify: `fvlco-app/index.html:541-543` (HTML)
- Modify: `fvlco-app/index.html:3024` (`populateAllFilters`, variable `ncMeses`)
- Modify: `fvlco-app/index.html:3088-3098` (`filterNC`)
- Modify: `fvlco-app/index.html:2209` (`clearNcPanel`)

**Interfaces:**
- Consumes: `SEL_MESES_NC`, `SEL_MESES` (Task 2/3).

- [ ] **Paso 1: HTML**

```html
<!-- ANTES (líneas 541-543) -->
<select id="nc-fp-mes" class="fp-select" style="width:auto;margin-bottom:0" onchange="renderNC()">
  <option value="">Todos los meses</option>
</select>
<!-- DESPUÉS -->
<div class="multi-sel-wrap">
  <button class="multi-sel-btn" id="nc-mes-btn" onclick="toggleMesMultiDD('nc-mes-dd', event)">Todos los meses ▾</button>
  <div class="multi-sel-dropdown" id="nc-mes-dd"></div>
</div>
```

- [ ] **Paso 2: `populateAllFilters`** — buscar la línea `fillSel('nc-fp-mes', ncMeses.map(cap), 'Mes');` (cerca de la línea 3024) y reemplazar:

```js
// ANTES
fillSel('nc-fp-mes', ncMeses.map(cap), 'Mes');
// DESPUÉS
registrarFiltroMes('nc-mes-dd', 'nc-mes-btn', SEL_MESES_NC, renderNC);
buildMesMultiDd('nc-mes-dd', ncMeses);
```

- [ ] **Paso 3: `filterNC()`**

```js
// ANTES (líneas 3088-3098)
function filterNC() {
  const m   = (getVal('nc-fp-mes')||getVal('g-mes')).toLowerCase();
  // NC sheet has no DIA column — only use panel's own day filter (SEL_DIAS_NC)
  const dias = SEL_DIAS_NC;
  return DATA.nc.filter(r =>
    (!m    || String(r['MES ']||r['MES']||'').trim().toLowerCase() === m) &&
    (!dias.size || dias.has(r._diaTurno||'')) &&
    (!SEL_MAQ_NC.size || SEL_MAQ_NC.has(String(r._maq||''))) &&
    (!SEL_CAUSAS.size || SEL_CAUSAS.has((r['CAUSA']||'').trim()))
  );
}
// DESPUÉS
function filterNC() {
  const m   = SEL_MESES_NC.size ? SEL_MESES_NC : SEL_MESES;
  // NC sheet has no DIA column — only use panel's own day filter (SEL_DIAS_NC)
  const dias = SEL_DIAS_NC;
  return DATA.nc.filter(r =>
    (mesMatch(m, String(r['MES ']||r['MES']||'').trim())) &&
    (!dias.size || dias.has(r._diaTurno||'')) &&
    (!SEL_MAQ_NC.size || SEL_MAQ_NC.has(String(r._maq||''))) &&
    (!SEL_CAUSAS.size || SEL_CAUSAS.has((r['CAUSA']||'').trim()))
  );
}
```

- [ ] **Paso 4: `clearNcPanel()`**

```js
// ANTES (línea 2209)
document.getElementById('nc-fp-mes').value='';
// DESPUÉS
clearMesMulti('nc-mes-dd');
```

- [ ] **Paso 5: Verificar en el navegador**

Ir a "No Conformes", marcar 2 meses, confirmar que la tabla/gráficos muestran NC combinados de ambos meses. Pulsar "Limpiar" y confirmar reset completo (mes + días + máquina + causas, como ya hacía antes).

- [ ] **Paso 6: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro de mes de No Conformes pasa a selección múltiple"
```

---

### Task 7: Filtro de mes de PLAN VS REAL REFERENCIAS → múltiple

**Files:**
- Modify: `fvlco-app/index.html:521-525` (HTML)
- Modify: `fvlco-app/index.html:4069-4071` (`renderPlanRef`)
- Modify: `fvlco-app/index.html:6628-6629` (`exportPDF`, ya con placeholder desde Task 3 — completar aquí)
- Modify: `fvlco-app/index.html:527` (botón "Limpiar")

**Interfaces:**
- Consumes: `SEL_MESES_PREF`, `SEL_MESES` (Task 2/3), `MESES_CAP` (ya existente).

- [ ] **Paso 1: HTML**

```html
<!-- ANTES (líneas 521-527) -->
<select id="pref-f-mes"><option value="">Todos los meses</option>
  <option>Enero</option><option>Febrero</option><option>Marzo</option><option>Abril</option>
  <option>Mayo</option><option>Junio</option><option>Julio</option><option>Agosto</option>
  <option>Septiembre</option><option>Octubre</option><option>Noviembre</option><option>Diciembre</option>
</select>
<button class="btn-filter" onclick="renderPlanRef()">Filtrar</button>
<button class="btn-clear" onclick="clearFilters('pref');renderPlanRef()">Limpiar</button>
<!-- DESPUÉS -->
<div class="multi-sel-wrap">
  <button class="multi-sel-btn" id="pref-mes-btn" onclick="toggleMesMultiDD('pref-mes-dd', event)">Todos los meses ▾</button>
  <div class="multi-sel-dropdown" id="pref-mes-dd"></div>
</div>
<button class="btn-filter" onclick="renderPlanRef()">Filtrar</button>
<button class="btn-clear" onclick="clearMesMulti('pref-mes-dd')">Limpiar</button>
```

- [ ] **Paso 2: registrar + construir el dropdown** — agregar en `populateAllFilters()` (junto a los otros `registrarFiltroMes`, después del bloque de Costos):

```js
registrarFiltroMes('pref-mes-dd', 'pref-mes-btn', SEL_MESES_PREF, renderPlanRef);
buildMesMultiDd('pref-mes-dd', MESES_CAP);
```

- [ ] **Paso 3: `renderPlanRef()`**

```js
// ANTES (líneas 4069-4071)
function renderPlanRef() {
  const mesSel = getVal('pref-f-mes');
  const meses = mesSel ? [mesSel] : MESES_CAP;
// DESPUÉS
function renderPlanRef() {
  const _mesesEfect = SEL_MESES_PREF.size ? SEL_MESES_PREF : SEL_MESES;
  const meses = _mesesEfect.size ? [..._mesesEfect].map(cap) : MESES_CAP;
```

- [ ] **Paso 4: `exportPDF()` — confirmar que ya quedó correcto desde Task 3**

El código de las líneas 6628-6629 ya quedó en su forma final en Task 3 (Paso 5):
```js
const _mesesEfectPref = SEL_MESES_PREF.size ? SEL_MESES_PREF : SEL_MESES;
const mesesR2  = _mesesEfectPref.size ? [..._mesesEfectPref].map(cap) : MESES_CAP;
```
No requiere cambios adicionales — solo confirmar (con `grep` o abriendo el archivo) que sigue así.

- [ ] **Paso 5: Verificar en el navegador**

Ir a "Plan vs Real Referencias", marcar 2 meses, confirmar que "Planeado" y "Real" de la tabla son la SUMA de esos 2 meses (comparar contra marcar cada uno por separado). Pulsar "Limpiar" y confirmar que vuelve a mostrar el año completo (12 meses).

- [ ] **Paso 6: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro de mes de Plan vs Real Referencias pasa a selección múltiple"
```

---

### Task 8: Filtro de mes de REPORTE DIARIO → múltiple

**Files:**
- Modify: `fvlco-app/index.html:436-441` (HTML)
- Modify: `fvlco-app/index.html:5025-5062` (`_rdFilter`, `renderReporteDiario`)
- Modify: `fvlco-app/index.html:456` (botón "Limpiar")

**Interfaces:**
- Consumes: `SEL_MESES_RD`, `SEL_MESES` (Task 2/3).
- Produces: `_rdFilter(rows, mesSet, fDia, fTurno, selMaq)` — el parámetro 2 cambia de `string` a `Set`.

- [ ] **Paso 1: HTML**

```html
<!-- ANTES (líneas 436-441) -->
<select id="rd-f-mes">
  <option value="">Todos los meses</option>
  <option>Enero</option><option>Febrero</option><option>Marzo</option><option>Abril</option>
  <option>Mayo</option><option>Junio</option><option>Julio</option><option>Agosto</option>
  <option>Septiembre</option><option>Octubre</option><option>Noviembre</option><option>Diciembre</option>
</select>
<!-- DESPUÉS -->
<div class="multi-sel-wrap">
  <button class="multi-sel-btn" id="rd-mes-btn" onclick="toggleMesMultiDD('rd-mes-dd', event)">Todos los meses ▾</button>
  <div class="multi-sel-dropdown" id="rd-mes-dd"></div>
</div>
```

- [ ] **Paso 2: registrar + construir el dropdown** — agregar en `populateAllFilters()`:

```js
registrarFiltroMes('rd-mes-dd', 'rd-mes-btn', SEL_MESES_RD, renderReporteDiario);
buildMesMultiDd('rd-mes-dd', MESES_CAP);
```

- [ ] **Paso 3: `_rdFilter()` — cambiar el parámetro de string a Set**

```js
// ANTES (líneas 5025-5034)
function _rdFilter(rows, fMes, fDia, fTurno, selMaq) {
  const m = fMes.toLowerCase();
  return rows.filter(r => {
    const mes = (r._mesTurno || r._mes || '').toLowerCase();
    if (m     && mes                      !== m)     return false;
    if (fDia  && String(r._diaTurno)      !== fDia)  return false;
    if (fTurno && String(r._turno)        !== fTurno) return false;
    if (selMaq.size && !selMaq.has(String(r._maq)))  return false;
    return true;
  });
}
// DESPUÉS
function _rdFilter(rows, mesSet, fDia, fTurno, selMaq) {
  return rows.filter(r => {
    const mes = (r._mesTurno || r._mes || '');
    if (!mesMatch(mesSet, mes))           return false;
    if (fDia  && String(r._diaTurno)      !== fDia)  return false;
    if (fTurno && String(r._turno)        !== fTurno) return false;
    if (selMaq.size && !selMaq.has(String(r._maq)))  return false;
    return true;
  });
}
```

- [ ] **Paso 4: `renderReporteDiario()` — adaptar el default "último mes con datos" y la lectura del filtro**

```js
// ANTES (líneas 5037-5052)
function renderReporteDiario() {
  const _mesSelEl = document.getElementById('rd-f-mes');
  if (_mesSelEl && !_mesSelEl.dataset.def) {
    _mesSelEl.dataset.def = '1';
    const _last = (DATA.prod||[]).map(r=>r._fechaKey).filter(Boolean).sort().pop();
    const _lastRow = _last ? (DATA.prod||[]).find(r=>r._fechaKey===_last) : null;
    const _mn = _lastRow && _lastRow._mesTurno ? String(_lastRow._mesTurno).toLowerCase() : '';
    if (_mn) [..._mesSelEl.options].forEach(o => { if (o.text.toLowerCase() === _mn) _mesSelEl.value = o.value; });
  }
  const fMes   = (document.getElementById('rd-f-mes')?.value   || '').trim();
  const fDia   = (document.getElementById('rd-f-dia')?.value   || '').trim();
  const fTurno = (document.getElementById('rd-f-turno')?.value || '').trim();
// DESPUÉS
function renderReporteDiario() {
  if (!SEL_MESES_RD.size && !window._rdMesDefaulted) {
    window._rdMesDefaulted = true;
    const _last = (DATA.prod||[]).map(r=>r._fechaKey).filter(Boolean).sort().pop();
    const _lastRow = _last ? (DATA.prod||[]).find(r=>r._fechaKey===_last) : null;
    const _mn = _lastRow && _lastRow._mesTurno ? String(_lastRow._mesTurno).toLowerCase() : '';
    if (_mn) { SEL_MESES_RD.add(_mn); updateMesMultiBtn('rd-mes-dd'); buildMesMultiDd('rd-mes-dd', MESES_CAP); }
  }
  const fDia   = (document.getElementById('rd-f-dia')?.value   || '').trim();
  const fTurno = (document.getElementById('rd-f-turno')?.value || '').trim();
```

Y más abajo, en la llamada a `_rdFilter` (línea 5061):

```js
// ANTES
const rows = _rdFilter(DATA.prod, fMes, fDia, fTurno, SEL_MAQ_RD);
// DESPUÉS
const rows = _rdFilter(DATA.prod, SEL_MESES_RD, fDia, fTurno, SEL_MAQ_RD);
```

- [ ] **Paso 5: Botón "Limpiar"**

```html
<!-- ANTES (línea 456) -->
<button class="btn-clear" onclick="clearFilters('rd');clearRdMaqs();renderReporteDiario()">Limpiar</button>
<!-- DESPUÉS -->
<button class="btn-clear" onclick="clearFilters('rd');clearRdMaqs();clearMesMulti('rd-mes-dd')">Limpiar</button>
```

(Nota: `clearMesMulti` ya llama a `reg.onChange()` = `renderReporteDiario()`, así que no hace falta llamarlo de nuevo.)

- [ ] **Paso 6: Verificar en el navegador**

Recargar la pestaña "Reporte Diario" y confirmar que arranca mostrando el ÚLTIMO mes con datos (igual que antes). Marcar un segundo mes en el dropdown y confirmar que la tabla ahora incluye días de ambos meses. Pulsar "Limpiar" y confirmar que vuelve a "Todos los meses ▾" con todos los datos.

- [ ] **Paso 7: Commit**

```bash
cd fvlco-app && git add index.html && git commit -m "feat: filtro de mes de Reporte Diario pasa a selección múltiple"
```

---

### Task 9: Regresión final + deploy

**Files:** ninguno nuevo — solo verificación.

- [ ] **Paso 1: Repasar las 6 pestañas una por una** en `http://localhost:3001`, para cada una: (a) sin ningún mes marcado se ve igual que antes del cambio (todos los datos), (b) marcar 1 mes se comporta como el `<select>` de antes, (c) marcar 2+ meses suma/combina correctamente, (d) "Limpiar"/"✕" resetea el botón a "Todos los meses ▾".

- [ ] **Paso 2: Confirmar que "Tablero Plan" (`po-mes-sel`) sigue funcionando exactamente igual** (fuera de alcance, no debe haberse tocado) — abrir esa pestaña y confirmar que el selector de mes sigue siendo un `<select>` normal de un solo mes.

- [ ] **Paso 3: Push**

```bash
cd fvlco-app && git push
```

- [ ] **Paso 4: Confirmar el deploy** con `curl` contra `https://fvlco-app.vercel.app/index.html` buscando alguna cadena nueva (ej. `registrarFiltroMes`), igual que se hizo en los fixes anteriores de esta sesión.
