# Configuración de Colecciones de Appwrite para CBGest

## Requisitos Previos

- Cuenta de Appwrite (Cloud o Self-hosted)
- Proyecto creado en Appwrite Console

## Paso 1: Crear Base de Datos

1. Ve a **Databases** en el panel de Appwrite
2. Haz clic en **Create database**
3. **Database Name**: `CBGest Database`
4. **Database ID**: `CBGest_DB` (importante: usar exactamente este ID)
5. Haz clic en **Create**

## Paso 2: Crear Storage Bucket

1. Ve a **Storage** en el panel de Appwrite
2. Haz clic en **Create bucket**
3. **Bucket Name**: `CBGest Data`
4. **Bucket ID**: `gestcb-data` (importante: usar exactamente este ID)
5. **Permissions**:
   - Read: `users` (Any authenticated user)
   - Create: `users`
   - Update: `users`
   - Delete: `users`
6. **File Security**: Enabled
7. **Maximum File Size**: 50 MB
8. **Allowed File Extensions**: `pdf`, `jpg`, `jpeg`, `png`, `webp`
9. Haz clic en **Create**

## Paso 3: Crear Colecciones

### Colección 1: `invoices`

**Collection Name**: Invoices
**Collection ID**: `invoices`

**Atributos**:

| Attribute Key | Type | Size | Required | Array | Default |
|--------------|------|------|----------|-------|---------|
| `id` | String | 128 | ✅ | ❌ | - |
| `number` | String | 128 | ✅ | ❌ | - |
| `date` | String | 32 | ✅ | ❌ | - |
| `issuerName` | String | 256 | ✅ | ❌ | - |
| `issuerNif` | String | 32 | ✅ | ❌ | - |
| `supplierId` | String | 128 | ❌ | ❌ | null |
| `baseAmount` | Double | - | ✅ | ❌ | 0 |
| `vatRate` | Double | - | ✅ | ❌ | 21 |
| `vatAmount` | Double | - | ✅ | ❌ | 0 |
| `totalAmount` | Double | - | ✅ | ❌ | 0 |
| `type` | Enum | - | ✅ | ❌ | EXPENSE |
| `status` | Enum | - | ✅ | ❌ | PENDING |
| `category` | String | 256 | ❌ | ❌ | null |
| `appwriteFileId` | String | 128 | ❌ | ❌ | null |
| `fileHash` | String | 64 | ❌ | ❌ | null |
| `contentFingerprint` | String | 128 | ❌ | ❌ | null |

**Enum Values**:
- `type`: `EXPENSE`, `INCOME`
- `status`: `PENDING`, `PROCESSED`, `PAID`

**Índices** (Indexes):
- `date_idx`: Attribute: `date`, Order: DESC
- `type_idx`: Attribute: `type`, Order: ASC
- `status_idx`: Attribute: `status`, Order: ASC

**Permissions**:
- Role: `users` → Read, Create, Update, Delete

---

### Colección 2: `suppliers`

**Collection Name**: Suppliers
**Collection ID**: `suppliers`

**Atributos**:

| Attribute Key | Type | Size | Required | Array | Default |
|--------------|------|------|----------|-------|---------|
| `id` | String | 128 | ✅ | ❌ | - |
| `name` | String | 256 | ✅ | ❌ | - |
| `nif` | String | 32 | ✅ | ❌ | - |
| `nifType` | Enum | - | ✅ | ❌ | CIF |
| `address` | String | 512 | ❌ | ❌ | null |
| `city` | String | 256 | ❌ | ❌ | null |
| `postalCode` | String | 16 | ❌ | ❌ | null |
| `email` | String | 256 | ❌ | ❌ | null |
| `phone` | String | 32 | ❌ | ❌ | null |
| `notes` | String | 2048 | ❌ | ❌ | null |
| `createdAt` | String | 64 | ✅ | ❌ | - |
| `updatedAt` | String | 64 | ✅ | ❌ | - |

**Enum Values**:
- `nifType`: `NIF`, `CIF`, `NIE`, `DNI`, `PASAPORTE`

**Índices** (Indexes):
- `nif_idx`: Attribute: `nif`, Order: ASC, Unique: true
- `name_idx`: Attribute: `name`, Order: ASC

**Permissions**:
- Role: `users` → Read, Create, Update, Delete

---

### Colección 3: `entries`

**Collection Name**: Accounting Entries
**Collection ID**: `entries`

**Atributos**:

| Attribute Key | Type | Size | Required | Array | Default |
|--------------|------|------|----------|-------|---------|
| `id` | String | 128 | ✅ | ❌ | - |
| `date` | String | 32 | ✅ | ❌ | - |
| `concept` | String | 512 | ✅ | ❌ | - |
| `accountCode` | String | 32 | ✅ | ❌ | - |
| `accountName` | String | 256 | ✅ | ❌ | - |
| `debit` | Double | - | ✅ | ❌ | 0 |
| `credit` | Double | - | ✅ | ❌ | 0 |
| `invoiceId` | String | 128 | ❌ | ❌ | null |
| `reconciled` | Boolean | - | ✅ | ❌ | false |
| `appwriteFileId` | String | 128 | ❌ | ❌ | null |

**Índices** (Indexes):
- `date_idx`: Attribute: `date`, Order: DESC
- `accountCode_idx`: Attribute: `accountCode`, Order: ASC
- `reconciled_idx`: Attribute: `reconciled`, Order: ASC

**Permissions**:
- Role: `users` → Read, Create, Update, Delete

---

### Colección 4: `transactions`

**Collection Name**: Bank Transactions
**Collection ID**: `transactions`

**Atributos**:

| Attribute Key | Type | Size | Required | Array | Default |
|--------------|------|------|----------|-------|---------|
| `id` | String | 128 | ✅ | ❌ | - |
| `date` | String | 32 | ✅ | ❌ | - |
| `valueDate` | String | 32 | ❌ | ❌ | null |
| `concept` | String | 512 | ✅ | ❌ | - |
| `amount` | Double | - | ✅ | ❌ | 0 |
| `balance` | Double | - | ❌ | ❌ | null |
| `reconciledWithEntryId` | String | 128 | ❌ | ❌ | null |
| `status` | Enum | - | ✅ | ❌ | PENDING |

**Enum Values**:
- `status`: `PENDING`, `MATCHED`

**Índices** (Indexes):
- `date_idx`: Attribute: `date`, Order: DESC
- `status_idx`: Attribute: `status`, Order: ASC

**Permissions**:
- Role: `users` → Read, Create, Update, Delete

---

### Colección 5: `settings`

**Collection Name**: Settings
**Collection ID**: `settings`

**Atributos**:

| Attribute Key | Type | Size | Required | Array | Default |
|--------------|------|------|----------|-------|---------|
| `id` | String | 128 | ✅ | ❌ | - |
| `cbName` | String | 256 | ✅ | ❌ | - |
| `nif` | String | 32 | ✅ | ❌ | - |
| `fiscalRegime` | Enum | - | ✅ | ❌ | ALQUILER_EXENTO |
| `vatObligation` | Boolean | - | ✅ | ❌ | false |
| `partnersJson` | String | 65535 | ✅ | ❌ | [] |
| `dataConfigJson` | String | 65535 | ❌ | ❌ | null |

**Enum Values**:
- `fiscalRegime`: `GENERAL`, `ALQUILER_EXENTO`

**Permissions**:
- Role: `users` → Read, Create, Update, Delete

---

## Paso 4: Verificar Configuración

Una vez creadas todas las colecciones y el bucket:

1. Ve a tu aplicación CBGest
2. Navega a **Configuración** → **Backend Appwrite**
3. Introduce:
   - **API Endpoint**: `https://cloud.appwrite.io/v1` (o tu endpoint personalizado)
   - **Project ID**: Tu ID de proyecto de Appwrite
   - **Database ID**: `CBGest_DB`
   - **Bucket ID**: `gestcb-data`
4. Haz clic en **Probar Conexión**
5. Deberías ver checkmarks verdes en todos los campos si todo está configurado correctamente

## Notas Importantes

### Permisos
- Asegúrate de que TODAS las colecciones tienen los permisos configurados para `users` (Any authenticated user)
- Sin estos permisos, la aplicación no podrá leer/escribir datos

### IDs Personalizados
- Es CRÍTICO usar los IDs exactos especificados en este documento
- La aplicación busca estas colecciones por su ID específico

### Índices
- Los índices mejoran el rendimiento de las consultas
- Son especialmente importantes para colecciones con muchos documentos

### Tamaños de Atributos
- Los tamaños de String están optimizados para el uso típico
- Si necesitas más espacio, puedes aumentar los límites después de crear los atributos

## Troubleshooting

### Error: "Database not found"
- Verifica que el Database ID sea exactamente `CBGest_DB`
- Verifica que la base de datos esté creada en el proyecto correcto

### Error: "Collection not found"
- Verifica que todas las colecciones tengan los IDs correctos
- Verifica que las colecciones estén en la base de datos `CBGest_DB`

### Error: "Bucket not found"
- Verifica que el Bucket ID sea exactamente `gestcb-data`
- Verifica que el bucket tenga permisos correctos

### Error: "Unauthorized" o "Permission denied"
- Verifica que estés autenticado en la aplicación
- Verifica que los permisos de las colecciones incluyan `users` con Read/Create/Update/Delete
- Verifica que los permisos del bucket incluyan `users` con Read/Create/Update/Delete

## Migración desde localStorage

Una vez configurado Appwrite, la aplicación:
1. Continuará usando localStorage solo para la configuración inicial
2. Todos los datos (facturas, asientos, transacciones, proveedores) se guardarán en Appwrite
3. Los archivos PDF se subirán al bucket de Storage

Para migrar datos existentes de localStorage:
1. Asegúrate de que Appwrite esté configurado y funcionando
2. La aplicación sincronizará automáticamente los datos locales a Appwrite en el primer uso
3. Verifica que los datos aparezcan en Appwrite Console
4. Los datos en localStorage se mantendrán como respaldo hasta que lo desactives manualmente

## Próximos Pasos

Después de configurar Appwrite:
1. Crea un usuario de prueba en tu proyecto Appwrite (Auth → Create user)
2. Inicia sesión en la aplicación con ese usuario
3. Verifica que puedas crear/editar/eliminar facturas, proveedores, etc.
4. Verifica que los archivos se suban correctamente al bucket
5. Verifica la sincronización en tiempo real abriendo la app en dos pestañas diferentes
