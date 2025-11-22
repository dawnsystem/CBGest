<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CBGest - Sistema de Gestión Contable para Comunidades de Bienes

Sistema completo de gestión contable diseñado específicamente para **Comunidades de Bienes (CB)** en España, con integración de IA para análisis automático de facturas y extractos bancarios, conciliación bancaria y generación de modelos fiscales.

## Funcionalidades Principales

### Dashboard Financiero
- Métricas en tiempo real: Ingresos, Gastos y Resultado Neto
- Gráficos de evolución de tesorería por mes
- Estimación de IRPF personalizada por cada comunero
- Soporte completo para régimen de **Alquiler Exento de IVA**
- Panel de alertas y avisos fiscales importantes

### Gestión de Facturas con IA
- Subida de facturas en formato PDF o imagen
- **Análisis automático con Google Gemini AI** que extrae:
  - Datos del emisor (nombre, NIF/CIF, dirección)
  - Fecha y número de factura
  - Base imponible, tipo de IVA e importe total
  - Tipo de operación (Ingreso/Gasto)
- **Asignación automática de cuenta contable** según el Plan General Contable (PGC)
- Validación algorítmica de NIF/CIF/NIE españoles
- Estados de factura: Pendiente, Procesada, Pagada
- Creación automática de asientos contables al validar facturas
- Auto-creación de proveedores desde facturas procesadas

### Libro Diario (Contabilidad)
- Gestión completa de asientos contables
- Filtros avanzados por fecha y cuenta contable
- Selector inteligente de cuentas del PGC español
- Creación, edición y eliminación de asientos
- Vinculación de documentos adjuntos a cada asiento
- Indicador visual de conciliación bancaria

### Conciliación Bancaria
- Importación de extractos bancarios desde:
  - Archivos **PDF** (análisis con IA)
  - Archivos **Excel (.xlsx, .xls)** con mapeo manual de columnas
- **Matching automático** entre transacciones bancarias y asientos contables por importe
- Función "CASAR" para vincular transacciones con asientos
- Creación de asientos directamente desde transacciones bancarias no identificadas
- Actualización automática del estado de conciliación

### Modelos Fiscales
- **Modelo 303** (Autoliquidación IVA) - Solo en régimen general
- **Modelo 184** (Declaración Informativa de Entidades en Atribución de Rentas):
  - Cálculo automático del rendimiento neto
  - Distribución proporcional por participación de cada comunero
  - Simulación de certificados para la declaración de la Renta

### Gestión de Proveedores
- CRUD completo de proveedores
- Búsqueda por nombre, NIF o email
- Tipos de identificación: CIF, NIF, NIE, DNI, Pasaporte
- Datos de contacto: dirección, ciudad, código postal, email, teléfono
- Creación automática de proveedores desde facturas validadas

### Gestión de Comuneros
- Alta y baja de socios comuneros
- Definición de porcentajes de participación
- Datos fiscales individuales para simulación de IRPF
- Validación de que las participaciones sumen 100%

### Configuración y Datos
- **Datos Fiscales**: Nombre CB, NIF, Régimen fiscal
- **Modos de almacenamiento**:
  - Navegador Local (localStorage)
  - Backend en la nube con **Appwrite**
- Cifrado de datos para archivos locales

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| **Frontend** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Estilos** | Tailwind CSS |
| **Iconos** | Lucide React |
| **Gráficos** | Recharts |
| **Backend/BaaS** | Appwrite Cloud |
| **IA** | Google Gemini 2.5 Flash |
| **PDF** | PDF.js (pdfjs-dist) |
| **Excel** | read-excel-file |
| **Testing** | Vitest |
| **Routing** | React Router DOM |

## Requisitos Previos

- **Node.js** v16 o superior
- **npm** o **yarn**
- **API Key de Google Gemini** (para análisis de documentos)
- **Cuenta de Appwrite** (opcional, para backend en la nube)

## Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/dawnsystem/CBGest.git
cd CBGest
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# API Key de Google Gemini (obligatorio para análisis de facturas)
API_KEY=tu-api-key-de-gemini
```

### 4. Iniciar la aplicación
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## Configuración de Appwrite

El proyecto incluye configuración predeterminada para Appwrite en `/config/appwrite.ts`:

| Configuración | Valor |
|--------------|-------|
| **Endpoint** | `https://fra.cloud.appwrite.io/v1` |
| **Project ID** | `cbgest` |
| **Database ID** | `691f288100019843d43e` |

### Colecciones necesarias

| Colección | ID | Descripción |
|-----------|-----|-------------|
| `invoices` | `691f28b000299eed36d5` | Facturas |
| `entries` | `691f28c000182c2e0d3b` | Asientos contables |
| `transactions` | `691f28d40011bcc80821` | Transacciones bancarias |
| `settings` | `691f28e30032b62ccc4d` | Configuración |
| `notifications` | `691f34040009ea76cb8e` | Notificaciones |
| `uploads` | `691f341300254d98ab8d` | Cola de uploads |
| `suppliers` | `692af7070009e1b1ae41` | Proveedores |

### Configuración automática

```bash
# Configura tu API Key de Appwrite
export APPWRITE_API_KEY="tu-api-key"

# Ejecuta el script de configuración
node scripts/setup-appwrite-collections.js
```

Para configuración manual, consulta [docs/APPWRITE_SETUP.md](docs/APPWRITE_SETUP.md).

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build de producción |
| `npm test` | Ejecutar tests |
| `npm run test:ui` | Tests con interfaz visual |

## Estructura del Proyecto

```
CBGest/
├── components/              # Componentes React
│   ├── Dashboard.tsx        # Panel principal con métricas
│   ├── InvoiceUploader.tsx  # Subida y análisis de facturas
│   ├── AccountingBooks.tsx  # Libro diario contable
│   ├── BankReconciliation.tsx # Conciliación bancaria
│   ├── TaxModels.tsx        # Modelos fiscales (303, 184)
│   ├── Suppliers.tsx        # Gestión de proveedores
│   ├── Settings.tsx         # Configuración
│   ├── Login.tsx            # Autenticación
│   └── ...
├── context/                 # Context Providers
│   ├── AuthContext.tsx      # Autenticación
│   ├── NotificationContext.tsx # Notificaciones
│   └── UploadQueueContext.tsx  # Cola de uploads
├── services/                # Servicios externos
│   ├── appwriteService.ts   # CRUD con Appwrite
│   ├── geminiService.ts     # Análisis IA de documentos
│   └── xlsxMappingService.ts # Mapeo de Excel
├── utils/                   # Utilidades
│   ├── validators.ts        # Validación NIF/CIF
│   ├── accountingPlan.ts    # Plan General Contable
│   ├── crypto.ts            # Cifrado de datos
│   └── pdfLoader.ts         # Carga de PDFs
├── config/                  # Configuración
│   └── appwrite.ts          # Config de Appwrite
├── types.ts                 # Definiciones TypeScript
├── App.tsx                  # Componente principal
└── index.tsx                # Entry point
```

## Flujos de Trabajo

### Procesar una factura
1. Ir a **Facturas** > Seleccionar "Facturas/Tickets"
2. Arrastrar o seleccionar el archivo PDF/imagen
3. La IA analiza y extrae los datos automáticamente
4. Revisar y corregir si es necesario
5. Elegir **"Guardar Borrador"** (solo guarda) o **"Validar y Contabilizar"** (crea asiento)

### Conciliar transacciones bancarias
1. Ir a **Facturas** > Seleccionar "Extracto Bancario"
2. Subir PDF o Excel del extracto bancario
3. Si es Excel, mapear las columnas correspondientes
4. Ir a **Conciliación Bancaria**
5. Seleccionar una transacción del banco (panel izquierdo)
6. Ver coincidencias automáticas por importe (panel derecho)
7. Pulsar **"CASAR"** para vincular transacción con asiento

### Generar informes fiscales
1. Ir a **Modelos Fiscales**
2. Ver cálculo automático del Modelo 184 (anual)
3. Si régimen general, ver también Modelo 303 (IVA trimestral)
4. Generar PDF para presentación

## Regímenes Fiscales Soportados

| Régimen | Descripción | Modelos |
|---------|-------------|---------|
| **General** | Actividad económica con IVA | 303 + 184 |
| **Alquiler Exento** | Arrendamiento de inmuebles (sin IVA) | Solo 184 |

## Testing

```bash
# Ejecutar todos los tests
npm test

# Tests en modo watch
npm test -- --watch

# Tests con coverage
npm test -- --coverage

# Tests con UI
npm run test:ui
```

## Contribuir

Las contribuciones son bienvenidas:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/NuevaFuncionalidad`)
3. Commit tus cambios (`git commit -m 'feat: añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/NuevaFuncionalidad`)
5. Abre un Pull Request

## Documentación Adicional

- [Configuración de Appwrite](docs/APPWRITE_SETUP.md)
- [Scripts de Automatización](scripts/README.md)

## Licencia

Este proyecto está bajo la licencia MIT.

## Soporte

- [Reportar un bug](https://github.com/dawnsystem/CBGest/issues)
- [Discusiones](https://github.com/dawnsystem/CBGest/discussions)

---

**CBGest** - Gestión contable inteligente para Comunidades de Bienes
