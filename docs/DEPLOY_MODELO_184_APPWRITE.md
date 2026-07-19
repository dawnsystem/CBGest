# Despliegue Appwrite — Modelo 184 (FEAT-M184-001)

Guía para aplicar en **Appwrite Cloud** (o self-hosted) los cambios de esquema y verificar que el módulo Modelo 184 funciona.

## Qué cambia en Appwrite

| Recurso | Acción | Detalle |
|---------|--------|---------|
| Colección **`tax_reports`** | **Crear** (nueva) | Borradores Modelo 184 persistidos |
| Colección **`settings`** | **Ampliar** | 9 atributos fiscales CB (domicilio, representante, teléfono) |
| Colección **`invoices`** | **Ampliar** | Atributo `isDeductible` (boolean, default `true`) |
| Colección **`settings.partners`** | Sin cambio de esquema | Los domicilios de socios van dentro del JSON `partners` |

No se requieren nuevos buckets ni funciones obligatorias para el flujo en la app web. La función `prepare-modelo-184` es opcional (automatización server-side).

---

## Requisitos previos

1. API key de Appwrite con permisos de **Databases** (lectura/escritura).
2. Variables de entorno en el entorno donde ejecutes el script (`.env` / `.env.local` o export manual):

```bash
export APPWRITE_API_KEY="tu-api-key-con-permisos-databases"
# Opcionales si difieren del default del proyecto:
# export APPWRITE_ENDPOINT="https://fra.cloud.appwrite.io/v1"
# export APPWRITE_PROJECT_ID="cbgest"
# export APPWRITE_DATABASE_ID="691f288100019843d43e"
```

3. Rama de código desplegada en frontend con el módulo `services/modelo184/` (PR contra `dev`).
4. Plantilla PDF en `public/assets/modelo184/modelo184-blank.pdf` incluida en el build (formulario AEAT en blanco).

---

## Paso 1 — Ejecutar script de creación en masa

Desde la raíz del repositorio:

```bash
node scripts/setup-all-collections.cjs
```

El script es **idempotente**: si una colección o atributo ya existe, lo omite o lo completa en el pase defensivo.

Crea o actualiza, entre otras:

- **`tax_reports`**: `fiscalYearId`, `year`, `status`, `draft` (JSON hasta 65535 chars), `exportedAt`, `fileHash`, `presentationReference`, `createdAt`, `updatedAt` + índices `fiscalYearId_index`, `year_index`, `status_index`.
- **`settings`**: `address`, `streetNumber`, `postalCode`, `city`, `province`, `phone`, `contactPerson`, `representativeNif`, `representativeName`.
- **`invoices`**: `isDeductible` (boolean).

---

## Paso 2 — Verificar esquema

```bash
node scripts/verify-appwrite-setup.cjs
```

Comprueba que existen `tax_reports` y los nuevos atributos en `settings` e `invoices`. Corrige cualquier ❌ antes de continuar.

---

## Paso 3 — Datos maestros en la app

Tras desplegar el frontend:

1. **Ajustes → Datos fiscales**
   - Domicilio fiscal de la CB (calle, CP, ciudad, provincia).
   - NIF y nombre del representante (aparecen en registro tipo 1 del fichero AEAT).
   - Persona de contacto y teléfono (opcional en PDF).

2. **Socios**
   - Participación (%).
   - Domicilio fiscal de cada socio (campo «Domicilio fiscal (Modelo 184)»). Se guarda en el JSON `partners`; no hace falta columna nueva.

3. **Apartamentos**
   - Referencia catastral (`cadastralRef`) en cada inmueble alquilado.

4. **Ejercicio fiscal**
   - Crear/abrir el ejercicio 2025 (o el que corresponda) y asignar `fiscalYearId` a reservas y facturas (migración desde Ajustes si hay datos legacy).

---

## Paso 4 — Probar Modelo 184 en la UI

1. Seleccionar el ejercicio fiscal activo.
2. Ir a **Modelos fiscales** (`#/taxes`).
3. Revisar el borrador generado (ingresos = reservas confirmadas; gastos = facturas deducibles con reparto proporcional).
4. Probar:
   - **PDF oficial** — descarga local.
   - **Fichero AEAT (.txt)** — registros de 500 caracteres, ISO-8859-1.
   - **Guardar borrador** — debe crear documento en `tax_reports` sin error.

Si «Guardar borrador» muestra aviso de colección no configurada, repetir pasos 1–2.

---

## Paso 5 (opcional) — Función `prepare-modelo-184`

Solo si usas automatización server-side:

```bash
# Desde la raíz, con Appwrite CLI configurado
appwrite functions createDeployment \
  --functionId prepare-modelo-184 \
  --code functions/prepare-modelo-184 \
  --activate true
```

La función usa el mismo criterio de ingresos/gastos que la app (reservas confirmadas, `isDeductible`).

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Unknown attribute: draft` | Colección `tax_reports` no creada | `node scripts/setup-all-collections.cjs` |
| `Unknown attribute: address` en settings | Atributos fiscales no añadidos | Re-ejecutar script (pase `ensureSettingsFiscalSchema`) |
| `Unknown attribute: isDeductible` | Facturas sin columna | Re-ejecutar script (pase `ensureInvoiceIsDeductibleSchema`) |
| Borrador con ingresos 0 | Sin reservas confirmadas en el ejercicio | Importar/completar reservas con `fiscalYearId` correcto |
| Validaciones M184-DOMICILIO | Faltan datos CB en Ajustes | Completar domicilio fiscal en Settings |
| Fichero .txt con líneas rotas | No debería ocurrir tras FEAT-M184-001 | Regenerar; registros se sanitizan sin `\r\n` internos |

---

## Nota sobre validación con PDF de asesoría

No es objetivo de este despliegue **igualar cifras** con la declaración presentada por la asesoría mientras la app esté en desarrollo y falten datos (reservas, gastos, socios, catastro, etc.). La validación útil ahora es:

- Esquema Appwrite correcto (paso 2).
- Flujo UI sin errores (paso 4).
- Coherencia interna del borrador (sumas, atribución a socios, longitud registros AEAT).

Cuando los datos estén completos, se podrá contrastar manualmente con el PDF oficial.

### Regenerar plantilla PDF (desarrolladores)

Si AEAT actualiza el diseño del formulario:

```bash
# Colocar justificante AEAT de referencia en scripts/fixtures/modelo184-reference.pdf
node scripts/build-modelo184-template.cjs scripts/fixtures/modelo184-reference.pdf
```

Esto regenera `public/assets/modelo184/modelo184-blank.pdf` blanqueando las casillas de datos.

---

## Referencia rápida de colección `tax_reports`

| Atributo | Tipo | Uso |
|----------|------|-----|
| `fiscalYearId` | string(36) | Enlace al ejercicio |
| `year` | integer | Año fiscal (ej. 2025) |
| `status` | string(20) | `DRAFT` \| `EXPORTED` \| `FILED` |
| `draft` | string(65535) | JSON serializado de `Modelo184Draft` |
| `exportedAt` | string | ISO timestamp al exportar |
| `fileHash` | string | Huella del fichero generado (futuro) |
| `presentationReference` | string | Referencia presentación AEAT (futuro) |

Permisos: usuarios autenticados (Create/Read/Update/Delete), igual que el resto de colecciones CBGest.
