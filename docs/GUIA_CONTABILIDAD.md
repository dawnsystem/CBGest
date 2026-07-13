# 📒 Guía de Contabilidad para CBGest

> **Para quién es este documento:** Esta guía está escrita para el propietario/gestor de la CB sin formación contable específica. Explica cómo funciona la contabilidad dentro de CBGest usando ejemplos reales de los apartamentos turísticos.

_Versión: 1.0 — Fecha: 2026-07-13_

---

## 📚 Índice

1. [¿Qué es la Partida Doble y por qué me importa?](#1-qué-es-la-partida-doble-y-por-qué-me-importa)
2. [Las cuentas más usadas en tu CB](#2-las-cuentas-más-usadas-en-tu-cb)
3. [Los 5 flujos de trabajo principales](#3-los-5-flujos-de-trabajo-principales)
4. [Cómo funciona la Conciliación Bancaria](#4-cómo-funciona-la-conciliación-bancaria)
5. [Ejemplos prácticos con cifras reales](#5-ejemplos-prácticos-con-cifras-reales)
6. [Preguntas frecuentes](#6-preguntas-frecuentes)
7. [Reporte de estado del módulo contable](#7-reporte-de-estado-del-módulo-contable)
8. [Plan de mejoras identificadas](#8-plan-de-mejoras-identificadas)

---

## 1. ¿Qué es la Partida Doble y por qué me importa?

La **partida doble** es la regla de oro de la contabilidad moderna. Su principio es simple:

> **Cada movimiento económico afecta a dos cuentas: una recibe (DEBE) y otra entrega (HABER). El importe siempre es el mismo en ambas.**

### Analogía sencilla

Imagina que tienes dos bolsillos:
- **DEBE** → "de dónde viene" o "qué recibe"
- **HABER** → "adónde va" o "qué entrega"

Cuando pagas 200€ de limpieza en efectivo:
```
DEBE  622 (Gasto de limpieza)   200€   ← el gasto existe
HABER 572 (Tu cuenta bancaria)  200€   ← el dinero salió del banco
```

La regla es que **DEBE siempre = HABER**. Si no cuadran, el asiento está mal.

### Por qué esto es útil para ti

- Te permite ver exactamente **en qué se gasta** el dinero de los apartamentos
- Detectas fácilmente si algo **no está registrado** (el balance no cuadra)
- Puedes obtener el **resultado del ejercicio** restando gastos de ingresos
- Es la base para el **modelo 184 de IRPF** de la CB

---

## 2. Las cuentas más usadas en tu CB

> **Nota:** No hay IVA en esta contabilidad. CBGest usa contabilidad simplificada solo para IRPF.

### Cuentas de Ingreso (grupo 7 — siempre van en el HABER)

| Código | Nombre | Cuándo se usa |
|--------|--------|---------------|
| `705` | Prestaciones de servicios | Cobros de alquiler turístico (Airbnb, Booking, etc.) |
| `769` | Otros ingresos financieros | Intereses que te paga el banco |
| `700` | Ventas de mercaderías | Ingresos varios no clasificados |

### Cuentas de Gasto (grupo 6 — siempre van en el DEBE)

| Código | Nombre | Cuándo se usa |
|--------|--------|---------------|
| `621` | Arrendamientos y cánones | Alquiler de local/nave donde opera la CB |
| `622` | Reparaciones y conservación | Fontanero, electricista, pintor, limpieza |
| `623` | Servicios de profesionales | Gestoría, abogado, consultor |
| `625` | Primas de seguros | Seguro multirriesgo del apartamento |
| `626` | Servicios bancarios | Comisiones y mantenimiento de cuenta |
| `628` | Suministros | Luz, agua, gas, internet |
| `629` | Otros servicios | Plataformas (Airbnb fee, etc.), servicios varios |

### Cuentas de Tesorería (grupo 57)

| Código | Nombre | Cuándo se usa |
|--------|--------|---------------|
| `572` | Bancos c/c euros | Movimientos de tu cuenta bancaria principal |
| `570` | Caja | Pagos/cobros en efectivo |

### Cuentas de Deudas y Créditos (grupo 4 — las "de tránsito")

| Código | Nombre | Cuándo se usa | Naturaleza |
|--------|--------|---------------|------------|
| `400` | Proveedores | Factura recibida pero AÚN NO pagada | Acreedora (saldo en HABER) |
| `430` | Clientes | Servicio prestado pero AÚN NO cobrado | Deudora (saldo en DEBE) |
| `410` | Acreedores varios | Gastos sin factura pendientes de pago | Acreedora |

> **Truco:** Las cuentas `400` y `430` son las que te permiten hacer "asientos incompletos". Cuando no tienes el pago bancario todavía, usas estas cuentas como contrapartida temporal. Cuando llega el pago, la conciliación "cierra" estas cuentas contra la cuenta 572.

---

## 3. Los 5 flujos de trabajo principales

### Flujo A: Ingreso cobrado al momento (lo más habitual con Airbnb)

Airbnb te transfiere 850€ por una reserva.

```
Paso 1 — Importas el extracto bancario (ya tienes el movimiento en el banco)
Paso 2 — En Conciliación, el movimiento aparece como "Importado" (indigo)
Paso 3 — Haz clic en "Crear Asiento"
Resultado automático:
  DEBE  572 (Banco)                 850€
  HABER 705 (Prestaciones serv.)    850€
Paso 4 (opcional) — Si el sistema puso 705 pero quieres poner el apartamento
         específico, ve a Libros Contables y edita la descripción
```

**Estado final:** Asiento reconciliado. La cuenta 572 aumenta 850€.

---

### Flujo B: Gasto pagado al momento (limpieza, fontanero)

Pagas 120€ a la empresa de limpieza desde el banco.

```
Opción 1 (sin factura previa):
  Paso 1 — Importas extracto bancario
  Paso 2 — Conciliación → "Crear Asiento"
  Resultado automático:
    DEBE  629 (Otros servicios)     120€
    HABER 572 (Banco)               120€
  Paso 3 — Edita la cuenta 629 por 622 (Reparaciones) si corresponde

Opción 2 (con factura registrada primero):
  Paso 1 — Registras factura en CBGest (estado: PENDING)
  Sistema crea:
    DEBE  622 (Reparaciones)        120€
    HABER 400 (Proveedores)         120€  ← deuda pendiente
  Paso 2 — Importas extracto bancario
  Paso 3 — Conciliación: casas la transacción con el asiento de factura
  Sistema crea asiento de liquidación:
    DEBE  400 (Proveedores)         120€  ← deuda saldada
    HABER 572 (Banco)               120€  ← dinero salió
```

**Estado final:** Factura marcada como conciliada. La cuenta 400 queda a cero.

---

### Flujo C: Gasto que llegarás a pagar más adelante (factura a 30 días)

El fontanero te manda factura de 350€ pero aún no te la cobra.

```
Paso 1 — Registras la factura en CBGest (estado: PENDING)
Sistema crea:
  DEBE  622 (Reparaciones)        350€
  HABER 400 (Proveedores)         350€  ← deuda

Estado: El gasto ya está en tu contabilidad, pero 400 tiene un saldo pendiente.

[30 días después]
Paso 2 — Recibes el cargo bancario, importas el extracto
Paso 3 — Conciliación: casas la transacción con el asiento de la factura
Sistema crea asiento de liquidación:
  DEBE  400 (Proveedores)         350€  ← cierra la deuda
  HABER 572 (Banco)               350€  ← pago registrado
```

**Estado final:** La cuenta 400 queda saldada, el gasto lleva 2 asientos perfectamente enlazados.

---

### Flujo D: Asiento manual (cuando no hay factura ni transacción)

Anotación de ajuste de fin de año, amortización, reparto entre socios, etc.

```
Paso 1 — Ve a "Libros Contables" → "Nuevo Asiento"
Paso 2 — Añade las líneas manualmente:
  Línea 1: Cuenta XXX  →  importe en DEBE o HABER
  Línea 2: Cuenta YYY  →  importe en HABER o DEBE (debe cuadrar)
Paso 3 — Guarda cuando DEBE = HABER
```

**Atención:** Si no sabes la cuenta de contrapartida, usa `629 - Otros servicios` o `410 - Acreedores` provisionalmente y edítalo después.

---

### Flujo E: Comisión bancaria (automático)

El banco te cobra 12€ de mantenimiento de cuenta.

```
Importas extracto → Conciliación → "Crear Asiento"
Sistema detecta la palabra "comisión/mantenimiento" en el concepto
Resultado automático:
  DEBE  626 (Servicios bancarios)  12€
  HABER 572 (Banco)                12€
```

---

## 4. Cómo funciona la Conciliación Bancaria

La **Conciliación** es el proceso de verificar que lo que dice tu banco coincide con lo que tienes registrado en la contabilidad.

### La pantalla de Conciliación tiene dos columnas:

```
┌─────────────────────────────┬─────────────────────────────────┐
│  MOVIMIENTOS BANCARIOS      │  COINCIDENCIAS EN LIBROS        │
│  (izquierda)                │  (derecha)                      │
├─────────────────────────────┼─────────────────────────────────┤
│ • Transacciones importadas  │ • Asientos del libro diario     │
│   del extracto (en indigo)  │   sin cuenta bancaria (572)     │
│ • Asientos con cuenta 572   │ • Aparecen al seleccionar un    │
│   no conciliados (en verde) │   movimiento bancario           │
└─────────────────────────────┴─────────────────────────────────┘
```

### Los tres estados posibles de un movimiento bancario:

1. **Sin casar** → Hay una transacción importada sin asiento contable
   - Acción: Crea un asiento nuevo o cásalo con uno existente

2. **Casado con factura** → La transacción corresponde a una factura registrada
   - Acción: "CASAR" → sistema crea el asiento de liquidación 400/572 o 430/572

3. **Casado directo** → La transacción se casó directamente con un asiento simple
   - Acción: Ambos quedan marcados como reconciliados

### Diagrama del proceso completo:

```
BANCO                          CBGEST
─────                          ──────
Extracto CSV ──import──→  BankTransaction (PENDING)
                                    │
                            [Conciliación]
                                    │
             ┌──────────────────────┼────────────────────────┐
             │                      │                        │
         Sin match             Con asiento              Con factura
             │                  de factura                   │
             ↓                      │                        │
      Crear Asiento            "CASAR"                  "CASAR"
      (6xx + 572)                   │                        │
             │               Status MATCHED         Crea Settlement
             ↓                reconciled=true       Entry (400+572)
      reconciled=true                                        │
                                                    reconciled=true
```

---

## 5. Ejemplos prácticos con cifras reales

### Ejemplo 1: Semana completa en el apartamento "La Marina"

**Contexto:** Reserva Airbnb de 3 noches, 720€ brutos. Airbnb descuenta 72€ de comisión y te transfiere 648€ el 15 de julio.

```
Asiento 1 (al registrar el ingreso):
  DEBE  430  Clientes (Airbnb)              720,00€
  HABER 705  Prestaciones de servicios      720,00€

Asiento 2 (conciliación — cuando recibes los 648€):
  DEBE  572  Banco c/c                      648,00€
  DEBE  629  Comisión Airbnb                 72,00€
  HABER 430  Clientes (Airbnb)              720,00€
```

> **Resultado:** Ingresos = 720€, Gasto comisión = 72€, Cobro neto = 648€

---

### Ejemplo 2: Limpieza con empresa (con factura)

**Contexto:** Empresa de limpieza manda factura el 5 de julio por 180€ con pago a 15 días.

```
5 julio — Registras la factura (PENDING):
  DEBE  622  Reparaciones y conservación    180,00€
  HABER 400  Proveedores                    180,00€

20 julio — El banco descarga el pago, importas extracto:
  Conciliación → CASAR con el asiento anterior
  Sistema crea automáticamente:
    DEBE  400  Proveedores                  180,00€
    HABER 572  Banco c/c                    180,00€
```

> **Resultado:** El gasto de 180€ está correctamente registrado. La cuenta 400 cierra a cero.

---

### Ejemplo 3: Seguro anual del apartamento

**Contexto:** Pago anual del seguro 425€, domiciliado el 1 de enero.

```
Asiento (con pago inmediato al banco, sin factura previa):
  DEBE  625  Primas de seguros              425,00€
  HABER 572  Banco c/c                      425,00€
```

> **Cómo registrarlo en CBGest:** Importas extracto → Conciliación → "Crear Asiento" → Cambias la cuenta 629 que pone el sistema por 625.

---

### Ejemplo 4: Comisión de la plataforma Booking.com (cobro neto)

**Contexto:** Booking te transfiere 540€ por una estancia que valió 600€. La comisión (60€) se descontó en origen.

```
Opción A — Registro simplificado (lo que recibes):
  DEBE  572  Banco c/c                      540,00€
  HABER 705  Prestaciones de servicios      540,00€

Opción B — Registro completo (recomendado para mayor detalle fiscal):
  DEBE  572  Banco c/c                      540,00€
  DEBE  629  Comisión Booking                60,00€
  HABER 705  Prestaciones de servicios      600,00€
```

> **Cuál elegir:** La opción B es más precisa para el cálculo de IRPF si quieres deducir las comisiones como gasto. En CBGest, usa la opción B añadiendo una tercera línea al asiento manual.

---

### Ejemplo 5: Suministros del apartamento (luz + agua)

**Contexto:** Dos recibos domiciliados en julio: Luz 87€, Agua 34€.

```
Asiento 1 — Factura eléctrica:
  DEBE  628  Suministros                     87,00€
  HABER 572  Banco c/c                        87,00€

Asiento 2 — Factura agua:
  DEBE  628  Suministros                     34,00€
  HABER 572  Banco c/c                        34,00€
```

> **En CBGest:** Cada cargo bancario crea su propio asiento en la Conciliación. Los dos van a la misma cuenta 628 pero son asientos independientes.

---

### Ejemplo 6: Reparación de emergencia pagada en efectivo

**Contexto:** Fontanero cobra 150€ en efectivo por avería en el baño.

```
  DEBE  622  Reparaciones y conservación    150,00€
  HABER 570  Caja (efectivo)                150,00€
```

> **Nota:** Si no usas la cuenta 570 (Caja), puedes poner este gasto en 572 igualmente indicando en el concepto "Pago en efectivo". Lo importante es que el asiento cuadre y el gasto quede registrado.

---

### Ejemplo 7: Intereses bancarios recibidos

**Contexto:** El banco abona 8,50€ de intereses en la cuenta corriente.

```
  DEBE  572  Banco c/c                        8,50€
  HABER 769  Otros ingresos financieros        8,50€
```

> **En CBGest:** La Conciliación detecta automáticamente la palabra "interés" y asigna la cuenta 769. Solo tienes que confirmar.

---

## 6. Preguntas frecuentes

### ❓ "¿Puedo crear un asiento sin saber todavía la cuenta de contrapartida?"

**Sí, pero indirectamente.** Crea el asiento usando una cuenta provisional como contrapartida:
- `629 - Otros servicios` (para gastos pendientes de clasificar)
- `410 - Acreedores varios` (para deudas pendientes)

Luego ve a "Libros Contables", busca el asiento y edítalo con la cuenta correcta.

**Lo que NO puedes hacer** es guardar un asiento que no cuadre (DEBE ≠ HABER). El sistema te lo impide.

---

### ❓ "¿Por qué aparecen dos asientos por la misma factura?"

Esto es **correcto y esperado** cuando sigues el flujo B o C:

1. **Asiento 1** (al registrar la factura): `622 | 400` — registra el gasto y la deuda
2. **Asiento 2** (al conciliar el pago): `400 | 572` — cancela la deuda y registra el pago

Ambos asientos están enlazados por el `invoiceId`. Si ves dos asientos relacionados a la misma factura, es señal de que el sistema está funcionando correctamente.

---

### ❓ "El asiento tiene reconciled=false pero ya está pagado. ¿Está mal?"

No necesariamente. El campo `reconciled` indica si la transacción bancaria ha sido **casada** con el asiento. Si creaste el asiento manualmente (sin importar extracto bancario), puede estar `reconciled=false` aunque económicamente sea correcto. Solo significa que no se verificó contra el extracto bancario.

---

### ❓ "¿Qué diferencia hay entre 'Libro Diario' y 'Libro Mayor'?"

- **Libro Diario** (Libros Contables): Muestra todos los asientos en orden cronológico. Es la fuente de datos principal.
- **Libro Mayor** (Libro Mayor): Muestra todos los movimientos de **una sola cuenta** en orden cronológico, con saldo acumulado. Úsalo para revisar, por ejemplo, qué facturas quedan pendientes en la cuenta 400 (Proveedores).

---

### ❓ "¿Cuándo debo ir a la sección de Conciliación vs Libros Contables?"

| Situación | Dónde ir |
|-----------|----------|
| Tienes un extracto bancario nuevo | Conciliación |
| Quieres revisar todos los asientos | Libros Contables |
| Quieres ver los movimientos de una cuenta | Libro Mayor |
| Quieres crear un asiento de ajuste | Libros Contables |
| Quieres casar una transacción con una factura | Conciliación |

---

### ❓ "¿Qué hago si importo el mismo extracto dos veces?"

CBGest no tiene protección automática contra importaciones duplicadas. Revisa las transacciones importadas antes de conciliar y elimina duplicados desde la sección de transacciones si los ves.

---

### ❓ "¿Cómo sé que la contabilidad del año está bien?"

1. Ve a **Libro Mayor** → Cuenta `572` → debe coincidir el saldo final con el saldo real de tu cuenta bancaria a 31/12
2. Ve a **Libro Mayor** → Cuenta `400` → el saldo al 31/12 debe ser igual a las facturas de proveedores que quedan pendientes de pago
3. Revisa el **Balance de Sumas y Saldos** (sección "Libros") → el total Debe debe igualar el total Haber

---

## 7. Reporte de estado del módulo contable

_Análisis realizado el 2026-07-13. Basado en revisión completa del código fuente._

### ✅ Lo que funciona correctamente

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Partida doble en asientos de facturas | ✅ Correcto | `buildEntryFromInvoice` genera 2 líneas balanceadas |
| Partida doble en conciliación bancaria | ✅ Correcto | `buildEntryFromUnmatchedTransaction` y `buildInvoiceSettlementEntry` |
| Validación de cuadre al guardar | ✅ Correcto | No se puede guardar si DEBE ≠ HABER |
| Libro Mayor por cuenta | ✅ Correcto | `AccountLedger.tsx` funcional con saldo corriente |
| Balance de Sumas y Saldos | ✅ Correcto | `TrialBalance.tsx` presente |
| Exportación CSV del Libro Mayor | ✅ Correcto | Incluye totales y formato correcto |
| Detección automática de conceptos financieros | ✅ Correcto | Palabras clave: comisión, interés, mantenimiento, etc. |
| Sugerencias IA en conciliación | ✅ Correcto | Detecta plataformas (Airbnb, Booking) y proveedores |
| Ejercicios contables (años fiscales) | ✅ Correcto | Asientos vinculados a `fiscalYearId` |
| Asientos read-only en ejercicio cerrado | ✅ Correcto | `useIsReadOnly()` protege todas las operaciones |

### ⚠️ Bugs identificados

| ID | Severidad | Descripción | Archivo | Línea |
|----|-----------|-------------|---------|-------|
| `BUG-CTB-001` | BAJO | Mensaje de error incorrecto al validar asiento con <2 líneas. Dice "debe y haber" pero el error es de número de líneas, no de cuadre. | `AccountingBooks.tsx` | 186 |
| `BUG-CTB-002` | MEDIO | Cálculo de saldo corriente en Libro Mayor no considera correctamente la naturaleza de cuentas del grupo 4 (400 acreedora, 430 deudora). El grupo 4 no entra en `isDebitNature` ni en su rama else, por lo que usa la rama "acreedora" por defecto, lo cual es correcto para 400 pero incorrecto para 430. | `AccountLedger.tsx` | 97 |

### 📊 Cobertura de tests del módulo contable

| Fichero | Tests existentes | Cobertura |
|---------|-----------------|-----------|
| `reconciliationUtils.ts` | 5 tests | ✅ Alta |
| `invoiceUtils.ts` | 4 tests | ✅ Alta |
| `AccountingBooks.tsx` | 0 tests de componente | ⚠️ Sin tests de UI |
| `BankReconciliation.tsx` | 0 tests de componente | ⚠️ Sin tests de UI |
| `AccountLedger.tsx` | 0 tests de componente | ⚠️ Sin tests de UI |

---

## 8. Plan de mejoras identificadas

### 🔴 Correcciones inmediatas (bugs)

**BUG-CTB-001** — Corregir mensaje de error en validación de asiento:
- Archivo: `components/AccountingBooks.tsx:186`
- Cambio: El texto "Un asiento debe tener al menos 2 líneas (debe y haber)" aparece cuando hay menos de 2 líneas válidas. Corrección: cambiar a "Un asiento debe tener al menos una línea en el Debe y una en el Haber."

**BUG-CTB-002** — Corregir cálculo de saldo en Libro Mayor para cuenta 430:
- Archivo: `components/AccountLedger.tsx:97`
- Cambio: Añadir cuenta grupo 43x (Clientes) a `isDebitNature`. Actualmente solo incluye grupos 1,2,3,5,6. La cuenta 430 (Clientes) es de naturaleza deudora (saldo en Debe) y debe estar incluida.

### 🟡 Mejoras de alta prioridad

**MEJ-CTB-001** — Plantillas de asientos frecuentes
- Añadir botón "Usar plantilla" en el modal de nuevo asiento
- Plantillas: Ingreso Airbnb, Ingreso Booking, Limpieza, Suministros, Seguro, Comisión bancaria
- Reduce tiempo de entrada y errores de cuenta

**MEJ-CTB-002** — Indicadores de estado en Libro Diario
- Badge visual por asiento: `PENDIENTE` (400/430 sin conciliar) / `CONCILIADO` / `MANUAL`
- Permite ver de un vistazo qué necesita acción

**MEJ-CTB-003** — Panel de deudas y cobros pendientes
- Vista que muestre saldo de cuentas 400 (por pagar) y 430 (por cobrar)
- Agrupado por proveedor/cliente con días transcurridos

### 🟢 Mejoras de baja prioridad

**MEJ-CTB-004** — Soporte de asientos borrador
- Campo `isDraft` en `AccountingEntry`
- Permite guardar asientos incompletos para completar más tarde
- No se incluyen en totales hasta confirmar

**MEJ-CTB-005** — Banner de guía en Conciliación Bancaria
- Bloque colapsable con los 3 pasos del proceso de conciliación
- Especialmente útil para usuarios nuevos

---

## 📎 Referencia rápida: Asientos más habituales en la CB

| Operación | DEBE | HABER | Importe |
|-----------|------|-------|---------|
| Ingreso alquiler cobrado | `572` Banco | `705` Prestaciones | Importe cobrado |
| Ingreso alquiler no cobrado | `430` Clientes | `705` Prestaciones | Importe facturado |
| Cobro de cliente pendiente | `572` Banco | `430` Clientes | Importe cobrado |
| Gasto limpieza pagado | `622` Reparaciones | `572` Banco | Importe pagado |
| Factura proveedor sin pagar | `622` Reparaciones | `400` Proveedores | Importe factura |
| Pago a proveedor pendiente | `400` Proveedores | `572` Banco | Importe pagado |
| Comisión bancaria | `626` Servicios bancarios | `572` Banco | Importe comisión |
| Seguro inmueble | `625` Seguros | `572` Banco | Prima anual |
| Suministros (luz/agua) | `628` Suministros | `572` Banco | Importe recibo |
| Intereses bancarios cobrados | `572` Banco | `769` Ingresos financieros | Importe interés |
| Comisión plataforma (Airbnb) | `629` Otros servicios | `572` Banco | Importe comisión |

---

_Este documento forma parte de la documentación técnica de CBGest. Actualizado automáticamente con cada análisis del módulo contable._
