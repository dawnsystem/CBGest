# Configuración de Appwrite para CBGest

Este documento describe cómo configurar las colecciones necesarias en Appwrite para que la aplicación funcione correctamente.

## Colecciones Requeridas

El proyecto requiere las siguientes colecciones en la base de datos de Appwrite:

1. `invoices` - Facturas
2. `entries` - Asientos contables
3. `transactions` - Transacciones bancarias
4. `settings` - Configuración de la aplicación
5. `notifications` - Notificaciones del sistema ⚠️ **FALTA CREAR**
6. `uploads` - Cola de uploads ⚠️ **FALTA CREAR**

## Colección: notifications

Esta colección almacena las notificaciones del sistema para los usuarios.

### Atributos requeridos:

| Atributo | Tipo | Tamaño | Requerido | Array | Descripción |
|----------|------|--------|-----------|-------|-------------|
| `id` | String | 255 | ✅ | ❌ | ID único de la notificación |
| `type` | String | 50 | ✅ | ❌ | Tipo de notificación (INVOICE_CREATED, etc.) |
| `title` | String | 255 | ✅ | ❌ | Título de la notificación |
| `message` | String | 1000 | ✅ | ❌ | Mensaje de la notificación |
| `userId` | String | 255 | ✅ | ❌ | ID del usuario que realizó la acción |
| `userName` | String | 255 | ✅ | ❌ | Nombre del usuario |
| `timestamp` | Integer | - | ✅ | ❌ | Timestamp Unix (ms) |
| `read` | Boolean | - | ✅ | ❌ | Si la notificación fue leída |
| `relatedId` | String | 255 | ❌ | ❌ | ID relacionado (factura, asiento, etc.) |

### Índices recomendados:
- `timestamp` (DESC) - Para ordenar por fecha
- `userId` - Para filtrar por usuario
- `read` - Para filtrar notificaciones no leídas

### Permisos:
- **Create**: Cualquier usuario autenticado
- **Read**: Cualquier usuario autenticado
- **Update**: Cualquier usuario autenticado
- **Delete**: Cualquier usuario autenticado

---

## Colección: uploads

Esta colección almacena la cola de archivos pendientes de procesar (facturas y extractos bancarios).

### Atributos requeridos:

| Atributo | Tipo | Tamaño | Requerido | Array | Descripción |
|----------|------|--------|-----------|-------|-------------|
| `id` | String | 255 | ✅ | ❌ | ID único del item |
| `uploadType` | String | 50 | ✅ | ❌ | Tipo: 'INVOICE' o 'BANK_STATEMENT' |
| `fileName` | String | 255 | ✅ | ❌ | Nombre del archivo original |
| `mimeType` | String | 100 | ✅ | ❌ | Tipo MIME del archivo |
| `base64Data` | String | 10000000 | ❌ | ❌ | Datos del archivo en base64 (10MB) |
| `status` | String | 50 | ✅ | ❌ | Estado: QUEUED, ANALYZING, COMPLETED, ERROR |
| `progress` | Integer | - | ✅ | ❌ | Progreso del procesamiento (0-100) |
| `error` | String | 1000 | ❌ | ❌ | Mensaje de error si falla |
| `timestamp` | Integer | - | ✅ | ❌ | Timestamp Unix (ms) |
| `notificationDismissed` | Boolean | - | ❌ | ❌ | Si el usuario descartó la notificación |
| `result` | String | 10000 | ❌ | ❌ | Resultado del análisis (JSON) |
| `bankResult` | String | 50000 | ❌ | ❌ | Transacciones bancarias (JSON array) |
| `fileHash` | String | 64 | ❌ | ❌ | SHA-256 del archivo (deduplicación) |
| `duplicateMatch` | String | 2000 | ❌ | ❌ | Coincidencia de duplicado (JSON) |
| `forceProcess` | Boolean | - | ❌ | ❌ | Saltar capa hash y reprocesar con IA |

### Índices recomendados:
- `timestamp` (DESC) - Para ordenar por fecha
- `status` - Para filtrar por estado
- `uploadType` - Para filtrar por tipo

### Permisos:
- **Create**: Cualquier usuario autenticado
- **Read**: Cualquier usuario autenticado
- **Update**: Cualquier usuario autenticado
- **Delete**: Cualquier usuario autenticado

---

## Instrucciones de Creación Manual

### Paso 1: Acceder a Appwrite Console

1. Ve a https://cloud.appwrite.io/
2. Inicia sesión con tu cuenta
3. Selecciona el proyecto `cbgest` (ID: `cbgest`)
4. Ve a la sección **Databases** en el menú lateral
5. Selecciona la base de datos con ID: `691f288100019843d43e`

### Paso 2: Crear la colección "notifications"

1. Haz clic en **Create Collection**
2. **Collection ID**: `notifications` (exactamente este ID)
3. **Name**: `Notifications` (el nombre puede ser cualquiera)
4. Haz clic en **Create**

5. Ahora agrega los atributos uno por uno haciendo clic en **Add Attribute**:

   - **String**: `id`, Size: 255, Required ✓
   - **String**: `type`, Size: 50, Required ✓
   - **String**: `title`, Size: 255, Required ✓
   - **String**: `message`, Size: 1000, Required ✓
   - **String**: `userId`, Size: 255, Required ✓
   - **String**: `userName`, Size: 255, Required ✓
   - **Integer**: `timestamp`, Min: 0, Max: 9999999999999, Required ✓
   - **Boolean**: `read`, Required ✓, Default: false
   - **String**: `relatedId`, Size: 255, Required ✗ (opcional)

6. Ve a la pestaña **Indexes** y crea:
   - Index en `timestamp` (Descendente)
   - Index en `userId` (Ascendente)
   - Index en `read` (Ascendente)

7. Ve a la pestaña **Settings** → **Permissions** y configura:
   - Any authenticated user: ✓ Create, ✓ Read, ✓ Update, ✓ Delete

### Paso 3: Crear la colección "uploads"

1. Haz clic en **Create Collection**
2. **Collection ID**: `uploads` (exactamente este ID)
3. **Name**: `Upload Queue` (el nombre puede ser cualquiera)
4. Haz clic en **Create**

5. Ahora agrega los atributos uno por uno:

   - **String**: `id`, Size: 255, Required ✓
   - **String**: `uploadType`, Size: 50, Required ✓
   - **String**: `fileName`, Size: 255, Required ✓
   - **String**: `mimeType`, Size: 100, Required ✓
   - **String**: `base64Data`, Size: 10000000, Required ✗
   - **String**: `status`, Size: 50, Required ✓
   - **Integer**: `progress`, Min: 0, Max: 100, Required ✓, Default: 0
   - **String**: `error`, Size: 1000, Required ✗
   - **Integer**: `timestamp`, Min: 0, Max: 9999999999999, Required ✓
   - **Boolean**: `notificationDismissed`, Required ✗, Default: false
   - **String**: `result`, Size: 10000, Required ✗
   - **String**: `bankResult`, Size: 50000, Required ✗

6. Ve a la pestaña **Indexes** y crea:
   - Index en `timestamp` (Descendente)
   - Index en `status` (Ascendente)
   - Index en `uploadType` (Ascendente)

7. Ve a la pestaña **Settings** → **Permissions** y configura:
   - Any authenticated user: ✓ Create, ✓ Read, ✓ Update, ✓ Delete

---

## Script de Automatización (Opcional)

Si prefieres automatizar la creación, puedes usar el script `scripts/setup-appwrite-collections.js` (requiere Node.js y el SDK de Appwrite).

Ver [Instrucciones del Script](../scripts/README.md) para más detalles.

---

## Verificación

Después de crear las colecciones, verifica que:

1. ✅ La colección `notifications` existe con ID exacto `notifications`
2. ✅ La colección `uploads` existe con ID exacto `uploads`
3. ✅ Todos los atributos fueron creados correctamente
4. ✅ Los permisos están configurados para usuarios autenticados
5. ✅ Los índices fueron creados

Una vez creadas, la aplicación debería funcionar sin errores 404 en la consola.

---

## Troubleshooting

**Error: "Collection with the requested ID could not be found"**
- Verifica que los IDs de las colecciones sean exactamente `notifications` y `uploads`
- Verifica que las colecciones estén en la base de datos correcta (ID: `691f288100019843d43e`)

**Error: "Invalid document structure: Unknown attribute"**
- Verifica que todos los atributos estén creados con los nombres exactos (case-sensitive)

**Error: "Missing required parameter"**
- Verifica que todos los atributos marcados como "Required" estén presentes al crear documentos
