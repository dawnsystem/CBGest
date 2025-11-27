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
| `APPWRITE_API_KEY` | API Key con permisos de Database | (crear en Settings > API Keys) |
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
