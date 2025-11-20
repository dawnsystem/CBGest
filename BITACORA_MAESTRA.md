# 📝 Bitácora Maestra del Proyecto: GestCB - Contabilidad para Comunidades de Bienes
*Última actualización: 2025-11-18 22:00:00 UTC*

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP)
*   **Identificador de Tarea:** TSK-021
*   **Objetivo Principal:** Simulador IRPF para comuneros y Dashboard en tiempo real.
*   **Estado Detallado:** Conectando widgets del dashboard a array de facturas real. Implementando formulario de datos fiscales personales para socios.
*   **Próximo Micro-Paso Planificado:** Generar PDF borrador de simulación fiscal.

### ✅ Historial de Implementaciones Completadas
*   **[2025-11-18] - `TSK-020` - Real-Time Dashboard:** Conexión de gráficos y métricas a datos reales.
*   **[2025-11-18] - `TSK-019` - Smart Accounting:** Asignación automática de cuentas PGC con Gemini y selector UI con buscador.
*   **[2025-11-18] - `TSK-018` - Data Integrity & UX:** Serialización de adjuntos (Base64) en objetos de dominio. Indicadores visuales de modo seguro en Header y Settings.
*   **[2025-11-18] - `TSK-017` - UX Data Source:** Indicadores visuales de fuente activa, confirmaciones de seguridad y desconexión de modo archivo.
*   **[2025-11-18] - `FIX-016` - File System Safety:** Manejo de errores Cross-Origin para FileSystem API en iframes.
*   **[2025-11-18] - `TSK-015` - Local File Mode:** Implementación de API FileSystemHandle con cifrado AES-GCM (.gestcb).
*   **[2025-11-18] - `TSK-014` - Persistencia de Datos:** Eliminación de mocks. Implementación de LocalStorage robusto. Panel de Backup/Restore JSON.
*   **[2025-11-18] - `TSK-013` - Conciliación:** Módulo de conciliación bancaria y parser BBVA.
*   **[2025-11-18] - `TSK-011` - Contabilidad Editable:** Libro diario con CRUD completo (Manual/Auto).
*   **[2025-11-18] - `FIX-013` - Estabilidad PDF:** Corrección de concurrencia en renderizado.
*   **[2025-11-18] - `FIX-012` - Renderizado Cliente:** Implementación de PDF.js.
*   **[2025-11-18] - `TSK-010` - Filtrado Contable:** Filtros por fecha y cuenta en Libro Diario.
*   **[2025-11-18] - `FIX-010` - Notificaciones:** Flag `notificationDismissed` para evitar borrado accidental.
*   **[2025-11-18] - `TSK-009` - Persistencia Borradores:** Sistema de localStorage para cola de subida.
*   **[2025-11-18] - `TSK-008` - Visualización Universal:** Modal de documentos y campo file en facturas.
*   **[2025-11-18] - `TSK-007` - Background Processing:** Cola de subida asíncrona y widget global.
*   **[2025-11-18] - `TSK-006` - Adaptación Mobile-First:** Navegación inferior y layouts adaptativos.
*   **[2025-11-18] - `TSK-005` - UX/UI:** Historial de facturas colapsable y Libro Mayor.
*   **[2025-11-18] - `TSK-004` - Adaptación Sectorial:** Configuración para CB Inmobiliarias (Exentas IVA).
*   **[2025-11-18] - `TSK-002` - Mejora Core & Compliance:** Validación NIF, PDF, Historial y Estados.
*   **[2025-11-18] - `TSK-INIT` - Inicialización del Proyecto:** Arquitectura base.

---

## 🔬 Registro Forense de Sesiones

### Sesión Iniciada: 2025-11-18 22:00:00 UTC

*   **Directiva del Director:** "Arreglar dashboard con datos reales y crear widget de estimación IRPF para comuneros con generación de borrador".
*   **Acciones Realizadas:**
    1.  **`types.ts`**: Añadida interfaz `PartnerTaxInfo` para guardar datos personales fiscales (hijos, otros ingresos, etc.).
    2.  **`components/Dashboard.tsx`**:
        *   Reescrita lógica de gráficos para agrupar `invoices` por mes dinámicamente.
        *   Añadido nuevo widget "Estimación Renta (IRPF)" que usa los datos fiscales personales.
    3.  **`components/PartnerTaxForm.tsx`**: Nuevo componente modal para introducir datos fiscales personales.
    4.  **`components/TaxModels.tsx`**: Integración de botón para generar borrador IRPF.
    5.  **`utils/taxCalculator.ts`**: (Simulado dentro del componente por ahora) Lógica básica de escalas IRPF.
