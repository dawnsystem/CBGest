# 📝 Bitácora Maestra del Proyecto: GestCB - Contabilidad para Comunidades de Bienes
*Última actualización: 2025-11-18 17:30:00 UTC*

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP)
*   **Identificador de Tarea:** FIX-013
*   **Objetivo Principal:** Estabilizar visualizador PDF.
*   **Estado Detallado:** Corrigiendo error "Cannot use the same canvas during multiple render() operations" mediante gestión de cancelación de tareas asíncronas.
*   **Próximo Micro-Paso Planificado:** Pruebas de estrés cambiando páginas rápidamente.

### ✅ Historial de Implementaciones Completadas
*   **[2025-11-18] - `FIX-012` - Renderizado Cliente:** Implementación de PDF.js.
*   **[2025-11-18] - `FIX-011` - Visualización (Intento 1):** Cambio a object tag (fallido en móviles).
*   **[2025-11-18] - `TSK-010` - Filtrado Contable:** Filtros por fecha y cuenta en Libro Diario.
*   **[2025-11-18] - `FIX-010` - Notificaciones:** Flag `notificationDismissed` para evitar borrado accidental.
*   **[2025-11-18] - `TSK-009` - Persistencia:** Sistema de localStorage para borradores.
*   **[2025-11-18] - `TSK-008` - Visualización Universal:** Modal de documentos y campo file en facturas.
*   **[2025-11-18] - `TSK-007` - Background Processing:** Cola de subida asíncrona y widget global.
*   **[2025-11-18] - `TSK-006` - Adaptación Mobile-First:** Navegación inferior y layouts adaptativos.
*   **[2025-11-18] - `TSK-005` - UX/UI:** Historial de facturas colapsable y Libro Mayor.
*   **[2025-11-18] - `TSK-004` - Adaptación Sectorial:** Configuración para CB Inmobiliarias (Exentas IVA).
*   **[2025-11-18] - `TSK-002` - Mejora Core & Compliance:** Validación NIF, PDF, Historial y Estados.
*   **[2025-11-18] - `TSK-INIT` - Inicialización del Proyecto:** Arquitectura base.

---

## 🔬 Registro Forense de Sesiones

### Sesión Iniciada: 2025-11-18 17:30:00 UTC

*   **Directiva del Director:** "Corregir error: Cannot use the same canvas during multiple render() operations".
*   **Análisis:** PDF.js es asíncrono. Si `renderPage` se llama de nuevo (ej. cambio de página) antes de que termine el anterior, el canvas está "sucio".
*   **Plan de Acción:** Implementar `renderTask.cancel()` usando `useRef` para guardar la tarea en vuelo.
*   **Log de Acciones:**
    *   `17:32:00` - **MODIFICACIÓN:** `DocumentViewer.tsx` añadido `renderTaskRef` y lógica de cancelación.
*   **Resultado de la Sesión:** Bug de concurrencia resuelto.