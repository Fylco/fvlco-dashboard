# Plan de Trabajo — Dashboard FVLco

> Documento guía del proyecto. Se actualiza al cerrar/agregar tareas.
> Metodología transversal: **(1) primero todos los DISEÑOS (con datos de muestra),
> (2) luego las CONEXIONES** a las hojas reales. Limpieza de datos en origen +
> protecciones en el dashboard, **en paralelo**.

---

## 1. Objetivos estratégicos
- **O1. Cumplir los pedidos programados del mes** (entregas a tiempo a los clientes).
- **O2. Optimizar la rentabilidad** de la programación de la planta.
- **O3. Planear capacidad y personal** de forma óptima (días hábiles, rotación, fatiga).
- **O4. Controlar materias primas** (ingreso vs consumo) para evitar quiebres.

## 2. Metas (medibles)
- ↑ % Cumplimiento del Plan y OTIF (entregas a tiempo).
- ↑ OEE de planta; ↓ pérdidas por rendimiento/paros.
- ↓ Costo de fabricación y mermas (NC, pitorro/rama).
- ↓ Horas extra y fatiga del personal (rotación cada 15 días).
- 0 quiebres de materia prima.
- Detectar a tiempo cuándo la **capacidad < demanda** → sugerir maquila y fecha de inicio.

## 3. Usuarios
Producción (planta) y Gerencia.

---

## 4. Fases y tareas

### Fase 0 — Base de datos confiable (en curso, transversal)
- [ ] Cerrar bugs de captura/parseo (cavidades vacías, ciclos espurios, MES/encoding, decimales).
- [ ] Estandarizar la captura en los Sheets (formulario/columnas limpias).
- [ ] Validar que el OEE del dashboard cuadre con el Excel de planta, día por día.
- [ ] Completar `MOLDE_CAV` con las cavidades reales de cada máquina (hasta que la col AO se llene).

### Fase 1 — Pedidos (punto 7)
Archivo **ENTRADAS FYLCO**, pestaña **REGISTRO PEDIDOS COMPLETO**.
Columnas: fecha registro, cliente, producto, color, cantidad, valor unitario.
- [ ] **Diseño** de la pestaña "Pedidos" (tabla + filtros por fecha, cliente, producto).
- [ ] **Conexión** al CSV publicado de esa hoja; filtrado por fecha.
- [ ] KPIs: total pedidos, valor, unidades por cliente/producto.

### Fase 2 — Capacidad, horas y estrategia de producción (puntos 2, 3, 6, 8)
- [ ] **Análisis de horas requeridas** para cumplir el plan (por máquina, ciclo, cavidades).
- [ ] **Días hábiles** del mes como insumo de la planeación.
- [ ] **Capacidad instalada vs demanda**: si capacidad < demanda → **sugerir maquila** y **sugerir día de inicio** de producción para llegar a tiempo.
- [ ] Estrategia de producción que maximice entregas (priorización de pedidos por fecha/cliente/margen).

### Fase 3 — Costos, horas extra y lote mínimo (puntos 8, 9, 10)
- [ ] **Análisis de costos de fabricación** (por producto/máquina; tarifa/hora, MP).
- [ ] **Costo de horas extra** cuando se requiera programar personal extra.
- [ ] **Lote mínimo de producción** usando costos + pestaña **Restricciones** del archivo **Programación Planta**.
- [ ] Indicador de **rentabilidad por producto** (precio − costo fabricación).

### Fase 4 — Programación de personal (puntos 4, 5, 13)
- [ ] **Programación de personal**: rota cada 15 días y **rota de puesto** para evitar fatiga.
- [ ] **Tapadoras**: modelo de 2 personas (una **revisa** = clave para calidad, otra **alimenta**).
- [ ] **Conjunto ensamblado 15mm**: la **válvula 15mm terra** + **tapa terra 15mm** (blanca/color) actúan como **cliente interno**; cuando el cliente pide válvula con tapas de color, programar también las **tapadoras** y suplir válvula + tapa para el ensamble.

### Fase 5 — Inventario de materias primas (punto 11)
- [ ] Control de MP: **ingreso vs consumo**, registro en pestañas del archivo **Programación Planta**.
- [ ] **Solicitud de MP** según consumo proyectado del plan.
- [ ] Alerta de **MP por agotarse**.

---

## 5. Sugerencias adicionales (punto 12)
- **Tablero "Programación sugerida"**: combina pedidos + capacidad + días hábiles → propone el plan óptimo del mes y fechas de inicio por producto.
- **Alertas inteligentes**: pedidos en riesgo de no cumplirse, MP por agotarse, máquinas con OEE bajo.
- **Simulador "¿qué pasa si?"**: agregar un turno, una máquina, horas extra o maquila → ver impacto en cumplimiento y costo.
- **Priorización de pedidos** automática (por fecha de entrega, margen o cliente).
- **Historial/auditoría** de cambios del plan (quién cambió qué y cuándo).

---

## 6. Insumos pendientes del usuario (para las conexiones)
- URL/gid publicado de **ENTRADAS FYLCO → REGISTRO PEDIDOS COMPLETO**.
- URL/gid de **Programación Planta** y sus pestañas **Restricciones** e **Inventario MP**.
- Tarifas por hora de máquina y recargo de hora extra.
- Días hábiles del mes (o regla de cálculo).
- Cavidades reales de cada máquina (para `MOLDE_CAV`).

---

## 7. Orden sugerido de ejecución
1. Fase 0 (calidad de datos) — base de todo.
2. Fase 1 (Pedidos) — insumo de la demanda.
3. Fase 2 (Capacidad/horas) — núcleo de la planeación.
4. Fase 3 (Costos/lote mínimo) — rentabilidad.
5. Fase 4 (Personal) y Fase 5 (Inventario) — soporte operativo.
6. Sugerencias (Fase 6) — valor agregado.

> Recordatorio de método: en cada pestaña nueva → **diseño primero (datos de muestra), luego conexión**.
