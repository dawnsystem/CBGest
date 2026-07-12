# 🧪 Guion de Testing Operativo por Rondas — CBGest

_Versión: 1.0 | Última actualización: 2026-07-12_

Este documento es el **guion ejecutable** para validar CBGest al cierre de cada tanda de cambios.
Está organizado en tres rondas de profundidad creciente.
Abre la consola del navegador (F12) en todas las rondas para detectar errores JS silenciosos.

---

## 📋 Preparación mínima previa (común a todas las rondas)

Antes de empezar cualquier ronda, verificar que el entorno tiene:

| # | Requisito | Cómo comprobarlo |
|---|-----------|-----------------|
| P1 | Al menos 2 ejercicios fiscales (uno abierto, uno cerrado) | Menú Ejercicios |
| P2 | 2 apartamentos, 2 proveedores, 2 socios (participaciones suman 100%) | Config > Socios |
| P3 | Facturas en estados `PENDING`, `PROCESSED` y `PAID` | Módulo Facturas |
| P4 | Transacciones bancarias importadas | Módulo Conciliación |
| P5 | Consola del navegador abierta (F12) | Sin errores en carga inicial |

---

## 🟢 Ronda 1 — Smoke Test (≈ 30 minutos)

> **Objetivo:** detectar roturas críticas que impiden el uso básico de la aplicación.
> Ejecutar tras cada despliegue o merge a `main`.

### S1 · Autenticación

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| S1.1 | Login con credenciales válidas | Accede al dashboard sin errores en consola | |
| S1.2 | Logout desde el header | Redirige a login, sin datos residuales de sesión | |

### S2 · Ejercicio activo

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| S2.1 | Cambiar ejercicio activo desde el selector del header | Todas las vistas recalculan datos según el ejercicio seleccionado | |
| S2.2 | Seleccionar el ejercicio **cerrado** | Aparece banner de solo lectura; botones de alta/edición desactivados | |

### S3 · Módulos principales (navegación rápida)

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| S3.1 | Ir a Proveedores → listar | Lista carga sin error | |
| S3.2 | Ir a Apartamentos → listar | Lista carga sin error | |
| S3.3 | Ir a Facturas → listar | Lista carga sin error | |
| S3.4 | Ir a Conciliación → listar transacciones | Lista carga sin error | |
| S3.5 | Ir a Dashboard | KPIs se muestran con cifras (no cero ni NaN) | |
| S3.6 | Ir a Modelos Fiscales | Panel IRPF visible y sin errores de consola | |

### S4 · Señales de fallo rápidas

| ID | Señal de alerta | ✅ sin fallo / ❌ fallo detectado |
|----|-----------------|----------------------------------|
| S4.1 | Cambiar ejercicio **sí** cambia los datos mostrados | |
| S4.2 | Con ejercicio cerrado, los botones CRUD están deshabilitados | |
| S4.3 | No hay errores `Failed to fetch` sin manejar en consola | |
| S4.4 | Facturas `PENDING` **no** aparecen en cifras fiscales | |
| S4.5 | Balance muestra DEBE == HABER (diferencia < 0,01 €) | |

---

## 🟡 Ronda 2 — Regresión Funcional (≈ 2 horas)

> **Objetivo:** verificar que todos los flujos de trabajo principales funcionan correctamente.
> Ejecutar tras cada PR de funcionalidad o corrección de bug.

### R1 · Autenticación y sesión

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R1.1 | Login correcto | Accede al dashboard | |
| R1.2 | Registro con password < 8 caracteres | Validación bloquea el envío | |
| R1.3 | Registro con datos válidos | Cuenta creada e inicio de sesión correcto | |
| R1.4 | Logout | Vuelve a login sin datos residuales | |

### R2 · Ejercicios fiscales

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R2.1 | Crear nuevo ejercicio | Éxito + copia de apartamentos/proveedores del ejercicio anterior | |
| R2.2 | Cambiar ejercicio desde header | Todas las vistas recalculan según el ejercicio activo | |
| R2.3 | Cerrar ejercicio activo | Banner solo lectura + acciones CRUD bloqueadas | |
| R2.4 | Reabrir ejercicio cerrado | Altas/ediciones/borrados vuelven a estar habilitados | |

### R3 · Configuración

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R3.1 | Guardar cambios en nombre/NIF | Persiste y se refleja en Modelos Fiscales | |
| R3.2 | Añadir socio, editar participación, verificar suma 100% | Persistencia correcta; sin incoherencia en porcentajes | |
| R3.3 | Activar/desactivar tasa turística (IEET) y cambiar tarifa | Panel IEET respeta la configuración guardada | |

### R4 · Proveedores

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R4.1 | Crear proveedor con datos válidos | Aparece en listado | |
| R4.2 | Editar proveedor existente | Cambios persisten | |
| R4.3 | Eliminar proveedor | Desaparece del listado | |
| R4.4 | Crear con NIF inválido | Bloqueo o aviso visual | |
| R4.5 | Buscar por nombre / NIF / email | Filtrado correcto | |

### R5 · Apartamentos

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R5.1 | CRUD completo (alta/edición/borrado) | Operaciones correctas | |
| R5.2 | Marcar apartamento inactivo | Toggle funciona; filtro "mostrar inactivos" oculta/muestra | |
| R5.3 | Guardar superficie ≤ 0 o capacidad fuera de rango | Warning visible y no guarda | |

### R6 · Reservas

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R6.1 | Importar CSV válido | Preview correcto + resumen creadas/actualizadas/errores | |
| R6.2 | Reimportar mismo nº de reserva con datos cambiados | Actualiza el registro sin duplicar | |
| R6.3 | CSV con nombre de apartamento ambiguo | Enlace manual disponible para asignación | |
| R6.4 | Toggle "mostrar canceladas" | Canceladas ocultas por defecto; excluidas de totales | |
| R6.5 | Verificar campo huésped | Sólo iniciales visibles (GDPR) | |

### R7 · Gastos recurrentes

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R7.1 | Alta/edición/baja lógica (activo/inactivo) | Totales mensuales y anuales coherentes | |
| R7.2 | Cambiar frecuencia (Monthly/Quarterly/Annual…) | Cálculo anual correcto por multiplicador | |
| R7.3 | Cambiar día de mes y frecuencia | Próxima fecha coherente sin desfases | |

### R8 · Facturas

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R8.1 | Subir PDF/imagen (drag&drop o file picker) | Entra en cola y pasa a revisión IA | |
| R8.2 | Editar campos detectados por IA | Permite corregir y confirmar | |
| R8.3 | Forzar NIF emisor inválido | Aviso + necesidad de forzar aceptación para continuar | |
| R8.4 | Cambiar estado PENDING → PROCESSED → PAID | Impacto contable/fiscal coherente en cada transición | |
| R8.5 | Abrir documento adjunto | Visor funciona sin errores | |
| R8.6 | Eliminar factura | Confirmación + desaparece del listado | |

### R9 · Contabilidad

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R9.1 | Ver Libro Diario | Líneas cuadradas (DEBE = HABER); filtros por fecha/cuenta funcionan | |
| R9.2 | Crear asiento manual | Validaciones + persistencia | |
| R9.3 | Editar y eliminar asiento manual | Operaciones correctas | |
| R9.4 | Libro Mayor — seleccionar cuenta | Movimientos y saldos arrastrados correctos | |
| R9.5 | Balance de sumas y saldos | Total DEBE == Total HABER | |

### R10 · Conciliación bancaria

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R10.1 | Importar movimientos PDF (IA) | Movimientos en estado `PENDING` | |
| R10.2 | Importar movimientos XLSX (mapeo columnas) | Movimientos correctamente mapeados | |
| R10.3 | Casar movimiento con factura existente | Estado `MATCHED`, asiento de cierre generado | |
| R10.4 | Crear asiento desde transacción sin factura | Asiento con cuentas 6xx/7xx contra 572 (sin IVA) | |
| R10.5 | Transacción tipo comisión/interés | Usa cuentas 626/769 según signo | |

### R11 · Modelos fiscales e IRPF

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R11.1 | Ver Modelos Fiscales con régimen IRPF | Modo IRPF visible; 303 no aplicable | |
| R11.2 | Cambiar ejercicio activo | Ingresos/gastos/rendimiento cambian al periodo correcto | |
| R11.3 | Añadir factura `PENDING` | **No** entra en cálculos fiscales | |
| R11.4 | Generar Modelo 184 (PDF) | Año correcto, reparto por socios correcto, sin IVA | |
| R11.5 | Descargar certificados de socios | Importe por participación correcto por socio | |
| R11.6 | Panel IEET (si configurado) | Visible solo con régimen + config + apartamento turístico | |

### R12 · Dashboard y analítica

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R12.1 | Ver KPIs con ejercicio activo | Consistentes con módulo fiscal/contable | |
| R12.2 | Cambiar ejercicio activo | Serie temporal del gráfico cambia (no fija al año actual del sistema) | |
| R12.3 | Rentabilidad por apartamento | Coherente con reservas + facturas + gastos recurrentes | |
| R12.4 | Proyecciones y gastos por apartamento | Sumatorios y filtros coherentes | |

### R13 · Búsqueda global y notificaciones

| ID | Acción | Resultado esperado | ✅/❌ |
|----|--------|--------------------|-------|
| R13.1 | Buscar término que existe en factura/proveedor/asiento | Resultados por secciones con enlace al módulo | |
| R13.2 | Buscar término inexistente | Mensaje "sin coincidencias" | |
| R13.3 | Crear/editar/eliminar entidad → abrir campana | Notificación generada; contador de no leídas correcto | |
| R13.4 | Marcar todas como leídas / borrar individual | Estados actualizados sin duplicados | |

---

## 🔴 Ronda 3 — Auditoría Completa (≈ 1 jornada)

> **Objetivo:** cobertura exhaustiva incluyendo edge cases, seguridad de datos y E2E completo.
> Ejecutar antes de cada release, cierre de ejercicio fiscal real o cambio de infraestructura.

### A1 · Datos y aislamiento entre ejercicios

| ID | Caso | Resultado esperado | ✅/❌ |
|----|------|--------------------|-------|
| A1.1 | Cambiar ejercicio → verificar que **ningún** dato de otro ejercicio aparece en ningún módulo | Aislamiento completo | |
| A1.2 | Con ejercicio cerrado intentar alta/edición vía URL directa | La operación es rechazada o ignorada | |
| A1.3 | Migración legacy | Resumen con contadores por colección; sin errores | |

### A2 · Integridad contable

| ID | Caso | Resultado esperado | ✅/❌ |
|----|------|--------------------|-------|
| A2.1 | Revisar cada asiento automático (factura, conciliación) | DEBE = HABER en cada asiento | |
| A2.2 | Balance global tras todas las operaciones | Total DEBE == Total HABER sin ningún descuadre | |
| A2.3 | Cuentas 472/477 (IVA) ausentes | No aparece ninguna línea con esas cuentas en el libro | |
| A2.4 | Trazabilidad completa factura ↔ transacción ↔ asiento | Cada conciliación tiene los 3 enlaces visibles | |

### A3 · Validaciones y seguridad de datos

| ID | Caso | Resultado esperado | ✅/❌ |
|----|------|--------------------|-------|
| A3.1 | NIF con todos los tipos: NIF, CIF, NIE válidos e inválidos | Validación correcta en todos los casos | |
| A3.2 | Campos de texto con caracteres especiales (<, >, ", ') | No se rompe ningún formulario ni vista | |
| A3.3 | Subir archivo no PDF/imagen en facturas | Rechazo claro con mensaje | |
| A3.4 | Verificar que no se almacena nombre completo de huésped | Solo iniciales en todas las vistas | |
| A3.5 | Socios con participaciones que no suman 100% | Aviso/bloqueo de guardado | |

### A4 · Rendimiento y UX bajo carga

| ID | Caso | Resultado esperado | ✅/❌ |
|----|------|--------------------|-------|
| A4.1 | Importar CSV con > 100 reservas | Sin bloqueo de UI; progreso visible | |
| A4.2 | Importar XLSX bancario con > 200 filas | Sin bloqueo; mapeo de columnas correcto | |
| A4.3 | Generar PDF Modelo 184 con 2+ socios | PDF generado sin errores de consola | |
| A4.4 | Abrir Libro Diario con > 500 asientos | Listado paginado o virtualizado; sin freeze | |

### A5 · Timeout y estado de conexión

| ID | Caso | Resultado esperado | ✅/❌ |
|----|------|--------------------|-------|
| A5.1 | Dejar sesión inactiva 15 min | Cierre automático con mensaje de sesión expirada | |
| A5.2 | Simular pérdida de conexión (DevTools > Offline) | Banner/indicador visible; sin crash; operaciones en cola | |
| A5.3 | Reconectar tras offline | Estado de conexión vuelve a normal; datos sincronizados | |

### A6 · Prueba E2E maestra (flujo completo)

Ejecutar de forma secuencial sin saltarse ningún paso:

| Paso | Acción | ✅/❌ |
|------|--------|-------|
| E1 | Login con credenciales válidas | |
| E2 | Crear ejercicio fiscal nuevo | |
| E3 | Añadir 1 proveedor + 1 apartamento en el nuevo ejercicio | |
| E4 | Importar reservas desde CSV | |
| E5 | Crear 1 gasto recurrente mensual | |
| E6 | Subir factura de ingreso + factura de gasto; confirmar revisión IA en ambas | |
| E7 | Revisar asientos generados en Libro Diario (cuadrados) | |
| E8 | Importar extracto bancario y conciliar al menos 1 transacción con factura | |
| E9 | Revisar Dashboard: KPIs coinciden con datos introducidos | |
| E10 | Revisar Rentabilidad por apartamento: refleja reservas + facturas | |
| E11 | Generar Modelo 184 PDF: año correcto, socios correctos | |
| E12 | Descargar certificado de al menos 1 socio: importe correcto | |
| E13 | Validar Balance: DEBE == HABER | |
| E14 | Cerrar ejercicio: banner solo lectura activado | |
| E15 | Cambiar al ejercicio anterior y confirmar que sus datos NO han cambiado | |

### A7 · Checklist de señales de fallo crítico

Al finalizar la ronda, marcar cada punto como **sin fallo** (✅) o **fallo detectado** (❌):

| # | Señal de fallo |  |
|---|----------------|--|
| F1 | Cambiar ejercicio **no** cambia los datos mostrados | |
| F2 | Se puede editar/crear/borrar con ejercicio cerrado | |
| F3 | Facturas `PENDING` entran en cálculos de fiscalidad | |
| F4 | Aparecen cuentas 472/477 (IVA) en cualquier asiento del flujo IRPF | |
| F5 | Balance no cuadra (DEBE ≠ HABER) | |
| F6 | Conciliación no deja trazabilidad factura ↔ transacción ↔ asiento | |
| F7 | Dashboard y Modelos Fiscales muestran cifras incompatibles entre sí | |
| F8 | Errores en consola al generar PDFs | |
| F9 | Errores en consola al importar CSV o XLSX | |
| F10 | Nombre completo de huésped visible en cualquier vista | |

---

## 📊 Registro de ejecuciones

| Fecha | Versión / Commit | Ronda | Ejecutado por | Resultado | Issues abiertos |
|-------|-----------------|-------|---------------|-----------|-----------------|
| | | | | | |

---

## 🔗 Referencias

- [`TESTING.md`](./TESTING.md) — Guía de tests unitarios/integración automatizados
- [`BITACORA_MAESTRA.md`](./BITACORA_MAESTRA.md) — Fuente de verdad del proyecto
- [`PLAN_DE_MEJORAS.md`](./PLAN_DE_MEJORAS.md) — Backlog de mejoras pendientes
