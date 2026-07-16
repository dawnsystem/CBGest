# Kit UAT manual — CBGest

Kit de prueba de aceptación (UAT) para ejercer CBGest **como un gestor** de una Comunidad de Bienes ficticia.

No siembra Appwrite automáticamente: tú introduces/importas los datos en la app siguiendo [`GUIA_UAT.md`](./GUIA_UAT.md).

## Escenario

| Campo | Valor |
|-------|--------|
| Empresa | **C.B. Mediterránea Costa Brava** |
| CIF | `E45678901` |
| Régimen | `ALQUILER_EXENTO` (arrendamiento, sin IVA repercutido) |
| IBAN | `ES91 2100 0418 4502 0005 1332` |
| Ejercicio 2027 | 01/01/2027 – 31/12/2027 (completo) |
| Ejercicio 2028 | 01/01/2028 – **17/07/2028** (parcial) |

## Contenido

```text
uat-kit/
├── README.md                 ← este archivo
├── GUIA_UAT.md               ← checklist paso a paso PASS/FAIL
├── master/                   ← datos maestros (empresa, comuneros, aptos…)
├── 2027/                     ← facturas PDF+JSON, extractos XLSX, reservas CSV
├── 2028/                     ← igual, truncado a 17/07/2028
└── expected/                 ← saldos bancarios + IRPF Dashboard + checklist
```

### Volúmenes

| Bloque | 2027 | 2028 (hasta 17/07) |
|--------|-----:|-------------------:|
| Facturas gasto | 72 | 40 |
| Facturas ingreso | 36 | 20 |
| Extractos bancarios XLSX | 12 | 7 |
| Reservas CSV | 60 | 30 |
| Comuneros / aptos / proveedores | 4 / 6 / 8 | (se copian al crear ejercicio) |

## Cómo regenerar los artefactos

```bash
npm run generate:uat-kit
```

Fuente de verdad: `uat-kit/master/*.json` + lógica en [`scripts/generate-uat-kit.mjs`](../scripts/generate-uat-kit.mjs).

## Cómo usar (resumen)

1. Arranca la app (`npm run dev`) con un entorno limpio o un ejercicio vacío.
2. Abre [`GUIA_UAT.md`](./GUIA_UAT.md) y sigue los pasos en orden.
3. Para cada paso, marca **PASS** o **FAIL** en [`expected/checklist-resultados.md`](./expected/checklist-resultados.md).
4. Los casos borde están en `2027/edges/edges-manifest.json` y `2028/edges/edges-manifest.json`.

## Contratos de importación

- **Facturas**: subir PDF en `#/invoices` (OCR Gemini) o transcribir desde la ficha `.json` si el OCR falla.
- **Extractos**: `#/invoices` → pestaña **Extracto Bancario** → XLSX con columnas `Fecha | Concepto | Importe` (cargos negativos).
- **Reservas**: `#/reservations` → Importar CSV (separador `;`, sin cabecera).

## Aviso legal

Todos los datos son **100 % ficticios**. Los PDFs llevan la marca *DOCUMENTO UAT FICTICIO — NO VÁLIDO FISCALMENTE*. No usar fuera de pruebas.
