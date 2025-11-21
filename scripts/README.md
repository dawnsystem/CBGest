# Scripts de Configuración

Este directorio contiene scripts de utilidad para configurar y mantener el proyecto CBGest.

## setup-appwrite-collections.js

Script para crear automáticamente las colecciones de Appwrite necesarias para la aplicación.

### Requisitos

1. Node.js instalado
2. SDK de Appwrite para Node.js:
   ```bash
   npm install node-appwrite
   ```
3. Una API Key de Appwrite con permisos de Database

### Obtener una API Key

1. Ve a https://cloud.appwrite.io/
2. Inicia sesión y selecciona el proyecto `cbgest`
3. Ve a **Settings** → **API Keys**
4. Haz clic en **Create API Key**
5. Dale un nombre (ej: "Setup Script")
6. Selecciona los siguientes scopes:
   - `databases.read`
   - `databases.write`
   - `collections.read`
   - `collections.write`
   - `attributes.read`
   - `attributes.write`
   - `indexes.read`
   - `indexes.write`
7. Copia la API Key generada

### Uso

1. Configura la API Key como variable de entorno:
   ```bash
   export APPWRITE_API_KEY="tu-api-key-aqui"
   ```

2. Ejecuta el script:
   ```bash
   node scripts/setup-appwrite-collections.js
   ```

3. El script creará automáticamente:
   - Colección `notifications` con todos sus atributos e índices
   - Colección `uploads` con todos sus atributos e índices

### Qué hace el script

El script realiza las siguientes operaciones:

1. **Crea las colecciones** `notifications` y `uploads` si no existen
2. **Configura permisos** para que cualquier usuario autenticado pueda CRUD
3. **Crea atributos** de cada colección con los tipos y tamaños correctos
4. **Crea índices** para optimizar las consultas

### Errores comunes

**Error: "APPWRITE_API_KEY environment variable is required"**
- Solución: Configura la variable de entorno antes de ejecutar el script

**Error: "Resource already exists (409)"**
- Solución: La colección o atributo ya existe. El script lo detecta y continúa

**Error: "Unauthorized (401)"**
- Solución: Verifica que tu API Key tenga los permisos correctos

**Error: "Rate limit exceeded"**
- Solución: Espera unos minutos y vuelve a ejecutar el script

### Verificación

Después de ejecutar el script, verifica en Appwrite Console:

1. Las colecciones `notifications` y `uploads` deben existir
2. Cada colección debe tener todos sus atributos
3. Los índices deben estar creados
4. Los permisos deben permitir operaciones CRUD para usuarios autenticados

### Alternativa Manual

Si prefieres crear las colecciones manualmente, consulta el documento:
[docs/APPWRITE_SETUP.md](../docs/APPWRITE_SETUP.md)
