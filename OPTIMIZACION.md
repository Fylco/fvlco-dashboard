# Protocolo de sesión eficiente — Dashboard FVLco

Pega el bloque de **CONTEXTO FIJO** al inicio de cada sesión nueva con Claude.
Objetivo: ahorrar 40-55% de tokens evitando re-lecturas, polling de deploys,
re-descargas y recapitulaciones.

---

## CONTEXTO FIJO (copiar/pegar al iniciar)

```
CONTEXTO FIJO (no re-explicar):
- Archivo: fvlco-app/index.html (un solo archivo HTML+JS, ~210KB).
- Deploy automático a https://fvlco-app.vercel.app/ al hacer push a main.
- NO verifiques cada deploy con polling (until curl/sleep); commit+push y seguimos.
- NO re-leas el archivo completo; edita por bloque con Edit/old_string único.
- Refresco del navegador: ya sé que es Ctrl+Shift+R; no lo repitas.
- Responde conciso, sin recapitular lo hecho en turnos anteriores.

TAREAS DE ESTA SESIÓN (todas juntas):
1. ...
2. ...
3. ...
```

---

## Reglas que NUNCA deben repetirse en las respuestas
1. La URL de producción y cómo se despliega.
2. "Refresca con Ctrl+Shift+R".
3. Qué hace cada parser (`pNum` / `pDec` / `_modeBy`) — ya está documentado en el código.
4. Resúmenes de "lo que hicimos antes".

## Protocolo de 3 pasos por tarea
1. Editar + commit + push (sin narrar cada paso).
2. Una línea de resultado: "Hecho: X. Verifica al refrescar."
3. El usuario confirma o corrige. Si hay varios ajustes, darlos JUNTOS en un mensaje.

## Hábitos que ahorran tokens
- **Agrupar pedidos relacionados** en un solo mensaje (cada mensaje recarga todo el contexto).
- **Dar reglas/fórmulas completas una vez** (no redefinir por partes).
- **Decidir el formato final antes de implementar** (evitar reversiones vertical↔horizontal, K/M↔completo).
- **Referencias cortas** ("como el día 18") en vez de re-pegar tablas/capturas.
- **Validar datos una sola vez** (descargar CSV 1 vez, no por cada cálculo).

---

## Referencia técnica del dashboard (para no re-investigar)

**Fórmulas OEE (Reporte Compacto):**
- OEE máquina = Disponibilidad × Rendimiento × Calidad (NO usar columna `OEE FINAL` del sheet, viene corrupta).
- Disponibilidad = TRT ÷ (TRT + paros); TRT = (producidas ÷ cav_real × ciclo_real) ÷ 60 [min].
- Rendimiento = producidas ÷ teóricas (tope 100%); Teóricas = (horas×3600 ÷ ciclo_estándar) × cav_teóricas.
- Calidad = producidas ÷ (producidas + NC).
- OEE total por Unidades = promedio simple de OEE de máquinas.
- OEE total por Tiempo = Σ(TRT × OEE) ÷ Σ TRT.

**Parsers / datos:**
- `pDec` re-parsea columnas CICLO / PESO / KILO preservando decimal (pNum los corrompía).
- `_modeBy` = valor más frecuente (moda) de las cajas; evita el ciclo espurio de la 1ª caja del turno.
- Cavidades: `_cavTeorOf` → CAV.TEORICAS (col AO) si >0, si no `MOLDE_CAV` override (`{'3':8}`), si no fallback.
- Turnos: 1/2/3 = 8h; 4 = diurno 12h; 5 = nocturno 12h. Dedup: T4 subsume T1/T2, T5 subsume T3. Tope paro: 480/720 min por turno.
- NC: cruce por MÁQUINA (col B) + fecha (col A). Outliers de PESO descartados (mediana×20, mín 500 kg).
- Robustez: `fetchCSV` reintenta; `loadOptional` (solo Producción es crítica); `_maq`/`_mes` siempre String.

**Fuentes de datos:**
- Producción/NC/Plan/Ventas/Accid: spreadsheet `2PACX-...` publicado, `pub?gid=...&output=csv`.
- Maquilas: spreadsheet APARTE (`1o7bDsz...`) vía `gviz/tq?tqx=out:csv&gid=...` (CORS ok, sin redirección).

**Pendientes conocidos:**
- Moldes de cavidades de las demás máquinas (solo Maq 3 = 8 cargado en `MOLDE_CAV`).
- Cuando la columna AO (CAV.TEORICAS) tenga el dato real, manda sobre el override.
- Ciclos estándar los corrige el usuario manualmente en el sheet.
