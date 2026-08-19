# 🔒 FVLco — Protección de accesos (guía de despliegue)

## Qué cambió y por qué

**Antes:** el dashboard bajaba los Google Sheets directamente desde el navegador,
así que los sheets tenían que ser **públicos**. Cualquiera en internet podía
descargar producción, clientes y costos con solo la URL. La "contraseña"
(`fvlco2026`) estaba escrita en el HTML → no protegía nada.

**Ahora:** un **proxy autenticado** (Apps Script `Proxy.gs`) lee los sheets
**del lado del servidor** y solo entrega datos si el navegador envía la clave
correcta. La clave vive en el servidor (Propiedades del Script), **no** en el
HTML. Los sheets pasan a ser **privados**. Toda la app queda tras un login.

```
Navegador ──(clave)──▶  Proxy.gs (valida clave, lee como dueño)  ──▶  Sheets PRIVADOS
   ▲                                                                        │
   └──────────────────────────  CSV (solo si la clave es correcta)  ◀───────┘
```

---

## Pasos para activarlo (una sola vez, ~15 min)

### 1. Desplegar el backend `Proxy.gs`
1. Entra a <https://script.google.com> con la cuenta **dueña de los sheets**
   (la que tiene acceso a todos: `produccion@fylcosas.com`).
2. **Nuevo proyecto** → borra el código de ejemplo → pega el contenido de
   [`Proxy.gs`](Proxy.gs). Ponle nombre, ej. "FVLco Proxy".
3. **Configuración del proyecto** (⚙ engranaje a la izquierda) →
   baja a **Propiedades del script** → **Agregar propiedad de script**:
   - Propiedad: `FVLCO_PASSWORD`
   - Valor: *la clave que elijas* (usa una larga, ej. 16+ caracteres).
   - Guardar.
4. Botón **Implementar** → **Nueva implementación** → engranaje → **Aplicación web**:
   - **Descripción:** libre.
   - **Ejecutar como:** *Yo* (`produccion@fylcosas.com`).
   - **Quién tiene acceso:** *Cualquier usuario*.
   - **Implementar**. La 1ª vez pedirá **autorizar permisos** → acéptalos
     (necesita leer tus Sheets). Es tu propia cuenta autorizando tu propio script.
5. Copia la **URL del Web App** (termina en `/exec`).
6. **Prueba rápida:** abre esa URL en el navegador. Debe mostrar
   `FVLco proxy OK` (y **nada** de datos). Si lo ves, el deploy quedó bien.

### 2. Conectar el dashboard
Abre [`index.html`](index.html), busca `API_URL_DEFAULT` (cerca del inicio del
`<script>`) y pega la URL:
```js
const API_URL_DEFAULT = 'https://script.google.com/macros/s/AKfy..../exec';
```
Sube el cambio a Vercel (git push / redeploy).

### 3. Hacer PRIVADOS los sheets
En **cada** uno de estos libros: **Compartir** → cambiar "Cualquiera con el
enlace" a **Restringido**, y si estaba "Publicado en la web" (Archivo →
Compartir → Publicar en la Web) → **Dejar de publicar**.

Son los mismos 7 IDs de `ALLOWED_IDS` en [`Proxy.gs`](Proxy.gs) — el proxy solo
sirve esos, así no se convierte en un relay abierto a toda la cuenta.

| Libro | ID | Estado 2026-08-19 |
|---|---|---|
| Producción / No Conformes / Ventas / Maquilas | `1o7bDszJpE4t0xL6AdKWhJ9MEanmz5n7xTQlKBDxVAE8` | público |
| BD Productos / Pedidos | `1vZTs6xImawkKwiWEPmFaY4y6LrVRKrMaAHKuCz0dy98` | ya privado |
| Restricciones / Inventario MP | `1FJO1LSIdNIfZhvAg4NVBJKG2Q90lenEB49xXMrWceI8` | ya privado |
| RECURSOS (máquinas / personal) | `1P9-3iiJMyXQRqV22dL5TJ8n6L1lcgNM5WejOPMbHH6A` | — |
| PROGRAMACION 2026 | `1dYm44LKn6TQm2fWLY5ZG9_kI_GMGwWcTm7Wq_wDrKs8` | público |
| PROGRAMACION 2027 | `1hFfhndWwoEoTdEjYoafYRveXFHpRgb_BB04SZGaX6Zk` | — |
| PROGRAMACION 2028 | `1_mupUu7TEqC5HNEdhfO5bVSCCyXPyW_FJKnGdRZaNbQ` | — |

> La cuenta que ejecuta el proxy (`produccion@fylcosas.com`) debe **seguir
> teniendo acceso** a todos. Como es la dueña, ya lo tiene.

> **Al crear PROGRAMACION 2029 y siguientes:** agregar el ID en `PROG_FILES`
> (index.html) **y** en `ALLOWED_IDS` (Proxy.gs), o el proxy lo rechazará.

### 4. Probar
Abre `https://fvlco-app.vercel.app/` → debe pedir la clave. Con la clave
correcta, carga todo. Con clave incorrecta, no entra y no baja ningún dato.
Bonus: **Inventario MP y Restricciones ahora sí cargarán** (antes fallaban
porque ese libro ya era privado).

---

## Detalles que no son obvios

**`action:'gids'`.** Los meses de PROGRAMACION 20XX son pestañas y su `gid`
cambia cada año, así que el dashboard tiene que descubrirlos. En modo directo
los lee de `/spreadsheets/d/<ID>/htmlview`; **ese truco no funciona a través
del proxy**, porque `/htmlview` no es el CSV de una hoja y `fetchSheetCsv()`
devolvería la primera pestaña → mapa vacío → Capacidad y el KPI "Turnos Req."
del Tablero Plan se quedan sin datos. Por eso `Proxy.gs` expone `listGids(id)`
y `progGids()` la usa cuando hay proxy configurado. Si algún día se toca una
de las dos, hay que tocar la otra.

**Velocidad.** El proxy lee con `getDataRange().getDisplayValues()`. La hoja de
producción son ~3,1 MB de CSV, así que la primera carga con proxy es
notablemente más lenta que el `export?format=csv` directo. Si molesta, el
siguiente paso es cachear en el backend (`CacheService`, troceando en claves de
100 KB) o limitar el rango leído a las columnas que el dashboard usa.

---

## Cómo cambiar la clave después
Solo edita `FVLCO_PASSWORD` en **Propiedades del script**. **No** hace falta
volver a implementar. Los usuarios tendrán que ingresar la nueva clave.

## Si algo falla (rollback)
- Deja `API_URL_DEFAULT = ''` en `index.html` y redeploy → vuelve al modo
  directo (requiere que los sheets sean públicos otra vez). Úsalo solo como
  emergencia temporal.
- Errores comunes:
  - *"Sin conexión con el servidor de datos"* → revisa que la URL `/exec` esté
    bien pegada y que el deploy sea "Cualquier usuario".
  - Una sección vacía → ese sheet no está en `ALLOWED_IDS` del `Proxy.gs`, o su
    cuenta no tiene acceso.

---

## Notas / pendientes

- **`FV_CSV` (forecast):** se repuntó del URL "publicado" (que morirá al hacer
  privado el sheet) al libro real `1vZTs6…` gid `999968463`. ⚠ **Verifica** que
  ese gid sea la hoja de pedidos correcta cuando pruebes el Forecast.
- **`SYNC_TOKEN = 'fvlco2026'`** (sincronización de Recursos con otro Apps
  Script) sigue en el HTML. Es un secreto de menor impacto (escribe máquinas/
  personal). Conviene rotarlo también, pero requiere tocar ese otro script
  aparte; queda fuera de este cambio.
- **Secreto compartido:** todos entran con la misma clave. Quien la tenga ve
  todo. Si necesitas control por persona (login con cuenta Google del dominio),
  es otro alcance (requiere cambiar arquitectura/hosting).
- **XSS:** el dashboard inyecta texto de los sheets con `innerHTML` sin escapar.
  Riesgo bajo (editores confiables), pero conviene escapar a futuro.
- **Rota `fvlco2026`:** esa cadena quedó en el historial de git y estuvo pública;
  no la reuses como `FVLCO_PASSWORD`.
