# Appwrite Functions para CBGest

Este directorio contiene las funciones de Appwrite para automatizar tareas en CBGest.

## Funciones disponibles

| Función | Descripción | Schedule/Evento |
|---------|-------------|-----------------|
| `cleanup-uploads` | Limpia uploads completados >7 días | Diario 3 AM |
| `maintenance` | Limpieza notificaciones, integridad datos | Domingos 4 AM |
| `backup-data` | Backup semanal a JSON | Domingos 2 AM |
| `auto-reconcile` | Conciliación automática banco-facturas | Evento: nueva transacción |
| `detect-recurring` | Detecta gastos recurrentes | 1º de cada mes |
| `calculate-profitability` | Rentabilidad mensual por apartamento | 1º de cada mes |
| `prepare-modelo-184` | Prepara datos para declaración anual | 15 de enero |
| `weekly-summary` | Resumen semanal | Lunes 10 AM |
| `manage-users` | Crear/listar/restablecer contraseña/eliminar usuarios (solo admins) | HTTPS (bajo demanda) |

## Despliegue

### Opción 1: Desde Appwrite Console

1. Ve a **Functions** en tu proyecto de Appwrite
2. Selecciona la función creada
3. Ve a **Deployments** > **Create Deployment**
4. Sube un ZIP con el contenido de la carpeta de la función

Para crear el ZIP:
```bash
cd functions/cleanup-uploads
zip -r ../cleanup-uploads.zip .
```

### Opción 2: Con Appwrite CLI

```bash
# Instalar CLI
npm install -g appwrite-cli

# Login
appwrite login

# Desplegar función
appwrite functions createDeployment \
  --functionId cleanup-uploads \
  --entrypoint src/main.js \
  --code ./functions/cleanup-uploads
```

## Variables de entorno requeridas

Configura estas variables en **Function Settings > Variables**:

| Variable | Descripción | Valor |
|----------|-------------|-------|
| `APPWRITE_API_KEY` | API Key con permisos de Database (y `users.read`/`users.write` para `manage-users`) | (crear en Settings > API Keys) |
| `DATABASE_ID` | ID de la base de datos | `691f288100019843d43e` |
| `BACKUP_BUCKET_ID` | ID del bucket para backups (opcional) | `backups` |

> **Nota**: `APPWRITE_FUNCTION_PROJECT_ID` y `APPWRITE_ENDPOINT` se inyectan automáticamente.

## Configurar Schedules

Después de desplegar, configura el schedule en **Function Settings > Schedule**:

- `cleanup-uploads`: `0 3 * * *`
- `maintenance`: `0 4 * * 0`
- `backup-data`: `0 2 * * 0`
- `detect-recurring`: `0 2 1 * *`
- `calculate-profitability`: `0 1 1 * *`
- `prepare-modelo-184`: `0 9 15 1 *`
- `weekly-summary`: `0 10 * * 1`

## Configurar Eventos (auto-reconcile)

Para `auto-reconcile`, configura el evento en **Function Settings > Events**:

```
databases.691f288100019843d43e.collections.bankTransactions.documents.*.create
```

## Configurar `manage-users` (gestión de usuarios sin auto-registro)

Esta función sustituye al auto-registro: el cliente (`Login.tsx`) ya no permite
crear cuentas por sí mismo, y la creación de usuarios se hace desde
**Configuración → Usuarios** dentro de la app, que a su vez ejecuta esta función.

1. Despliega la función con `functionId: manage-users`, entrypoint `src/main.js`.
2. En **Function Settings > Execute Access**, marca **Users** (así la función
   recibe el header `x-appwrite-user-id` de quien la ejecuta y puede verificar
   que sea administrador).
3. Configura la variable `APPWRITE_API_KEY` con una API Key que tenga el scope
   `users.read`, `users.write`.
4. **Bootstrap del primer administrador**: como no hay auto-registro, crea el
   primer usuario manualmente desde **Auth > Users > Create user** en la
   consola de Appwrite y añádele el label `admin` (**Auth > Users > [usuario] >
   Labels**). A partir de ahí, ese usuario ya puede crear al resto desde la app.
5. (Recomendado) En **Auth > Settings**, desactiva **"Self registration"** en el
   proyecto para reforzar en el propio Appwrite que no se permite auto-registro.

### Política SEC-016 (contraseñas temporales)

- Longitud mínima: **16 caracteres** (≥128 bits de entropía si se genera con
  `crypto` / `randomBytes`).
- Se rechaza el patrón legacy predecible `cambiar` + dígitos (~900 valores).
- Si `updateLabels` / `updatePrefs` fallan tras `users.create`, la función hace
  **rollback** eliminando el usuario (BUG-026) para no dejar cuentas usables
  sin `mustChangePassword`.
- Un admin con `prefs.mustChangePassword === true` recibe 403 al invocar la
  función hasta completar el cambio de contraseña.
- Tras desplegar esta versión, vuelve a publicar el deployment de `manage-users`.

## Testing manual

Puedes ejecutar cualquier función manualmente desde la consola:

1. Ve a **Functions > [función] > Execute**
2. Deja el body vacío o añade datos de prueba
3. Click **Execute**
4. Revisa los logs en **Executions**

## Estructura de cada función

```
function-name/
├── src/
│   └── main.js    # Código principal
└── package.json   # Dependencias
```

Todas las funciones usan `node-appwrite` v13+ y ES Modules.
