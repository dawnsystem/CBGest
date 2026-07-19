<div align="center">
<img width="1200" height="475" alt="CBGest Banner" src="./assets/banner.png" />
</div>

# CBGest - Sistema de Gestión Contable para Comunidades de Bienes

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite-f02e65)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38bdf8)

Sistema completo de gestión contable diseñado específicamente para **Comunidades de Bienes (CB)** en España, con integración de IA para análisis automático de facturas y extractos bancarios, gestión de apartamentos turísticos, importación de reservas desde PMS y generación de modelos fiscales.

---

## Capturas de Pantalla

| Dashboard | Facturas | Reservas |
|-----------|----------|----------|
| *Panel general con métricas* | *Análisis IA de facturas* | *Gestión de reservas* |

---

## Funcionalidades Principales

### Dashboard Financiero
- Métricas en tiempo real: Ingresos, Gastos y Resultado Neto
- Gráficos de evolución de tesorería por mes
- Estimación de IRPF personalizada por cada comunero
- Búsqueda global de facturas, asientos, proveedores, apartamentos y reservas
- Soporte completo para régimen de **Alquiler Exento de IVA**
- Panel de alertas y avisos fiscales importantes
- Gastos desglosados por apartamento
- Proyecciones de gastos recurrentes
- Rentabilidad por apartamento

### Gestión de Facturas con IA
- Subida de facturas en formato PDF o imagen
- **Análisis automático con Google Gemini 2.5 Flash** que extrae:
  - Datos del emisor (nombre, NIF/CIF, dirección completa)
  - Fecha y número de factura
  - Base imponible, tipo de IVA e importe total
  - Tipo de operación (Ingreso/Gasto)
- **Asignación automática de cuenta contable** según el Plan General Contable (PGC)
- **Detección automática de proveedores existentes** por NIF
- Validación algorítmica de NIF/CIF/NIE españoles
- Estados de factura: Pendiente, Procesada, Pagada
- Creación automática de asientos contables al validar facturas
- Auto-creación de proveedores desde facturas procesadas
- Cola de uploads persistente con progreso visual

### Libro Diario (Contabilidad)
- Gestión completa de asientos contables
- Filtros avanzados por fecha y cuenta contable
- Selector inteligente de cuentas del PGC español (Grupo 6 y 7)
- Creación, edición y eliminación de asientos
- Vinculación de documentos adjuntos a cada asiento
- Indicador visual de conciliación bancaria

### Conciliación Bancaria
- Importación de extractos bancarios desde:
  - Archivos **PDF** (análisis con IA)
  - Archivos **Excel (.xlsx, .xls)** con mapeo automático de columnas
- **Matching automático** entre transacciones bancarias y asientos contables por importe
- Función "CASAR" para vincular transacciones con asientos
- Creación de asientos directamente desde transacciones bancarias no identificadas
- Actualización automática del estado de conciliación

### Gestión de Apartamentos
- CRUD completo de propiedades/apartamentos
- Código identificador y nombre personalizado
- Vinculación de gastos e ingresos por apartamento
- Estadísticas de rentabilidad individual
- Seguimiento de ocupación

### Reservas (Integración PMS)
- **Importación de reservas desde CSV** (compatible con NoBeds y otros PMS)
- Sistema de **upsert inteligente**: crea nuevas o actualiza existentes por número de reserva
- Matching automático de apartamentos por nombre
- Canales soportados: Booking, Airbnb, Direct, Agoda, Vrbo, Otros
- Estados de reserva: New, Confirmed, Paid, PaidCC, Cancelled, Completed
- **Reservas canceladas ocultas por defecto** (con checkbox para mostrarlas)
- **Canceladas excluidas de totales** (reservas, noches, importes)
- GDPR: Solo se almacenan iniciales del huésped, no datos personales completos
- Vinculación manual de reservas a apartamentos
- Resumen: Total creadas, actualizadas y errores tras importación

### Gastos Recurrentes
- Definición de gastos periódicos por apartamento
- Frecuencias: Mensual, Bimensual, Trimestral, Anual
- Proyección automática de gastos futuros
- Importes editables por mes
- Gráficos de distribución por categoría

### Modelos Fiscales
- **Modelo 303** (Autoliquidación IVA) - Solo en régimen general
- **Modelo 184** (Declaración Informativa de Entidades en Atribución de Rentas):
  - Cálculo automático del rendimiento neto
  - Distribución proporcional por participación de cada comunero
  - Simulación de certificados para la declaración de la Renta

### Gestión de Proveedores
- CRUD completo de proveedores
- Búsqueda por nombre, NIF o email
- Tipos de identificación: CIF, NIF, NIE, DNI, Pasaporte, VAT
- Datos de contacto: dirección, ciudad, código postal, país, email, teléfono
- Creación automática de proveedores desde facturas validadas

### Gestión de Comuneros
- Alta y baja de socios comuneros
- Definición de porcentajes de participación
- Datos fiscales individuales para simulación de IRPF:
  - Año de nacimiento, nivel de discapacidad
  - Hijos y ascendientes a cargo (con discapacidad)
  - Otros ingresos del trabajo
  - Contribuciones a planes de pensiones
  - Número de pagadores e importe del segundo pagador
  - Declaración conjunta
- Validación de que las participaciones sumen 100%

### Sistema de Notificaciones
- Notificaciones en tiempo real vía Appwrite Realtime
- Centro de notificaciones con badge de no leídas
- Tipos: info, success, warning, error
- Marcar como leídas individual o todas
- Eliminar todas las notificaciones

### Seguridad y Rendimiento
- Autenticación con Appwrite (email/password)
- Auto-logout por inactividad (15 minutos)
- Health checks periódicos de sesión
- **Rate limiting** para evitar sobrecarga de API
- **Caché inteligente** con TTL por colección
- **Debounce** para updates frecuentes
- Grace period post-login para evitar falsos 401

---

## Stack Tecnológico

| Categoría | Tecnología | Versión |
|-----------|------------|---------|
| **Frontend** | React + TypeScript | 19.0 / 5.6 |
| **Build Tool** | Vite | 6.0 |
| **Estilos** | Tailwind CSS | 4.0 |
| **Iconos** | Lucide React | - |
| **Gráficos** | Recharts | - |
| **Backend/BaaS** | Appwrite Cloud | - |
| **IA** | Google Gemini 2.5 Flash | - |
| **PDF Parsing** | PDF.js (pdfjs-dist) | - |
| **Excel Parsing** | read-excel-file | - |
| **PDF Generation** | jsPDF | - |
| **Routing** | React Router DOM | 7.x |
| **Testing** | Vitest | - |

---

## Requisitos Previos

- **Node.js** v18 o superior (recomendado v20+)
- **npm** v9+ o **yarn** v1.22+
- **API Key de Google Gemini** (para análisis de documentos con IA)
- Cuenta de usuario en la instancia Appwrite de CBGest

---

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
# Al menos una key de IA (recomendado: varias para failover automático)
VITE_GEMINI_API_KEY=tu-api-key-de-gemini
VITE_GROQ_API_KEY=tu-api-key-de-groq
VITE_OPENROUTER_API_KEY=tu-api-key-de-openrouter
# Opcional: modelo free de OpenRouter con visión
# VITE_OPENROUTER_MODEL=qwen/qwen2.5-vl-72b-instruct:free
```

### 4. Iniciar la aplicación
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

---

## Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `VITE_GEMINI_API_KEY` | API Key de Google Gemini (visión + PDF nativo) | Recomendada |
| `VITE_GROQ_API_KEY` | API Key de Groq (Llama Vision, capa free) | No |
| `VITE_OPENROUTER_API_KEY` | API Key de OpenRouter (modelos `:free`) | No |
| `VITE_OPENROUTER_MODEL` | Modelo OpenRouter (default Qwen2.5-VL free) | No |

Con varias keys configuradas, CBGest rota automáticamente si un proveedor agota cuota o falla al leer una factura (configurable en Ajustes → Lectura de facturas).

---

## Configuración de Appwrite

El proyecto usa una instancia de Appwrite Cloud preconfigurada:

| Configuración | Valor |
|--------------|-------|
| **Endpoint** | `https://fra.cloud.appwrite.io/v1` |
| **Project ID** | `cbgest` |
| **Database ID** | `691f288100019843d43e` |
| **Bucket ID** | `691f31c9000fc8c83ab1` |

### Colecciones

| Colección | Descripción |
|-----------|-------------|
| `invoices` | Facturas de ingresos y gastos |
| `entries` | Asientos contables del libro diario |
| `transactions` | Transacciones bancarias importadas |
| `settings` | Configuración de la CB (datos fiscales, comuneros) |
| `notifications` | Notificaciones de usuario |
| `uploads` | Cola de uploads persistente |
| `suppliers` | Proveedores |
| `apartments` | Apartamentos/Propiedades |
| `recurring_expenses` | Gastos recurrentes |
| `reservations` | Reservas de alquiler turístico |
| `ai_match_history` | Historial de matching IA |

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build de producción |
| `npm test` | Ejecutar tests |
| `npm run test:ui` | Tests con interfaz visual |

---

## Estructura del Proyecto

```
CBGest/
├── components/                  # Componentes React
│   ├── Dashboard.tsx            # Panel principal con métricas
│   ├── InvoiceUploader.tsx      # Subida y análisis de facturas
│   ├── AccountingBooks.tsx      # Libro diario contable
│   ├── BankReconciliation.tsx   # Conciliación bancaria
│   ├── TaxModels.tsx            # Modelos fiscales (303, 184)
│   ├── Suppliers.tsx            # Gestión de proveedores
│   ├── Settings.tsx             # Configuración
│   ├── ReservationManager.tsx   # Gestión de reservas
│   ├── ApartmentsManager.tsx    # Gestión de apartamentos
│   ├── RecurringExpenses.tsx    # Gastos recurrentes
│   ├── ExpensesByApartment.tsx  # Gastos por apartamento
│   ├── ExpenseProjections.tsx   # Proyecciones de gastos
│   ├── ProfitabilityByApartment.tsx # Rentabilidad
│   ├── PartnerTaxForm.tsx       # Formulario datos fiscales comunero
│   ├── NotificationCenter.tsx   # Centro de notificaciones
│   ├── Login.tsx                # Autenticación
│   ├── MainLayout.tsx           # Layout principal con navegación
│   └── ...
├── context/                     # Context Providers
│   ├── AuthContext.tsx          # Autenticación y sesión
│   ├── NotificationContext.tsx  # Sistema de notificaciones
│   └── UploadQueueContext.tsx   # Cola de uploads persistente
├── services/                    # Servicios externos
│   ├── appwriteService.ts       # CRUD con Appwrite
│   ├── authService.ts           # Autenticación
│   ├── geminiService.ts         # Análisis IA de documentos
│   └── xlsxMappingService.ts    # Mapeo de Excel
├── lib/                         # Librerías internas
│   └── appwrite/
│       ├── client.ts            # Cliente Appwrite singleton
│       ├── protectedDatabase.ts # DB con rate limiting y caché
│       ├── rateLimiter.ts       # Control de rate limiting
│       ├── cache.ts             # Sistema de caché
│       └── offlineQueue.ts      # Cola offline
├── utils/                       # Utilidades
│   ├── validators.ts            # Validación NIF/CIF/NIE/IBAN
│   ├── accountingPlan.ts        # Plan General Contable (PGC)
│   ├── crypto.ts                # Cifrado de datos
│   └── pdfLoader.ts             # Carga de PDFs
├── types/                       # Tipos adicionales
│   └── gemini.ts                # Tipos para respuestas de Gemini
├── config/                      # Configuración
│   └── appwrite.ts              # Config de Appwrite
├── types.ts                     # Definiciones TypeScript principales
├── App.tsx                      # Componente principal
├── index.tsx                    # Entry point
├── index.css                    # Estilos globales (Tailwind)
└── vite.config.ts               # Configuración Vite
```

---

## Arquitectura

CBGest sigue una arquitectura en capas:

```
┌─────────────────────────────────────────────┐
│              UI Layer (React)               │
│   Components con lazy loading/code splitting│
├─────────────────────────────────────────────┤
│            Context Layer                    │
│  AuthContext │ NotificationContext │ Upload │
├─────────────────────────────────────────────┤
│            Service Layer                    │
│  appwriteService │ authService │ gemini    │
├─────────────────────────────────────────────┤
│         Protected Database Layer            │
│  Rate Limiting │ Caching │ Debounce         │
├─────────────────────────────────────────────┤
│            Appwrite Client                  │
│        (Singleton - account, db, storage)   │
└─────────────────────────────────────────────┘
```

### Patrones Utilizados

- **Service Layer Pattern**: Separación de lógica de negocio
- **Singleton**: Cliente Appwrite único
- **Provider Pattern**: Context API para estado global
- **Optimistic Updates**: Actualización inmediata con rollback si falla
- **Lazy Loading**: Code splitting con React.lazy para mejor rendimiento
- **Debounce**: Agrupación de updates frecuentes

---

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
3. Si es Excel, el sistema mapea las columnas automáticamente
4. Ir a **Conciliación Bancaria**
5. Seleccionar una transacción del banco (panel izquierdo)
6. Ver coincidencias automáticas por importe (panel derecho)
7. Pulsar **"CASAR"** para vincular transacción con asiento

### Importar reservas desde PMS
1. Exportar reservas desde tu PMS (NoBeds, etc.) en formato CSV
2. Ir a **Reservas** > Clic en "Importar CSV"
3. Seleccionar el archivo CSV
4. Revisar la vista previa de importación
5. Confirmar importación
6. El sistema creará reservas nuevas o actualizará las existentes (upsert por nº reserva)
7. Ver resumen: X creadas, Y actualizadas, Z errores

### Generar informes fiscales
1. Ir a **Modelos Fiscales**
2. Ver cálculo automático del Modelo 184 (anual)
3. Si régimen general, ver también Modelo 303 (IVA trimestral)
4. Generar PDF para presentación

---

## Regímenes Fiscales Soportados

| Régimen | Descripción | Modelos |
|---------|-------------|---------|
| **General** | Actividad económica con IVA | 303 + 184 |
| **Alquiler Exento** | Arrendamiento de inmuebles (sin IVA) | Solo 184 |

---

## Formato CSV de Reservas

El sistema espera el siguiente formato CSV (compatible con NoBeds):

```
Alojamiento;llegada;salida;;noches;precio/noche;total;pagado;nombre;...;canal;nº reserva;estado
```

**Especificaciones:**
- Separador: punto y coma (;)
- Formato de números: español (1.234,56)
- Sin línea de cabecera
- Columnas: 0=Alojamiento, 1=llegada, 2=salida, 4=noches, 5=precio/noche, 6=total, 7=pagado, 8=nombre cliente, 13=canal, 14=nº reserva, 15=estado

**Estados soportados:** New, Confirmed, Paid, PaidCC, Cancelled, Completed

---

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

---

## Roadmap / TODO

Basado en la auditoría del código, estas son las mejoras planificadas:

- [ ] Añadir tests unitarios para lógica crítica (validators, services)
- [ ] Implementar modo offline con sincronización
- [ ] Añadir filtros de fecha en reservas
- [ ] Exportación de datos a Excel/PDF
- [ ] Notificaciones push (PWA)
- [ ] Multi-idioma (i18n)
- [ ] Dashboard de métricas avanzadas
- [ ] Integración directa con APIs de Booking/Airbnb

---

## Contribuir

Las contribuciones son bienvenidas:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/NuevaFuncionalidad`)
3. Commit tus cambios (`git commit -m 'feat: añadir nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/NuevaFuncionalidad`)
5. Abre un Pull Request

### Convenciones de Código

- **Idioma de código**: Inglés
- **Idioma de documentación**: Español
- **Idioma de UI**: Español
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

---

## Changelog

### v1.2.0 (2024-11)
- Sistema de importación CSV con upsert inteligente
- Gestión de reservas canceladas (ocultas por defecto)
- Exclusión de canceladas en totales y estadísticas
- Checkbox "Mostrar canceladas" en filtros
- Mejoras en filtros de reservas

### v1.1.0 (2024-10)
- Gestión de apartamentos
- Gastos recurrentes con proyecciones
- Rentabilidad por apartamento
- Sistema de reservas básico
- Mejoras en Dashboard

### v1.0.0 (2024-09)
- Versión inicial
- Gestión de facturas con IA (Gemini 2.5 Flash)
- Libro diario contable
- Conciliación bancaria
- Modelos fiscales (303, 184)
- Gestión de proveedores y comuneros
- Sistema de notificaciones

---

## Licencia

Este proyecto está bajo la licencia MIT.

---

## Soporte

- [Reportar un bug](https://github.com/dawnsystem/CBGest/issues)
- [Discusiones](https://github.com/dawnsystem/CBGest/discussions)

---

**CBGest** - Gestión contable inteligente para Comunidades de Bienes
