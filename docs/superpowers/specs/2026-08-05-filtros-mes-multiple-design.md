# Filtros de mes → selección múltiple + tamaño de filtros + hover

## Contexto
El dashboard (`fvlco-app/index.html`) tiene filtros de mes de selección única (`<select>`) en 7 lugares. El filtro de "días" ya tiene selección múltiple (botón + dropdown de checkboxes) en varias de esas mismas pestañas. El usuario pide que los filtros de mes tengan el mismo comportamiento múltiple, que los controles de filtro (mes, día, máquina, etc.) se vean más grandes en todas las pestañas, y que se resalten al pasar el mouse.

## Alcance — 7 filtros de mes
| Pestaña | Select actual | Variable Set nueva |
|---|---|---|
| Informe de Cierre (global) | `g-mes` | `SEL_MESES` |
| Reporte Diario | `rd-f-mes` | `SEL_MESES_RD` |
| Plan vs Real Referencias | `pref-f-mes` | `SEL_MESES_PREF` |
| No Conformes | `nc-fp-mes` | `SEL_MESES_NC` |
| Tiempos de Paro | `paro-fp-mes` | `SEL_MESES_PARO` |
| Costos | `costos-f-mes` | `SEL_MESES_COSTOS` |
| Tablero Plan | `po-mes-sel` | `SEL_MESES_PO` |

El filtro global (`g-mes`) sigue siendo el respaldo de Costos/Paro/No Conformes cuando esos no tienen mes propio elegido — mismo comportamiento actual, ahora con conjuntos: si el conjunto local está vacío, se usa el conjunto global.

## Diseño técnico

**Helper genérico (nuevo), no un refactor de lo existente:**
```js
// Crea un filtro de mes de selección múltiple: botón + dropdown de checkboxes.
// selSet: el Set que guarda los meses elegidos. btnId/ddId: ids del botón y dropdown
// en el HTML. onChange: callback para re-renderizar la pestaña.
function crearFiltroMesMultiple(btnId, ddId, selSet, meses, onChange) { ... }
```
Se usa en las 7 ubicaciones. Sigue el mismo patrón visual/interacción que `toggleDiaDD` (botón `.multi-sel-btn` + `.multi-sel-dropdown` con checkboxes), pero es una función reutilizable en vez de 7 copias — el código de "día" existente NO se toca ni se re-factoriza (fuera de alcance).

**Cambio de HTML:** los 7 `<select>` de mes se reemplazan por `<div class="multi-sel-wrap"><button class="multi-sel-btn" id="X-mes-btn">Todos los meses ▾</button><div class="multi-sel-dropdown" id="X-mes-dd"></div></div>`, igual estructura que los filtros de día existentes.

**Cambio de lectura de filtro:** cada sitio que hoy hace `getVal('rd-f-mes')` (comparación exacta de string) pasa a comparar contra el Set: `!SEL_MESES_RD.size || SEL_MESES_RD.has(r._mes)`. Los pull sites del filtro global (`gMes()`, y los `getVal('g-mes')` en costos/paro/nc/otif/maquilas/planRef) se actualizan igual, con fallback: usar el Set local si no está vacío, si no el Set global.

**Etiqueta del botón:** igual que "día" — "Todos los meses ▾" cuando vacío, "N mes(es) ▾" cuando hay selección, clase `.active` para resaltar.

## Tamaño de filtros (todas las pestañas a la vez)
Las clases compartidas `.multi-sel-btn`, `.fp-select`, `.btn-filter`, `.btn-clear` se agrandan (fuente ~.73–.78rem → ~.85rem; padding más generoso). Los 4 selects de mes que hoy usan estilos sueltos (`g-mes`, `rd-f-mes`, `pref-f-mes`, `po-mes-sel`) — ya no aplica tras el cambio, pasan a ser botones `.multi-sel-btn` igual que los demás, así que automáticamente quedan del mismo tamaño.

## Hover
Nueva regla `.multi-sel-btn:hover, .fp-select:hover` → fondo violeta tenue `rgba(139,92,246,.15)` + borde `#8B5CF6` (mismo tono que `.active`, pero como fondo suave en vez de borde sólido, para distinguir "hover" de "ya seleccionado").

## Fuera de alcance
- No se toca el filtro de "días" existente (ya funciona, no se pidió cambiarlo).
- No se agranda nada en la vista móvil (ya tiene su propio tamaño forzado a 16px vía media query).
- No se cambia la lógica de negocio de ningún cálculo — solo la UI del filtro y cómo se lee el mes seleccionado (de string único a Set).

## Riesgo principal
Son ~7 puntos de lectura de filtro a actualizar (uno por pestaña) más el fallback del global en varios sitios (`gMes()`, y los `getVal('g-mes')` sueltos en costos/paro/nc/otif/maquilas). Se hace pestaña por pestaña y se verifica cada una en el navegador antes de pasar a la siguiente, para no romper una pestaña que ya funciona mientras se arregla otra.
