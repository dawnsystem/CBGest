# 🚀 Guía de Configuración de Appwrite - CBGest

Esta guía te ayudará a configurar Appwrite como backend para CBGest.

---

## 📋 ¿Qué es Appwrite?

**Appwrite** es una plataforma BaaS (Backend as a Service) open-source que proporciona:

- 🔐 **Auth**: Autenticación de usuarios (email/password, OAuth, etc.)
- 💾 **Database**: Base de datos NoSQL con consultas en tiempo real
- 📦 **Storage**: Almacenamiento de archivos seguros
- ⚡ **Functions**: Funciones serverless
- 📨 **Messaging**: Notificaciones y emails
- 🔄 **Realtime**: Sincronización en tiempo real

### Opciones de Despliegue

1. **Appwrite Cloud** (Recomendado)

   - Gratis hasta cierto límite
   - Sin necesidad de servidor
   - URL: https://cloud.appwrite.io
2. **Self-Hosted**

   - Docker en tu servidor
   - Control total
   - Requiere mantenimiento

---

## 🎯 OPCIÓN 1: Appwrite Cloud (Recomendado)

### Paso 1: Crear Cuenta en Appwrite Cloud

1. Ve a: https://cloud.appwrite.io
2. Haz clic en "Sign Up"
3. Regístrate con email/Google/GitHub
4. Verifica tu email

### Paso 2: Crear Nuevo Proyecto

1. En el dashboard, haz clic en **"Create Project"**
2. Nombre del proyecto: `CBGest`
3. **Copia el Project ID** (lo necesitarás después)

### Paso 3: Configurar Platform (Web)

1. Ve a **"Settings" → "Platforms"**
2. Haz clic en **"Add Platform" → "Web App"**
3. Configura:
   ```
   Name: CBGest Local
   Hostname: localhost
   ```
4. Si vas a desplegar en producción, añade también:
   ```
   Name: CBGest Production
   Hostname: tudominio.com
   ```

### Paso 4: Crear Base de Datos

1. Ve a **"Databases"** en el menú lateral
2. Haz clic en **"Create Database"**
3. Nombre: `gestcb_main`
4. **Copia el Database ID**

### Paso 5: Crear Colecciones (Collections)

Necesitas crear 4 colecciones:

#### A) Collection: `invoices`

1. En tu database, haz clic en **"Create Collection"**
2. Nombre: `invoices`
3. **Permissions:**

   - Role: `users` → Read, Create, Update, Delete
4. **Attributes** (añade estos campos):

   ```
   - id: String (36 chars, required)
   - number: String (50 chars, required)
   - date: String (20 chars, required)
   - issuerName: String (200 chars, required)
   - issuerNif: String (20 chars, required)
   - baseAmount: Float (required)
   - vatRate: Float (required)
   - vatAmount: Float (required)
   - totalAmount: Float (required)
   - type: String (10 chars, required) // EXPENSE or INCOME
   - status: String (15 chars, required) // PENDING, PROCESSED, PAID
   - category: String (200 chars)
   - fileData: String (10000000 chars) // Base64 del archivo
   - fileType: String (100 chars)
   - history: String (array) (10000 chars) // JSON string
   ```
5. **Copia el Collection ID**

#### B) Collection: `entries`

1. Haz clic en **"Create Collection"**
2. Nombre: `entries`
3. **Permissions:** igual que invoices
4. **Attributes:**

   ```

   - id: String (36 chars, required)
   - date: String (20 chars, required)
   - concept: String (500 chars, required)
   - accountCode: String (20 chars, required)
   - accountName: String (200 chars, required)
   - debit: Float (required)
   - credit: Float (required)
   - invoiceId: String (36 chars)
   - fileData: String (10000000 chars)
   - fileType: String (100 chars)
   - reconciled: Boolean (required)
   ```
5. **Copia el Collection ID**

#### C) Collection: `transactions`

1. Haz clic en **"Create Collection"**
2. Nombre: `transactions`
3. **Permissions:** igual que anteriores
4. **Attributes:**

   ```
   - id: String (36 chars, required)
   - date: String (20 chars, required)
   - valueDate: String (20 chars)
   - concept: String (500 chars, required)
   - amount: Float (required)
   - balance: Float
   - reconciledWithEntryId: String (36 chars)
   - status: String (15 chars, required) // PENDING or MATCHED
   ```
5. **Copia el Collection ID**

#### D) Collection: `settings`

1. Haz clic en **"Create Collection"**
2. Nombre: `settings`
3. **Permissions:** igual que anteriores
4. **Attributes:**

   ```
   - cbName: String (200 chars, required)
   - nif: String (20 chars, required)
   - fiscalRegime: String (20 chars, required)
   - vatObligation: Boolean (required)
   - partners: String (array) (10000 chars) // JSON string
   ```
5. **Copia el Collection ID**

### Paso 6: Crear Storage Bucket

1. Ve a **"Storage"** en el menú lateral
2. Haz clic en **"Create Bucket"**
3. Nombre: `attachments`
4. **Settings:**
   - File Size Limit: `10 MB`
   - Allowed Extensions: `.pdf, .png, .jpg, .jpeg`
   - Compression: `gzip` (opcional)
5. **Permissions:**
   - Role: `users` → Read, Create, Delete
6. **Copia el Bucket ID**

### Paso 7: Configurar en CBGest

1. Abre CBGest en tu navegador
2. Ve a **"Configuración" → pestaña "Datos y Conexiones"**
3. Haz clic en la tarjeta **"Appwrite Cloud Backend"**
4. Rellena los campos:

   ```
   Endpoint: https://cloud.appwrite.io/v1
   Project ID: [Tu Project ID]
   Database ID: [Tu Database ID]
   Invoices Collection ID: [Tu invoices Collection ID]
   Entries Collection ID: [Tu entries Collection ID]
   Transactions Collection ID: [Tu transactions Collection ID]
   Settings Collection ID: [Tu settings Collection ID]
   Storage Bucket ID: [Tu Bucket ID]
   ```
5. Haz clic en **"Guardar y Activar Appwrite"**
6. Se abrirá un modal de Login/Register
7. Crea tu cuenta o inicia sesión

### Paso 8: ¡Listo!

- Todos tus datos ahora se sincronizan con Appwrite Cloud
- Puedes acceder desde cualquier dispositivo
- Los cambios son en tiempo real
- Los archivos se almacenan en Storage de Appwrite

---

## 🔧 OPCIÓN 2: Self-Hosted (Avanzado)

### Requisitos

- Docker & Docker Compose instalados
- Un servidor (VPS, Raspberry Pi, etc.)
- Puerto 80/443 abierto

### Paso 1: Instalar Appwrite

```bash
# Crear directorio
mkdir appwrite
cd appwrite

# Descargar script de instalación
wget https://appwrite.io/install/compose -O docker-compose.yml

# Iniciar Appwrite
docker compose up -d
```

### Paso 2: Configurar

1. Accede a: `http://tu-ip`
2. Completa el setup inicial
3. Crea tu proyecto
4. Sigue los pasos 4-7 de la opción Cloud (igual proceso)
5. En CBGest, usa tu endpoint: `http://tu-ip/v1`

---

## 📊 Comparación de Modos

| Característica              | LocalStorage | Archivo .gestcb | Appwrite Cloud |
| ---------------------------- | ------------ | --------------- | -------------- |
| **Multi-dispositivo**  | ❌           | ❌              | ✅             |
| **Colaboración**      | ❌           | ❌              | ✅             |
| **Backup automático** | ❌           | Manual          | ✅             |
| **Requiere internet**  | ❌           | ❌              | ✅             |
| **Cifrado**            | ❌           | ✅ (AES-256)    | ✅ (HTTPS)     |
| **Límite de datos**   | ~10MB        | Sin límite     | Plan Free: 2GB |
| **Sincronización RT** | ❌           | ❌              | ✅             |
| **Auth/Usuarios**      | ❌           | ❌              | ✅             |

---

## 🔐 Seguridad

### Appwrite Cloud

- ✅ Cifrado HTTPS por defecto
- ✅ Autenticación robusta
- ✅ Permisos granulares por usuario
- ✅ Backups automáticos
- ✅ ISO 27001 compliant

### Recomendaciones

1. **Usa contraseñas fuertes** (mínimo 12 caracteres)
2. **Activa 2FA** en tu cuenta de Appwrite Cloud
3. **No compartas credenciales**
4. **Revisa los logs de acceso** regularmente

---

## 🐛 Solución de Problemas

### Error: "Project not found"

- Verifica que el **Project ID** sea correcto
- Asegúrate de haber añadido el hostname en Platforms

### Error: "Collection not found"

- Verifica los **Collection IDs**
- Asegúrate de que las collections existen

### Error: "Unauthorized"

- Revisa los **Permissions** de las collections
- Asegúrate de estar autenticado

### Error: "Network request failed"

- Verifica tu conexión a internet
- Comprueba que el **Endpoint** sea correcto
- Revisa el firewall

### Los archivos no se suben

- Verifica el **Bucket ID**
- Comprueba los permisos del bucket
- Revisa el tamaño del archivo (máx 10MB por defecto)

---

## 💡 Tips Profesionales

### Para Desarrollo

1. Crea un proyecto separado para testing
2. Usa el emulador local de Appwrite:
   ```bash
   appwrite client --endpoint http://localhost/v1
   ```

### Para Producción

1. Configura un dominio personalizado
2. Activa SSL/TLS
3. Configura backups automáticos
4. Monitoriza el uso de recursos
5. Establece límites de rate-limiting

### Migración de Datos

Si ya tienes datos en LocalStorage:

1. Exporta usando **"Descargar JSON"**
2. Activa Appwrite
3. Importa los datos (feature próxima)

---

## 📞 Recursos

- **Appwrite Docs**: https://appwrite.io/docs
- **Community Discord**: https://appwrite.io/discord
- **GitHub**: https://github.com/appwrite/appwrite
- **Pricing**: https://appwrite.io/pricing

---

## 🎓 Próximos Pasos

Una vez configurado:

1. **Prueba el sistema:**

   - Crea una factura
   - Verifica que aparece en Appwrite Dashboard
   - Cierra sesión e inicia sesión de nuevo
   - Verifica que los datos persisten
2. **Invita colaboradores:**

   - En Settings → añade más usuarios
   - Asigna permisos específicos
3. **Explora Realtime:**

   - Abre CBGest en dos pestañas
   - Crea una factura en una
   - Observa cómo se sincroniza en la otra
4. **Configura Functions** (opcional):

   - Auto-envío de recordatorios fiscales
   - Generación de PDFs en servidor
   - Notificaciones por email

---

## FASE 1 — Ejercicios Contables (⚠️ ACCIÓN REQUERIDA)

> Esta sección debe completarse **antes** de usar la funcionalidad de Ejercicios Contables.
> Mientras no lo hagas, la app funciona con normalidad pero sin filtrar por ejercicio.

### 1.1 — Crear nueva colección `fiscal_years`

En la base de datos `691f288100019843d43e`, crea una colección con:

- **Collection ID:** `fiscal_years`
- **Name:** `fiscal_years`
- **Permisos:** igual al resto — `read("users")`, `write("users")`

**Atributos:**

| Atributo | Tipo | Tamaño | Requerido |
|----------|------|--------|-----------|
| `year` | Integer | — | ✅ Sí |
| `status` | String | 10 | ✅ Sí |
| `openedAt` | String | 30 | No |
| `closedAt` | String | 30 | No |
| `notes` | String | 500 | No |

**Índice:**
- Atributo: `year`, Tipo: `key`, Unique: `true`, Order: `ASC`

---

### 1.2 — Añadir `fiscalYearId` a colecciones existentes

En cada una de estas colecciones, añade el atributo:

| Atributo | Tipo | Tamaño | Requerido | Default |
|----------|------|--------|-----------|---------|
| `fiscalYearId` | String | 36 | No | `null` |

**Colecciones donde añadirlo:** `invoices`, `entries`, `transactions`, `reservations`, `suppliers`, `apartments`

**Índice en cada colección:**
- Atributo: `fiscalYearId`, Tipo: `key`, Unique: `false`

> **¿Por qué "No requerido"?** Los documentos existentes no tienen este campo.
> Ponlo opcional para que no rompan. La herramienta de migración en la app
> los asignará al ejercicio correcto.

---

### 1.3 — Migración de datos existentes

Una vez creado el setup en Appwrite:

1. Abre la app → Ve a **Ejercicios** (en el sidebar o menú)
2. Crea el **Ejercicio 2025** (o el año que corresponda)
3. Selecciónalo como ejercicio activo
4. Usa el botón **"Migrar al Ejercicio 2025"** en la sección de migración
5. La herramienta asignará automáticamente todos los documentos sin ejercicio

---

¡Disfruta de CBGest con Appwrite! 🎉
