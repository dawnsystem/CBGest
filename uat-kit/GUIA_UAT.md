# Guía UAT — C.B. Mediterránea Costa Brava

**Escenario:** Comunidad de Bienes ficticia para prueba de aceptación manual de CBGest.

| Campo | Valor |
|-------|-------|
| Denominación | **C.B. Mediterránea Costa Brava** |
| CIF / NIF | `E45678901` |
| Régimen | `ALQUILER_EXENTO` — Arrendamiento de inmuebles (sin IVA repercutido) |
| IBAN (referencia kit) | `ES91 2100 0418 4502 0005 1332` |
| Ejercicio 2027 | 01/01/2027 – 31/12/2027 (completo) |
| Ejercicio 2028 | 01/01/2028 – **17/07/2028** (parcial; solo importar datos del kit ≤ esa fecha) |

**Fuentes de datos del kit:**

- Datos maestros: [`master/`](./master/) — ver [`master/INDEX.json`](./master/INDEX.json)
- Casos borde 2027: [`2027/edges/edges-manifest.json`](./2027/edges/edges-manifest.json)
- Casos borde 2028: [`2028/edges/edges-manifest.json`](./2028/edges/edges-manifest.json)
- Saldos esperados: [`expected/balances-2027.md`](./expected/balances-2027.md), [`expected/balances-2028.md`](./expected/balances-2028.md)
- IRPF esperado (Dashboard): [`expected/irpf-2027.md`](./expected/irpf-2027.md), [`expected/irpf-2028.md`](./expected/irpf-2028.md)
- Plantilla de resultados: [`expected/checklist-resultados.md`](./expected/checklist-resultados.md)

**Volúmenes objetivo (2027 / 2028 parcial):**

| Artefacto | 2027 | 2028 (≤ 17/07) |
|-----------|-----:|---------------:|
| Facturas gasto | 72 | 40 |
| Facturas ingreso | 36 | 20 |
| Extractos XLSX | 12 | 7 |
| Reservas CSV | 60 | 30 |

---

## Precondiciones generales

1. **App arrancada:** desde la raíz del repo, `npm run dev` y abrir la URL que indique Vite (p. ej. `http://localhost:5173/#/`).
2. **Entorno limpio recomendado:** base Appwrite vacía o sin ejercicios previos; alternativamente, borrar todos los ejercicios en `#/fiscal-years` antes de empezar.
3. **API Gemini (opcional):** clave en `.env.local` como `VITE_GEMINI_API_KEY` para OCR de PDFs. Si el OCR falla o no hay clave, transcribir cada factura desde su ficha `.json` homónima (mismo nombre que el PDF).
4. **Navegación:** la app usa `HashRouter`; todas las rutas son `#/ruta` (ej. `#/invoices`, `#/reconciliation`).
5. **Selector de ejercicio:** antes de cada bloque anual, activar el ejercicio correcto en la barra superior / `#/fiscal-years`.
6. **Marcado de resultados:** anotar PASS/FAIL en [`expected/checklist-resultados.md`](./expected/checklist-resultados.md).

---

## Paso 0 — Precondiciones y reset

**Objetivo:** Partir de un entorno reproducible, sin datos residuales de otra CB.

**Dónde en la UI:** Sidebar → **Ejercicios** (`#/fiscal-years`); Sidebar → **Configuración** (`#/settings`).

**Acciones concretas:**

1. Comprobar que la app carga sin errores en consola (F12).
2. En `#/fiscal-years`, eliminar ejercicios existentes si los hay (icono papelera → confirmar escribiendo el año).
3. En `#/settings` → pestaña **Datos y Conexiones**, verificar modo Appwrite o archivo local según tu entorno de prueba.
4. Tener a mano la carpeta `uat-kit/` del repositorio clonado.

**Datos exactos:** Ninguno (solo limpieza).

**Criterio PASS:** No hay ejercicios contables previos (o están vacíos y se van a borrar); la app responde en `#/`.

**Criterio FAIL:** Ejercicios con facturas/asientos mezclados de otra prueba; errores de conexión que impiden guardar.

**Edges relevantes:** —

---

## Paso 1 — Configuración CB + 4 comuneros + taxInfo

**Objetivo:** Registrar la entidad, los cuatro comuneros con participaciones que suman 100 %, y el perfil fiscal distinto de cada uno.

**Dónde en la UI:**

- Sidebar → **Configuración** (`#/settings`) — pestañas **Datos Fiscales**, **Comuneros**, **Tasa Turística**
- Sidebar → **Dashboard** (`#/`) — widget **Estimación IRPF (Renta)**

**Acciones concretas:**

1. `#/settings` → **Datos Fiscales** → **Guardar Cambios**:
   - Denominación: `C.B. Mediterránea Costa Brava`
   - NIF: `E45678901`
   - Régimen: **Arrendamiento Inmuebles (Exento IVA)** (`ALQUILER_EXENTO`)
   - No actives obligación de IVA trimestral (el escenario es sin IVA repercutido)
2. Pestaña **Comuneros** → crear exactamente 4 filas (eliminar socios por defecto si los hay). Copiar de [`master/comuneros.json`](./master/comuneros.json):

   | Nombre | NIF | Participación % | Perfil (referencia) |
   |--------|-----|----------------:|---------------------|
   | Laura Vives Soler | `48172639J` | 35 | Soltera, 1 pagador |
   | Marc Puig Ferrer | `52918407F` | 30 | Casado, declaración conjunta, hijos |
   | Rosa Martí Capdevila | `73456128Q` | 20 | Nacida 1958, ascendiente >75 |
   | Jordi Serra Roca | `39284715W` | 15 | Discapacidad 33–65 %, 2 pagadores |

   Comprobar que la suma es **100 %** antes de guardar.

3. Pestaña **Tasa Turística** → activar gestión IEET (checkbox marcado). Valores de referencia en [`master/empresa.json`](./master/empresa.json): tasa 1 €, máx. 7 noches, edad mínima 17.

4. `#/` → en cada comunero, clic **+ Añadir Datos** → rellenar `taxInfo` según el bloque `taxInfo` de cada partner en [`master/comuneros.json`](./master/comuneros.json):

   - **Laura:** `birthYear` 1989, `SINGLE`, `otherWorkIncome` 28500, `numberOfPayers` 1, `pensionContributions` 600, etc.
   - **Marc:** `MARRIED`, `jointDeclaration` **true**, `childrenUnder3` 1, `childrenFrom3To25` 1, `otherWorkIncome` 42000, `pensionContributions` 1500.
   - **Rosa:** `birthYear` 1958, `otherActivitiesIncome` 8200, `ascendantsOver75` 1.
   - **Jordi:** `disabilityLevel` **LEVEL_33_65**, `numberOfPayers` 2, `secondPayerAmount` 2400, `otherWorkIncome` 31800.

5. Guardar cada formulario fiscal.

**Datos exactos:** [`master/empresa.json`](./master/empresa.json), [`master/comuneros.json`](./master/comuneros.json).

**Criterio PASS:** CB con CIF `E45678901` y régimen **Arrendamiento Inmuebles (ALQUILER_EXENTO)**; 4 comuneros con participaciones 35/30/20/15; los cuatro muestran datos fiscales en el Dashboard (no aparece «+ Añadir Datos»).

**Criterio FAIL:** Participaciones ≠ 100 %; perfiles fiscales idénticos o vacíos; régimen distinto de ALQUILER_EXENTO (p. ej. General con IVA).

**Edges relevantes:** —

---

## Paso 2 — Crear ejercicios 2027 y 2028

**Objetivo:** Disponer de dos ejercicios contables; el 2028 solo contendrá datos hasta el 17/07/2028.

**Dónde en la UI:** Sidebar → **Ejercicios** (`#/fiscal-years`).

**Acciones concretas:**

1. Clic **Crear Ejercicio** → año **2027** → notas: `UAT ejercicio completo` → confirmar.
2. Seleccionar **Ejercicio 2027** como activo (▶ Activo).
3. Clic **Crear Ejercicio** → año **2028** → notas: `UAT parcial — datos solo hasta 17/07/2028` → confirmar. El sistema copiará proveedores y apartamentos del 2027.
4. Volver a seleccionar **2027** antes del paso 3 del UAT.

**Datos exactos:** [`master/escenario.json`](./master/escenario.json) → `fiscalYears`.

**Criterio PASS:** Existen ejercicios 2027 y 2028, ambos abiertos; 2027 está activo para los pasos 3–10.

**Criterio FAIL:** Falta algún ejercicio; no se puede cambiar el ejercicio activo.

**Edges relevantes:** —

---

## Paso 3 — Alta de 6 apartamentos

**Objetivo:** Registrar los seis inmuebles del escenario (4 turísticos + 2 residenciales).

**Dónde en la UI:** Sidebar → **Apartamentos** (`#/apartments`).

**Acciones concretas:**

1. Con **ejercicio 2027** activo, clic **Nuevo Apartamento** por cada fila de [`master/apartamentos.json`](./master/apartamentos.json):

   | Código | Nombre | Tipo | Licencia HUT |
   |--------|--------|------|--------------|
   | `CB-A1` | Apartamento Aiguablava 1 | TOURIST | `HUTG-012345` |
   | `CB-A2` | Apartamento Aiguablava 2 | TOURIST | `HUTG-012346` |
   | `CB-B1` | Ático Begur Casc Antic | TOURIST | `HUTG-078901` |
   | `CB-C1` | Estudio Llafranc Port | TOURIST | `HUTG-055512` |
   | `CB-R1` | Vivienda Palafrugell Centro | RESIDENTIAL | (vacío) |
   | `CB-R2` | Vivienda Calella de Palafrugell | RESIDENTIAL | (vacío) |

2. Completar dirección, referencia catastral, superficie y ocupación máxima según el JSON maestro.

**Datos exactos:** [`master/apartamentos.json`](./master/apartamentos.json).

**Criterio PASS:** Listados exactamente 6 apartamentos con códigos `CB-A1` … `CB-R2`; los cuatro primeros son turísticos.

**Criterio FAIL:** Códigos distintos; tipos invertidos (residencial marcado como turístico).

**Edges relevantes:** — (base para EDGE-07, EDGE-08, EDGE-10 en reservas).

---

## Paso 4 — Alta de 8 proveedores

**Objetivo:** Cargar el catálogo de proveedores/plataforma del escenario.

**Dónde en la UI:** Sidebar → **Proveedores** (`#/suppliers`).

**Acciones concretas:**

1. Con **ejercicio 2027** activo, crear 8 proveedores desde [`master/proveedores.json`](./master/proveedores.json):

   | Nombre | NIF | Notas kit |
   |--------|-----|-----------|
   | Endesa Energía, S.A.U. | `A58923418` | IVA 21 % |
   | Aigües de Girona, S.A. | `B66781238` | IVA 10 % |
   | Neteja Costa Brava, S.L. | `B78345121` | Limpieza |
   | Mapfre Seguros Generales | `B61239877` | Exento IVA |
   | Gestoria Empordà, S.L. | `B70123450` | Gestoría |
   | Telefónica de España, S.A.U. | `A82018474` | Telecom |
   | Comunidad Prop. Edificio Sant Jordi | `H12345674` | Sin IVA |
   | Airbnb Payments UK Ltd | `N82659368` | Plataforma ingresos |

2. Rellenar dirección, email y teléfono del JSON; en **Notas** incluir la categoría PGC de referencia (`628`, `622`, `705`, etc.).

**Datos exactos:** [`master/proveedores.json`](./master/proveedores.json).

**Criterio PASS:** 8 proveedores visibles; NIFs validados sin error bloqueante.

**Criterio FAIL:** Faltan proveedores clave (Endesa, Aigües, Neteja, Airbnb).

**Edges relevantes:** — (proveedores usados en EDGE-01, EDGE-02, EDGE-06, EDGE-09).

---

## Paso 5 — Alta gastos recurrentes

**Objetivo:** Registrar los **7 gastos recurrentes** del escenario (solo gastos; los alquileres CB-R1/R2 van como facturas de ingreso en el Paso 6).

**Dónde en la UI:** Sidebar → **Gastos Fijos** (`#/recurring`).

**Acciones concretas:**

1. Con **ejercicio 2027** activo, crear cada ítem de [`master/gastos-recurrentes.json`](./master/gastos-recurrentes.json):

   | Nombre | Frecuencia | Importe est. | Cuenta | Proveedor |
   |--------|------------|-------------:|--------|-----------|
   | Electricidad Endesa | MONTHLY | 85 | 628 | Endesa |
   | Agua Aigües de Girona | BIMONTHLY | 45 | 628 | Aigües |
   | Limpieza turnos Neteja CB | MONTHLY | 320 | 622 | Neteja |
   | Seguro Mapfre multirriesgo | ANNUAL | 1280 | 625 | Mapfre (inicio 2027-03-15) |
   | Gestoría Empordà | MONTHLY | 95 | 623 | Gestoría |
   | Fibra Telefónica | MONTHLY | 49,9 | 626 | Telefónica |
   | Cuota comunidad Sant Jordi | MONTHLY | 180 | 622 | Comunidad |

2. Día del mes según `dayOfMonth` en el JSON.
3. **No** dar de alta «Ingreso alquiler CB-R*» aquí: inflarían el total de gastos. Esos importes llegan con las facturas `I-2027-*` / `I-2028-*`.

**Datos exactos:** [`master/gastos-recurrentes.json`](./master/gastos-recurrentes.json).

**Criterio PASS:** 7 gastos recurrentes activos; frecuencias e importes coinciden con el maestro.

**Criterio FAIL:** Más/menos de 7; ingresos 705 en la lista de gastos; frecuencia incorrecta en el seguro anual.

**Edges relevantes:** —

---

## Paso 6 — Carga facturas 2027 (PDF OCR o ficha JSON)

**Objetivo:** Registrar las **72 facturas de gasto** y **36 de ingreso** del ejercicio 2027.

**Dónde en la UI:** Sidebar → **Facturas** (`#/invoices`) — pestaña **Facturas** (no Extracto).

**Acciones concretas:**

1. Confirmar **ejercicio 2027** activo.
2. Subir PDFs por lotes desde:
   - `uat-kit/2027/facturas/gasto/*.pdf` (72 archivos)
   - `uat-kit/2027/facturas/ingreso/*.pdf` (36 archivos)
   - **Consejo:** lotes de ~10–15 PDFs. Si Gemini responde «cuota excedida», usa **Reintentar** / **Reintentar fallidos** en la bandeja (no hace falta volver a subir el archivo). Espera ~1 min entre oleadas si el límite por minuto es bajo.
3. Por cada PDF en cola: revisar campos extraídos → **Confirmar**. Si OCR falla, abrir el `.json` del mismo nombre (ej. `G-2027-058.json`) y transcribir manualmente: número, fecha, emisor, NIF, base, IVA, total, tipo EXPENSE/INCOME, proveedor.
   - **Ingresos de alquiler:** IVA 0 % (exento).
   - **Gastos de proveedores:** pueden llevar IVA 10/21 % aunque la CB esté en arrendamiento exento (es correcto: te facturan con IVA; el IRPF usa `totalAmount`).
4. **Verificación focal de edges** (buscar por número de factura en la lista):

   | Edge | Factura | Qué comprobar al cargar |
   |------|---------|-------------------------|
   | **EDGE-01** | `G-2027-058` | Fecha 15/11/2027, Neteja, total **242,00 €** (200+21 %), estado pendiente; **no** debe existir movimiento bancario asociado aún |
   | **EDGE-02** | `G-2027-032` | Gestoría, fecha factura **10/06/2027**, total **114,95 €**; pago bancario será en julio |
   | **EDGE-06** | `G-2027-022`, `G-2027-023` | Endesa **IVA 21 %** (total 122,66 €); Aigües **IVA 10 %** (total 57,15 €) |
   | **EDGE-04** | `I-2027-024` | Airbnb ingreso **12/08/2027**, neto **1842,35 €**, cuenta 705 |
   | **EDGE-09** | `G-2027-063` | Neteja **05/12/2027**, total **422,18 €** (se pagará en extracto ene-2028) |

**Datos exactos:** Carpetas `uat-kit/2027/facturas/gasto/` y `uat-kit/2027/facturas/ingreso/`; fichas JSON homónimas.

**Criterio PASS:** 108 facturas 2027 registradas; las cinco referencias edge anteriores con importes y tipos de IVA correctos.

**Criterio FAIL:** Conteo distinto de 108; `G-2027-058` marcada como pagada; IVA invertido en Endesa/Aigües; `I-2027-024` ≠ 1842,35 €.

**Edges relevantes:** **EDGE-01**, **EDGE-02**, **EDGE-04**, **EDGE-06**, **EDGE-09** (carga; pago 09 en paso 11).

---

## Paso 7 — Import extractos 2027 y conciliación

**Objetivo:** Importar los 12 extractos mensuales, conciliar movimientos con facturas/asientos y validar flujos contables A–E.

**Dónde en la UI:**

- Sidebar → **Facturas** (`#/invoices`) — pestaña **Extracto Bancario**
- Sidebar → **Conciliación Banco** (`#/reconciliation`)
- Referencia teórica: [`docs/GUIA_CONTABILIDAD.md`](../docs/GUIA_CONTABILIDAD.md) §3 (Flujos A–E)

**Acciones concretas:**

1. Con **ejercicio 2027** activo, en `#/invoices` → **Extracto Bancario**, importar en orden los 12 ficheros:

   ```
   uat-kit/2027/banco/extracto-2027-01.xlsx
   uat-kit/2027/banco/extracto-2027-02.xlsx
   …
   uat-kit/2027/banco/extracto-2027-12.xlsx
   ```

   Formato esperado: columnas `Fecha | Concepto | Importe` (cargos negativos).

2. Ir a `#/reconciliation`. Conciliar **todos** los movimientos salvo los casos edge indicados abajo.

3. Aplicar flujos según tipo de movimiento:

   | Flujo | Cuándo | Ejemplo en el kit |
   |-------|--------|-------------------|
   | **A** | Ingreso cobrado (Airbnb, alquileres) | `COBRO AIRBNB PAYMENTS`, `COBRO ALQUILER CB-R1` |
   | **B** | Gasto pagado al momento con factura previa | Pagos Endesa, Neteja con factura ya cargada |
   | **C** | Factura registrada antes que el pago | **EDGE-02** `G-2027-032`: factura 10/06, cargo `PAGO GESTORIA EMPORDÀ` **10/07/2027** −114,95 € |
   | **D** | Gasto sin factura | **EDGE-05**: `BIZUM FERRETERIA LOCAL` **03/05/2027** −38,20 € → asiento manual 622/572 |
   | **E** | Comisión bancaria | **EDGE-03**: `COMISION MANTENIMIENTO CUENTA` **28/03/2027** −6,50 € → 626/572 automático |

4. **EDGE-04:** Conciliar movimiento `AIRBNB PAYMENTS` **12/08/2027** +1842,35 € con factura `I-2027-024`.

5. **EDGE-01:** Confirmar que **no** existe movimiento bancario para `G-2027-058` (242 €). La factura debe quedar pendiente en cuenta 400.

6. Al terminar, comparar saldo final de cuenta 572 con [`expected/balances-2027.md`](./expected/balances-2027.md): **43.607,51 €** al 31/12/2027.

**Datos exactos:** `uat-kit/2027/banco/extracto-2027-MM.xlsx`; saldos en `expected/balances-2027.md`.

**Criterio PASS:** 12 extractos importados; conciliación casi completa; EDGE-02, 03, 04, 05 resueltos según tabla; EDGE-01 sin match bancario; saldo 572 ≈ 43.607,51 € (tolerancia ±0,05 €).

**Criterio FAIL:** `G-2027-058` conciliada por error; comisión o Bizum sin asiento; saldo 572 incoherente; `I-2027-024` sin emparejar con +1842,35 €.

**Edges relevantes:** **EDGE-01**, **EDGE-02**, **EDGE-03**, **EDGE-04**, **EDGE-05**.

---

## Paso 8 — Import reservas 2027

**Objetivo:** Importar las 60 reservas y validar tres casos borde de cancelación, IEET y niños.

**Dónde en la UI:** Sidebar → **Reservas** (`#/reservations`).

**Acciones concretas:**

1. Con **ejercicio 2027** activo, clic **Importar CSV**.
2. Seleccionar `uat-kit/2027/reservas/reservas-2027.csv` (separador `;`, sin cabecera).
3. Revisar vista previa → confirmar importación de **60** reservas.
4. Buscar y validar edges:

   | Edge | Localizador | Acción extra |
   |------|-------------|--------------|
   | **EDGE-07** | `BK-2027-CANCEL-01` | Estado **Cancelled**, `paidAmount` 0; no debe sumar ingresos |
   | **EDGE-08** | `BK-2027-IEET-08` | CB-A2, 4 adultos, 5 noches julio; IEET solo apartamento TOURIST |
   | **EDGE-10** | `BK-2027-CHILD-10` | Tras importar (2 adultos en CSV), **editar en UI** `numberOfChildren` = **2** |

5. Para EDGE-10: en la fila de la reserva → editar campo niños → guardar.

**Datos exactos:** `uat-kit/2027/reservas/reservas-2027.csv`; líneas de referencia en [`2027/edges/edges-manifest.json`](./2027/edges/edges-manifest.json).

**Criterio PASS:** 60 reservas; cancelada sin ingreso; IEET calculado para CB-A2 y 0 para CB-R1/CB-R2; BK-2027-CHILD-10 con 2 niños y IEET solo sobre adultos.

**Criterio FAIL:** Cancelada contabiliza ingreso; IEET en residencial; niños no editados en EDGE-10.

**Edges relevantes:** **EDGE-07**, **EDGE-08**, **EDGE-10**.

---

## Paso 9 — Libros / Mayor / Balance / deudas 400

**Objetivo:** Verificar integridad contable del ejercicio 2027 cerrado a nivel de revisión (sin cerrar el ejercicio en app).

**Dónde en la UI:**

- Sidebar → **Libro Diario** (`#/books`)
- Sidebar → **Libro Mayor** (`#/ledger`)
- Sidebar → **Balance Sumas/Saldos** (`#/trial-balance`)

**Acciones concretas:**

1. `#/books` — filtrar fechas `2027-01-01` … `2027-12-31`. Comprobar que hay asientos de facturas, liquidaciones y movimientos conciliados; ningún borrador sin cuadrar bloqueante.
2. `#/ledger` — cuenta **400** (Proveedores): debe quedar saldo pendiente **242,00 €** correspondiente a **G-2027-058** (EDGE-01).
3. `#/ledger` — cuenta **572** (Banco): saldo final **43.607,51 €**.
4. `#/trial-balance` — comprobar mensaje de cuadre: total Debe = total Haber (diferencia 0,00 €).

**Datos exactos:** [`expected/balances-2027.md`](./expected/balances-2027.md); factura `G-2027-058.json`.

**Criterio PASS:** Balance cuadrado; 400 = 242 € pendiente Neteja; 572 = 43.607,51 €.

**Criterio FAIL:** Descuadre en balance; 400 a cero con EDGE-01 sin pagar; saldo banco distinto del esperado.

**Edges relevantes:** **EDGE-01** (deuda 400).

---

## Paso 10 — Simulación IRPF 4 comuneros (caso arrendamiento)

**Objetivo:** Comprobar que la estimación IRPF del Dashboard usa el criterio `ALQUILER_EXENTO` (`totalAmount`) y refleja perfiles fiscales distintos.

**Dónde en la UI:** Sidebar → **Dashboard** (`#/`) — widget **Estimación IRPF (Renta)**; opcional `#/taxes` (texto «Atribución de Rentas»).

**Acciones concretas:**

1. Con **ejercicio 2027** activo y pasos 6–9 completados (hay resultado neto CB).
2. En `#/`, comprobar el resumen CB frente a [`expected/irpf-2027.md`](./expected/irpf-2027.md):
   - Total ingresos / gastos / **rendimiento neto** (±2 €).
3. Revisar las cuatro tarjetas de comuneros. Cada una debe mostrar:
   - **Rendimiento CB** (35 % / 30 % / 20 % / 15 % del resultado)
   - **Cuota estimada** (~X €) alineada con `irpf-2027.md` (±2 €)
   - Mensaje de obligación de declarar
4. Validar diferencias cualitativas esperadas:

   | Comunero | Señal esperada distintiva |
   |----------|---------------------------|
   | Laura | Renta trabajo 28.500 €; cuota intermedia; declaración obligada |
   | Marc | Declaración conjunta + mínimos por hijos → cuota distinta a Laura |
   | Rosa | Mínimo personal >65 + ascendiente >75 → cuota menor que activos similares |
   | Jordi | Discapacidad 33–65 % + 2.º pagador >1.500 € → tratamiento distinto |

5. Las **cuatro cuotas estimadas deben ser diferentes entre sí** y coincidir con la tabla de `irpf-2027.md`.
6. En `#/taxes`, subtítulo «Régimen de Atribución de Rentas (Alquileres)» (y pestaña IEET si hay aptos turísticos).

**Datos exactos:** `taxInfo` en [`master/comuneros.json`](./master/comuneros.json); cifras en [`expected/irpf-2027.md`](./expected/irpf-2027.md).

**Criterio PASS:** Rendimiento neto CB y 4 cuotas dentro de tolerancia ±2 €; cuotas todas distintas; mensajes de obligación coherentes.

**Criterio FAIL:** Régimen GENERAL (números no cuadran con `irpf-2027.md`); comunero sin datos fiscales; cuotas idénticas; NaN / 0 € con rendimiento positivo.

**Edges relevantes:** —

---

## Paso 11 — Bloque 2028 parcial + EDGE-09 + EDGE-11

**Objetivo:** Cargar solo datos 2028 hasta el 17/07/2028, pagar en banco la factura 2027 pendiente EDGE-09 y verificar el corte duro del kit.

**Dónde en la UI:**

- `#/fiscal-years` → activar **Ejercicio 2028**
- `#/invoices`, `#/reconciliation`, `#/reservations`

**Acciones concretas:**

1. Seleccionar ejercicio **2028**.
2. **Facturas 2028:** cargar PDFs/JSON de:
   - `uat-kit/2028/facturas/gasto/` (40 gastos)
   - `uat-kit/2028/facturas/ingreso/` (20 ingresos)
   - Verificar que **ningún** documento tiene fecha **posterior a 2028-07-17**.
3. **Extractos 2028:** importar solo:
   ```
   uat-kit/2028/banco/extracto-2028-01.xlsx
   …
   uat-kit/2028/banco/extracto-2028-07.xlsx
   ```
   (7 ficheros; julio truncado al 17/07).
4. **EDGE-09:** En extracto **enero 2028**, localizar cargo `PAGO NETEJA COSTA BRAVA` **2028-01-08** por **−422,18 €** → conciliar con factura **`G-2027-063`** (fecha factura dic-2027). Debe cerrar la deuda cross-year.
5. Conciliar el resto de movimientos 2028.
6. **Reservas 2028:** importar `uat-kit/2028/reservas/reservas-2028.csv` (30 filas; ninguna checkout > 2028-07-17).
7. **EDGE-11:** Confirmar que el kit 2028 no contiene:
   - Facturas con fecha > 2028-07-17
   - Movimientos en extracto-2028-07 posteriores al 17/07
   - Reservas con fin de estancia > 2028-07-17

8. Saldo final 572 esperado: **57.208,43 €** ([`expected/balances-2028.md`](./expected/balances-2028.md)).

**Datos exactos:** Carpetas `uat-kit/2028/`; `G-2027-063.json`; manifiesto [`2028/edges/edges-manifest.json`](./2028/edges/edges-manifest.json).

**Criterio PASS:** Volúmenes 40+20 facturas, 7 extractos, 30 reservas; EDGE-09 conciliado; sin datos > 17/07/2028; saldo 572 ≈ 57.208,43 €.

**Criterio FAIL:** Documentos fuera de rango; G-2027-063 sigue pendiente tras ene-2028; extracto agosto 2028 importado (no existe en kit).

**Edges relevantes:** **EDGE-09**, **EDGE-11**.

---

## Paso 12 — Matriz go / no-go global

**Objetivo:** Decisión final de aceptación del release.

**Dónde en la UI:** Revisión transversal + [`expected/checklist-resultados.md`](./expected/checklist-resultados.md).

**Acciones concretas:**

1. Completar la checklist imprimible (pasos 0–12 + tabla de edges).
2. Aplicar reglas:

   | Resultado | Condición |
   |-----------|-----------|
   | **GO** | Pasos 0–11 = PASS; **todos** los edges EDGE-01…11 = PASS; sin bugs CRÍTICOS abiertos |
   | **NO-GO** | Cualquier paso FAIL; cualquier edge FAIL; descuadre contable > 0,05 €; pérdida de datos |

3. Archivar evidencias: capturas de balance, conciliación EDGE-01/09, IEET EDGE-08, IRPF Dashboard.

**Criterio PASS (GO):** Cumple la tabla anterior.

**Criterio FAIL (NO-GO):** No cumple algún criterio bloqueante.

**Edges relevantes:** **EDGE-01** … **EDGE-11** (todos).

---

## Tabla resumen de edges (EDGE-01 … EDGE-11)

| ID | Referencia factura / reserva / movimiento | Expectativa |
|----|-------------------------------------------|-------------|
| **EDGE-01** | Factura `G-2027-058` (Neteja 15/11/2027, 242 €) | Sin movimiento bancario; pendiente en 400; no PAID |
| **EDGE-02** | Factura `G-2027-032` (Gestoría 10/06/2027, 114,95 €) | Match con cargo banco **10/07/2027**; flujo C |
| **EDGE-03** | Mov. **28/03/2027** `COMISION MANTENIMIENTO CUENTA` −6,50 € | Asiento 626/572; flujo E; sin PDF |
| **EDGE-04** | Ingreso `I-2027-024` (12/08/2027, **1842,35 €**) + mov. `AIRBNB PAYMENTS` | Match plataforma; cuenta 705; flujo A |
| **EDGE-05** | Mov. **03/05/2027** `BIZUM FERRETERIA LOCAL` −38,20 € | Asiento manual 622/572; flujo D; sin factura |
| **EDGE-06** | Facturas `G-2027-022` (IVA **21 %**) y `G-2027-023` (IVA **10 %**) | Tipos de IVA correctos en ficha y asiento |
| **EDGE-07** | Reserva `BK-2027-CANCEL-01` (CB-A1, sept 2027, Cancelled) | No suma ingresos ni IEET |
| **EDGE-08** | Reserva `BK-2027-IEET-08` (CB-A2, 4 adultos, 5 noches julio) | IEET > 0 en TOURIST; RESIDENTIAL = 0 |
| **EDGE-09** | Factura `G-2027-063` (dic 2027, 422,18 €) pagada **08/01/2028** | Conciliación cross-year; deuda cerrada en 2028 |
| **EDGE-10** | Reserva `BK-2027-CHILD-10` (2 adultos + **2 niños** editados en UI) | IEET solo sobre adultos; niños no generan tasa |
| **EDGE-11** | Kit 2028 completo | Ningún documento con fecha **> 2028-07-17** |

---

## Referencia rápida de rutas (Sidebar → hash)

| Sidebar | Hash |
|---------|------|
| Dashboard | `#/` |
| Facturas | `#/invoices` |
| Proveedores | `#/suppliers` |
| Apartamentos | `#/apartments` |
| Reservas | `#/reservations` |
| Gastos Fijos | `#/recurring` |
| Libro Diario | `#/books` |
| Libro Mayor | `#/ledger` |
| Balance Sumas/Saldos | `#/trial-balance` |
| Conciliación Banco | `#/reconciliation` |
| Modelos Fiscales | `#/taxes` |
| Ejercicios | `#/fiscal-years` |
| Configuración | `#/settings` |

---

*Documento UAT ficticio — datos no válidos fiscalmente. Versión kit: ver `master/INDEX.json`.*
