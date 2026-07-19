#!/usr/bin/env node

/**
 * Añade atributo aiProviderUsed a la colección uploads (FEAT-AI-FAILOVER-001).
 *
 * Guarda qué proveedor IA completó el análisis (gemini | groq | openrouter).
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/add-aiproviderused-attribute.cjs
 *
 * Scopes: databases.*, collections.*, attributes.*
 */

const { Client, Databases } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');

const CONFIG = getAppwriteConfig();
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ APPWRITE_API_KEY es obligatoria');
  console.error('  export APPWRITE_API_KEY="tu-api-key"');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

/**
 * Crea uploads.aiProviderUsed si no existe (idempotente).
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log('🚀 Añadiendo atributo aiProviderUsed a uploads...\n');
  console.log(`📡 ${CONFIG.endpoint}`);
  console.log(`🎯 Proyecto: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}\n`);

  const collectionId = 'uploads';
  const key = 'aiProviderUsed';

  try {
    console.log(`  - ${collectionId}.${key} (string)...`);
    await databases.createStringAttribute(
      CONFIG.databaseId,
      collectionId,
      key,
      32,
      false
    );
    console.log(`    ✓ ${key}`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  ${key} ya existe`);
    } else {
      console.error(`    ❌ ${key}:`, error.message || error);
      process.exit(1);
    }
  }

  console.log('\n✅ Listo. Verifica con: node scripts/verify-appwrite-setup.cjs\n');
}

main().catch((error) => {
  console.error('❌ Fatal:', error.message || error);
  process.exit(1);
});
