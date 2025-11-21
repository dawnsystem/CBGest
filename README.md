<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CBGest - Sistema de Gestión Contable

Sistema de gestión contable para comunidades de bienes con integración de IA para análisis automático de facturas y extractos bancarios.

## Características

- 📊 **Dashboard financiero** con métricas en tiempo real
- 🤖 **Análisis automático de facturas** con Google Gemini AI
- 🏦 **Conciliación bancaria** automática
- 📈 **Modelos fiscales** (303, 184, 111)
- 👥 **Gestión de socios** y participaciones
- 🔐 **Autenticación** con Appwrite
- ☁️ **Backend en la nube** con Appwrite o almacenamiento local

## Requisitos Previos

- **Node.js** (v16 o superior)
- **Cuenta de Appwrite** (opcional, para usar backend en la nube)
- **API Key de Google Gemini** (para análisis de documentos)

## Instalación

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/dawnsystem/CBGest.git
   cd CBGest
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**

   Crea un archivo `.env.local` en la raíz del proyecto:
   ```env
   VITE_GEMINI_API_KEY=tu-api-key-de-gemini
   ```

4. **Configura Appwrite (si usas backend en la nube):**

   Las colecciones de Appwrite están configuradas en `/config/appwrite.ts`. Necesitas crear las siguientes colecciones en tu proyecto de Appwrite:

   - `invoices` - Facturas
   - `entries` - Asientos contables
   - `transactions` - Transacciones bancarias
   - `settings` - Configuración
   - `notifications` - Notificaciones ⚠️
   - `uploads` - Cola de uploads ⚠️

   **Opción A: Automática (Recomendado)**

   Usa el script de configuración automática:
   ```bash
   # Configura tu API Key de Appwrite
   export APPWRITE_API_KEY="tu-api-key"

   # Ejecuta el script
   node scripts/setup-appwrite-collections.js
   ```

   **Opción B: Manual**

   Sigue las instrucciones detalladas en [docs/APPWRITE_SETUP.md](docs/APPWRITE_SETUP.md)

5. **Inicia la aplicación:**
   ```bash
   npm run dev
   ```

   La aplicación estará disponible en `http://localhost:5173`

## Configuración de Appwrite

El proyecto está configurado para usar el siguiente proyecto de Appwrite:

- **Endpoint:** `https://fra.cloud.appwrite.io/v1`
- **Project ID:** `cbgest`
- **Database ID:** `691f288100019843d43e`

Las colecciones `notifications` y `uploads` **deben ser creadas manualmente** en tu proyecto de Appwrite. Consulta la documentación completa:

📖 **[Guía de Configuración de Appwrite](docs/APPWRITE_SETUP.md)**

## Desarrollo

### Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build` - Compila la aplicación para producción
- `npm run preview` - Previsualiza la build de producción
- `npm test` - Ejecuta las pruebas
- `npm run test:ui` - Ejecuta las pruebas con interfaz UI

### Estructura del Proyecto

```
CBGest/
├── components/          # Componentes React
├── context/            # Context providers (Auth, Notifications, etc.)
├── services/           # Servicios (Appwrite, Gemini)
├── utils/              # Utilidades
├── config/             # Configuración
├── scripts/            # Scripts de automatización
├── docs/               # Documentación
└── types.ts            # Definiciones de tipos TypeScript
```

## Documentación Adicional

- 📚 [Configuración de Appwrite](docs/APPWRITE_SETUP.md) - Guía detallada de configuración
- 🔧 [Scripts de Configuración](scripts/README.md) - Scripts de automatización

## Tecnologías

- **Frontend:** React + TypeScript + Vite
- **UI:** Tailwind CSS + Lucide Icons
- **Backend:** Appwrite (Cloud Database, Auth, Storage)
- **IA:** Google Gemini API
- **PDF Processing:** PDF.js
- **Testing:** Vitest

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la licencia MIT.

## Soporte

Si encuentras algún problema o tienes preguntas:

- 🐛 [Reportar un bug](https://github.com/dawnsystem/CBGest/issues)
- 💬 [Discusiones](https://github.com/dawnsystem/CBGest/discussions)
