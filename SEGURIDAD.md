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

| Libro | ID |
|---|---|
| Producción / No Conformes / Ventas | `1o7bDsz…VAE8` |
| BD Productos / Pedidos (forecast) | `1vZTs6…0dy98` |
| Restricciones / Inventario MP | `1FJO1…ceI8` |
| Capacidad / PLANEACION | `1P9-3…bMHH6A` |
| Histórico de capacidad | `1sdoH…r6eOg` |

> La cuenta que ejecuta el proxy (`produccion@fylcosas.com`) debe **seguir
> teniendo acceso** a los cinco. Como es la dueña, ya lo tiene.

### 4. Probar
Abre `https://fvlco-app.vercel.app/` → debe pedir la clave. Con la clave
correcta, carga todo. Con clave incorrecta, no entra y no baja ningún dato.
Bonus: **Inventario MP y Restricciones ahora sí cargarán** (antes fallaban
porque ese libro ya era privado).

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
