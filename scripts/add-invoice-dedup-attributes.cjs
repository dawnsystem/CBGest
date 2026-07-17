#!/usr/bin/env node

/**
 * Añade atributos e índices de deduplicación de facturas (FEAT-DEDUP-001).
 *
 * invoices: fileHash, contentFingerprint + índices
 * uploads: fileHash, duplicateMatch, forceProcess
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/add-invoice-dedup-attributes.cjs
 *
 * Scopes: databases.*, collections.*, attributes.*, indexes.*
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createAttribute(collectionId, attributeConfig) {
  const { type, key, ...config } = attributeConfig;

  try {
    console.log(`  - ${collectionId}.${key} (${type})...`);
    switch (type) {
      case 'string':
        await databases.createStringAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.size,
          config.required,
          config.default,
          config.array || false
        );
        break;
      case 'boolean':
        await databases.createBooleanAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.default,
          config.array || false
        );
        break;
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
    console.log(`    ✓ ${key}`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  ${key} ya existe`);
      return;
    }
    throw error;
  }
}

async function createKeyIndex(collectionId, indexKey, attributes) {
  try {
    console.log(`  - index ${collectionId}.${indexKey}...`);
    await databases.createIndex(
      CONFIG.databaseId,
      collectionId,
      indexKey,
      'key',
      attributes,
      attributes.map(() => 'ASC')
    );
    console.log(`    ✓ ${indexKey}`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  ${indexKey} ya existe`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 Añadiendo atributos de deduplicación de facturas...\n');
  console.log(`📡 ${CONFIG.endpoint}`);
  console.log(`🎯 Proyecto: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}\n`);

  console.log('=== invoices ===');
  await createAttribute('invoices', { type: 'string', key: 'fileHash', size: 64, required: false });
  await sleep(500);
  await createAttribute('invoices', { type: 'string', key: 'contentFingerprint', size: 128, required: false });
  await sleep(500);
  await createKeyIndex('invoices', 'fileHash_index', ['fileHash']);
  await sleep(500);
  await createKeyIndex('invoices', 'contentFingerprint_index', ['contentFingerprint']);

  console.log('\n=== uploads ===');
  await createAttribute('uploads', { type: 'string', key: 'fileHash', size: 64, required: false });
  await sleep(500);
  await createAttribute('uploads', { type: 'string', key: 'duplicateMatch', size: 2000, required: false });
  await sleep(500);
  await createAttribute('uploads', { type: 'boolean', key: 'forceProcess', required: false, default: false });

  console.log('\n✅ Schema de deduplicación aplicado (o ya existía).\n');
  console.log('Verifica con: node scripts/verify-appwrite-setup.cjs');
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});
