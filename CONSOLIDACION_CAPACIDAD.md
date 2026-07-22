# Consolidación de datos — Pestaña Capacidad

Fecha: 2026-07-22
Estado: aprobado, en implementación

## Problema

La pestaña Capacidad del dashboard leía tres Google Sheets distintos (PROGRAMACIÓN 20XX,
la pestaña PLANEACIÓN del archivo "Restricciones", y la hoja HISTORICO_CAPACIDAD), con
fórmulas de eficiencia distintas entre bloques (85% fijo vs. rendimiento real por producto),
un histórico que se llenaba a mano y quedaba con filas incompletas, y un cálculo de turnos
disponibles que ignoraba los festivos. Auditoría completa documentada en la conversación
del 2026-07-22 (no versionada aparte).

## Decisión

PROGRAMACIÓN 20XX (2026/2027/2028) pasa a ser la única fuente para todo lo de capacidad.
Alcance: solo capacidad (cavidades, ciclo, rendimiento, requerido, turnos, costos de
maquila). Personal (RECURSOS) e Inventario de MP quedan fuera de este cambio, tal como
están hoy.

## Qué cambia

1. **Nueva pestaña fija `COSTOS`** dentro de cada archivo PROGRAMACIÓN 20XX (no cambia mes
   a mes), columnas `Producto | Costo Fylco | Costo Maquila | Observación`. Ya creada en
   PROGRAMACIÓN 2026 (gid 456831736) y verificada contra la tabla original de PLANEACIÓN.
2. **Deja de leerse para capacidad:** la pestaña PLANEACIÓN (archivo "Restricciones",
   `1P9-3iiJMyXQRqV22dL5TJ8n6L1lcgNM5WejOPMbHH6A`) y la hoja HISTORICO_CAPACIDAD
   (`13jI4d9NhsDbHLj4nYV4NlAXToglTrC1wsC7AKGPFlFs`). El código deja de tener referencias a
   `CAP_SID` / `CAP_HIST_SID` para este panel.
3. **Turnos disponibles reales:** en vez de estimar por día de semana (domingo=0,
   sábado=2, entre semana=3), se toma la fila real del calendario de PROGRAMACIÓN (turnos
   ya conciliados con festivos y ajustes manuales) día por día.
4. **Histórico automático:** se arma recorriendo las pestañas de meses anteriores dentro
   de los archivos PROGRAMACIÓN, sin hoja aparte. Si un mes no tiene pestaña, no aparece.
5. **Proyección de saturación (funcionalidad nueva):** por máquina, recorre el mes día por
   día acumulando turnos requeridos vs. disponibles y marca el primer día en que la máquina
   se atrasa. Vista de línea de tiempo diaria por máquina.
6. **Costo de maquila** en la alerta de sobrecarga: se lee de la nueva pestaña `COSTOS`.
7. **Corrección de bug:** `loadCapacidadMensual()` no se disparaba si "Capacidad" era la
   primera pestaña de Plan Operativo abierta en la sesión (rama `else` de `showSection`).
8. **Corrección de seguridad:** `Proxy.gs` → `ALLOWED_IDS` no incluía los 3 archivos
   PROGRAMACIÓN ni el ID correcto del histórico. Se actualiza para que el proxy autenticado
   no rompa este panel cuando se active.

## Fuera de alcance

- Personal (RECURSOS), Inventario de MP, Pedidos: sin cambios.
- Migrar el histórico ya acumulado en HISTORICO_CAPACIDAD (queda como archivo, sin uso).
