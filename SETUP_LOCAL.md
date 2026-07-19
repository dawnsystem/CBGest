# 🚀 Guía de Instalación Local - CBGest

Esta guía te ayudará a ejecutar CBGest en tu PC local.

---

## 📋 Requisitos Previos

### Software Necesario

1. **Node.js** (versión 18 o superior)
   - Descargar desde: https://nodejs.org/
   - Verifica la instalación: `node --version`

2. **npm** (incluido con Node.js)
   - Verifica la instalación: `npm --version`

3. **Navegador Web Moderno**
   - **Recomendado:** Chrome 86+ o Edge 86+ (para todas las funcionalidades)
   - También compatible: Firefox 90+

### Cuenta de Google AI Studio

Para usar el análisis automático de facturas con IA, necesitas una API Key de Gemini:

1. Ve a: https://aistudio.google.com/app/apikey
2. Inicia sesión con tu cuenta de Google
3. Crea un nuevo proyecto (si no tienes uno)
4. Haz clic en "Create API Key"
5. Copia la clave generada (la necesitarás en el paso 3)

**Nota:** La API de Gemini tiene un plan gratuito generoso. Consulta los límites en: https://ai.google.dev/pricing

---

## ⚙️ Instalación Paso a Paso

### 1️⃣ Clonar o Descargar el Proyecto

Si tienes Git:
```bash
git clone <URL_DEL_REPOSITORIO>
cd CBGest
```

Si descargaste un ZIP:
- Extrae el archivo en una carpeta
- Abre una terminal en esa carpeta

### 2️⃣ Instalar Dependencias

```bash
npm install
```

Este comando descargará todas las librerías necesarias (React, Vite, TypeScript, etc.)

### 3️⃣ Configurar las API Keys de IA (lectura de facturas)

1. Abre (o crea) el archivo `.env.local` en la raíz del proyecto
2. Añade al menos una key (recomendado: varias para failover automático):

```env
VITE_GEMINI_API_KEY=tu-api-key-de-gemini
VITE_GROQ_API_KEY=tu-api-key-de-groq
VITE_OPENROUTER_API_KEY=tu-api-key-de-openrouter
# Opcional:
# VITE_OPENROUTER_MODEL=qwen/qwen2.5-vl-72b-instruct:free
```

3. Guarda el archivo

**⚠️ IMPORTANTE:**
- Usa exactamente el prefijo `VITE_` (Vite solo expone esas vars al cliente)
- En Cursor Cloud Agents: guarda las mismas vars en **Secrets** del entorno (Runtime Secret)
- Nunca compartas este archivo públicamente
- El archivo `.env.local` ya está en `.gitignore` para proteger tus claves

### 4️⃣ Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

Verás algo como:
```
  VITE v6.2.0  ready in XXX ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.X.X:3000/
  ➜  press h + enter to show help
```

### 5️⃣ Abrir la Aplicación

1. Abre tu navegador
2. Ve a: **http://localhost:3000**
3. ¡Listo! La aplicación debería cargarse

---

## 🎯 Verificar que Todo Funciona

### Prueba Básica

1. **Dashboard:** Deberías ver el panel principal con gráficos
2. **Configuración:** Ve a "Configuración" y:
   - Cambia el nombre de la CB
   - Añade un socio
   - Haz clic en "Guardar Cambios"
   - Verifica que aparezca "Guardado ✓"

### Prueba de IA (Análisis de Facturas)

1. Ve a la sección **"Facturas"**
2. Arrastra una imagen o PDF de una factura
3. Espera a que se analice (debería decir "Analizando...")
4. Si funciona, verás los datos extraídos para revisar
5. Si falla, verifica tu API Key en `.env.local`

### Prueba de Modo Archivo Seguro

1. Ve a **"Configuración" → pestaña "Datos y Conexiones"**
2. Haz clic en **"Crear Nueva BD"**
3. Introduce una contraseña
4. Guarda un archivo `.gestcb` en tu PC
5. Verifica que aparezca "SECURE MODE" en el header

**⚠️ Nota para Navegadores:**
- Si estás usando la app dentro de un iframe o entorno restringido, la función de archivo seguro puede no funcionar
- En ese caso, usa "Exportar JSON" como alternativa

---

## 🛠️ Comandos Útiles

```bash
# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build

# Vista previa de build de producción
npm run preview
```

---

## 📱 Uso en Dispositivos Móviles

CBGest es completamente responsive. Para usar en móvil:

1. Asegúrate de que tu PC y móvil estén en la misma red WiFi
2. Inicia el servidor: `npm run dev`
3. Anota la dirección "Network" (ej: `http://192.168.1.100:3000`)
4. En tu móvil, abre el navegador y ve a esa dirección

---

## 🔒 Modos de Almacenamiento

CBGest ofrece 3 opciones de almacenamiento:

### 1. **Navegador Local** (por defecto)
- **Ventaja:** No requiere configuración
- **Desventaja:** Si borras caché, pierdes datos
- **Uso:** Desarrollo y pruebas

### 2. **Archivo Seguro (.gestcb)**
- **Ventaja:** Cifrado AES-256, archivo físico en tu PC
- **Desventaja:** Requiere contraseña (si la pierdes, datos irrecuperables)
- **Uso:** Producción, datos reales

### 3. **Backup JSON**
- **Ventaja:** Fácil de compartir, sin cifrado
- **Desventaja:** No cifrado (no uses con datos sensibles)
- **Uso:** Copias de seguridad, transferencia entre PCs

---

## 🐛 Solución de Problemas

### Error: "Cannot find module '@vitejs/plugin-react'"
```bash
rm -rf node_modules package-lock.json
npm install
```

### La IA no funciona (Error en análisis de facturas)
1. Verifica que `.env.local` existe y tiene tu API Key
2. Reinicia el servidor de desarrollo (`Ctrl+C` y luego `npm run dev`)
3. Verifica que tu API Key es válida en: https://aistudio.google.com/app/apikey

### Modo Archivo Seguro no funciona
- Asegúrate de usar Chrome o Edge (versión reciente)
- Abre la app en una pestaña nueva (no en iframe)
- Si persiste, usa "Exportar JSON" como alternativa

### Puerto 3000 ya en uso
```bash
# Mata el proceso que usa el puerto 3000
# En Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# En Mac/Linux:
lsof -ti:3000 | xargs kill -9
```

O cambia el puerto en `vite.config.ts`:
```ts
server: {
  port: 3001,  // Cambia a otro puerto
  host: '0.0.0.0',
}
```

---

## 📚 Estructura de Archivos Importante

```
CBGest/
├── .env.local          ← TU API KEY AQUÍ (no subir a Git)
├── App.tsx             ← Componente principal
├── components/         ← Todos los componentes UI
├── services/           ← Integración con Gemini AI
├── utils/              ← Validadores, crypto, plan contable
├── types.ts            ← Definiciones TypeScript
├── vite.config.ts      ← Configuración de Vite
└── package.json        ← Dependencias del proyecto
```

---

## 🎓 Próximos Pasos

Una vez que la aplicación esté funcionando:

1. **Configura tu CB:**
   - Ve a "Configuración"
   - Añade el nombre y NIF de tu Comunidad de Bienes
   - Configura los socios y sus participaciones

2. **Importa tus primeras facturas:**
   - Ve a "Facturas"
   - Sube imágenes o PDFs de facturas
   - Revisa y confirma los datos extraídos

3. **Explora la conciliación:**
   - Sube un extracto bancario en PDF
   - Ve a "Conciliación Banco"
   - Casa movimientos con facturas

4. **Genera informes fiscales:**
   - Ve a "Modelos Fiscales"
   - Consulta el Modelo 184 (atribución de rentas)
   - Si estás en régimen general, consulta el Modelo 303 (IVA)

---

## 💡 Consejos Pro

- **Backup regular:** Usa "Exportar JSON" cada semana
- **Modo Archivo Seguro:** Usa una contraseña robusta y guárdala en un gestor de contraseñas
- **Validación de NIF:** La app valida automáticamente NIFs/CIFs, confía en las alertas
- **Cuentas contables:** La IA sugiere la cuenta PGC, pero siempre revisa antes de confirmar

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa la sección "Solución de Problemas" arriba
2. Verifica que seguiste todos los pasos en orden
3. Consulta los logs del navegador (F12 → Console)
4. Consulta los logs del servidor en la terminal

---

## 📄 Licencia y Créditos

- **Proyecto:** CBGest
- **Stack:** React + TypeScript + Vite
- **IA:** Google Gemini Flash 2.5
- **Diseño:** Tailwind CSS + Lucide Icons

---

¡Disfruta de CBGest! 🎉
