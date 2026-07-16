# Checklist de resultados UAT — C.B. Mediterránea Costa Brava

**Ejecutor:** _________________________  
**Fecha inicio:** __________ **Fecha fin:** __________  
**Build / commit:** _________________________  
**Entorno:** ☐ Appwrite  ☐ Archivo local  ☐ Otro: _________

**Escenario:** CIF `E45678901` · Régimen **ALQUILER_EXENTO** · Ejercicios 2027 completo + 2028 hasta 17/07/2028  
**Guía:** [`../GUIA_UAT.md`](../GUIA_UAT.md)  
**IRPF:** [`irpf-2027.md`](./irpf-2027.md) (criterio `totalAmount`)

---

## Instrucciones

- Marca **PASS** o **FAIL** en cada fila.
- Anota en **Notas / bug encontrado** el síntoma, captura o ID de issue.
- Un **NO-GO** global si cualquier paso bloqueante o edge crítico es FAIL.

---

## Pasos 0–12

| Paso | Descripción | PASS | FAIL | Notas / bug encontrado |
|:----:|-------------|:----:|:----:|------------------------|
| **0** | Precondiciones / reset (entorno limpio, app arrancada) | ☐ | ☐ | |
| **1** | Configuración CB arrendamiento + 4 comuneros + taxInfo | ☐ | ☐ | |
| **2** | Ejercicios 2027 y 2028 creados (2028 nota parcial 17/07) | ☐ | ☐ | |
| **3** | 6 apartamentos (`CB-A1` … `CB-R2`) | ☐ | ☐ | |
| **4** | 8 proveedores (`master/proveedores.json`) | ☐ | ☐ | |
| **5** | 9 gastos recurrentes (`master/gastos-recurrentes.json`) | ☐ | ☐ | |
| **6** | 108 facturas 2027 cargadas (72 gasto + 36 ingreso) | ☐ | ☐ | |
| **7** | 12 extractos 2027 + conciliación (flujos A–E) | ☐ | ☐ | |
| **8** | 60 reservas 2027 (`reservas-2027.csv`) + edges reservas | ☐ | ☐ | |
| **9** | Libro Diario / Mayor 400+572 / Balance cuadrado | ☐ | ☐ | |
| **10** | IRPF 4 comuneros — cuotas vs `irpf-2027.md` (±2 €) | ☐ | ☐ | |
| **11** | Bloque 2028 parcial + EDGE-09 + EDGE-11 | ☐ | ☐ | |
| **12** | Matriz go/no-go global completada | ☐ | ☐ | |

---

## Controles numéricos rápidos (paso 9 / 11)

| Control | Esperado | Real | PASS | FAIL | Notas |
|---------|----------|------|:----:|:----:|-------|
| Facturas 2027 | 108 | | ☐ | ☐ | |
| Extractos 2027 | 12 | | ☐ | ☐ | |
| Reservas 2027 | 60 | | ☐ | ☐ | |
| Saldo 572 al 31/12/2027 | 43.607,51 € | | ☐ | ☐ | Ver `balances-2027.md` |
| Saldo cuenta 400 (EDGE-01) | 242,00 € pendiente | | ☐ | ☐ | Factura `G-2027-058` |
| Rendimiento neto CB 2027 (IRPF) | ver `irpf-2027.md` | | ☐ | ☐ | Régimen ALQUILER_EXENTO |
| Cuotas IRPF 4 comuneros | ver `irpf-2027.md` (±2 €) | | ☐ | ☐ | Paso 10 |
| Facturas 2028 (≤17/07) | 60 (40+20) | | ☐ | ☐ | |
| Extractos 2028 | 7 | | ☐ | ☐ | `extracto-2028-01` … `07` |
| Reservas 2028 | 30 | | ☐ | ☐ | |
| Saldo 572 al 17/07/2028 | 57.208,43 € | | ☐ | ☐ | Ver `balances-2028.md` |

---

## Tabla de edges (EDGE-01 … EDGE-11)

| ID | Descripción | PASS | FAIL | Notas / bug encontrado |
|----|-------------|:----:|:----:|------------------------|
| **EDGE-01** | `G-2027-058` — Neteja 242 € sin movimiento bancario; pendiente 400 | ☐ | ☐ | |
| **EDGE-02** | `G-2027-032` — Factura 10/06/2027; pago banco 10/07/2027 (−114,95 €) | ☐ | ☐ | |
| **EDGE-03** | Mov. 28/03/2027 `COMISION MANTENIMIENTO CUENTA` −6,50 € → 626/572 | ☐ | ☐ | |
| **EDGE-04** | `I-2027-024` — Ingreso 1842,35 € + mov. `AIRBNB PAYMENTS` 12/08/2027 | ☐ | ☐ | |
| **EDGE-05** | Mov. 03/05/2027 `BIZUM FERRETERIA LOCAL` −38,20 €; asiento manual sin factura | ☐ | ☐ | |
| **EDGE-06** | `G-2027-022` IVA 21 % + `G-2027-023` IVA 10 % en mismo trimestre | ☐ | ☐ | |
| **EDGE-07** | Reserva `BK-2027-CANCEL-01` — Cancelled; sin ingresos ni IEET | ☐ | ☐ | |
| **EDGE-08** | Reserva `BK-2027-IEET-08` — CB-A2, 4 adultos, 5 noches; IEET turístico | ☐ | ☐ | |
| **EDGE-09** | `G-2027-063` — Factura dic-2027 pagada en extracto ene-2028 (−422,18 €) | ☐ | ☐ | |
| **EDGE-10** | Reserva `BK-2027-CHILD-10` — `numberOfChildren`=2 en UI; IEET solo adultos | ☐ | ☐ | |
| **EDGE-11** | Corte 17/07/2028 — Sin facturas/mov/reservas posteriores en kit 2028 | ☐ | ☐ | |

---

## Edges por paso (referencia cruzada)

| Paso | Edges a verificar en ese paso |
|------|-------------------------------|
| 6 | EDGE-01, EDGE-02, EDGE-04, EDGE-06, EDGE-09 (carga) |
| 7 | EDGE-01, EDGE-02, EDGE-03, EDGE-04, EDGE-05 |
| 8 | EDGE-07, EDGE-08, EDGE-10 |
| 9 | EDGE-01 (saldo 400) |
| 11 | EDGE-09, EDGE-11 |
| 12 | EDGE-01 … EDGE-11 (revisión global) |

---

## Decisión final (paso 12)

| Criterio | Cumple |
|----------|:------:|
| Pasos 0–11 todos PASS | ☐ |
| EDGE-01 … EDGE-11 todos PASS | ☐ |
| Sin bugs CRÍTICOS abiertos | ☐ |
| Balance 2027 y saldos 572 verificados | ☐ |
| Bloque 2028 respeta corte 17/07/2028 | ☐ |

**Decisión global:**

| | Marcar |
|---|:------:|
| **GO** — Aceptar release | ☐ |
| **NO-GO** — Rechazar / requiere corrección | ☐ |

**Resumen ejecutivo (obligatorio si NO-GO):**

```
Bloqueantes encontrados:




Próximos pasos recomendados:




```

**Firma ejecutor:** _________________________ **Firma revisor:** _________________________

---

*Plantilla vinculada a `uat-kit/2027/edges/edges-manifest.json` y `uat-kit/2028/edges/edges-manifest.json`.*
