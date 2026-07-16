#!/usr/bin/env node

/**
 * Añade el atributo `fiscalYearId` (+ índice) a todas las colecciones
 * transaccionales/maestras de CBGest que lo necesitan.
 *
 * Sin este atributo:
 * - La app filtra por ejercicio y parece que "desaparecen" los datos
 * - "Migrar datos sin ejercicio" falla con "attribute fiscalYearId does not exist"
 *
 * Uso:
 *   export APPWRITE_API_KEY="tu-api-key-con-scopes-databases"
 *   node scripts/add-fiscal-year-id-attributes.cjs
 *
 * Scopes mínimos de la API Key (Appwrite Console → Settings → API Keys):
 *   databases.read, databases.write,
 *   collections.read, collections.write,
 *   attributes.read, attributes.write,
 *   indexes.read, indexes.write
 */

'use strict';

const { Client, Databases } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');

const CONFIG = getAppwriteConfig();
const API_KEY = process.env.APPWRITE_API_KEY || process.env['APPWRITE DEV'];

if (!API_KEY) {
  console.error('❌ Falta APPWRITE_API_KEY');
  console.error('  export APPWRITE_API_KEY="..."');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

/** Colecciones que deben tener fiscalYearId (alineado con setup-all-collections.cjs) */
const TARGET_COLLECTIONS = [
  { id: 'invoices', size: 36 },
  { id: 'entries', size: 36 },
  { id: 'transactions', size: 36 },
  { id: 'suppliers', size: 36 },
  { id: 'apartments', size: 36 },
  { id: 'reservations', size: 36 },
  { id: 'recurring_expenses', size: 36 },
];

const ATTR_KEY = 'fiscalYearId';
const INDEX_KEY = 'fiscalYearId_index';

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lista atributos de una colección (con paginación; Appwrite puede truncar a 25).
 * @param {string} collectionId
 * @returns {Promise<Array<{ key: string, status?: string }>>}
 */
async function listAttributes(collectionId) {
  const byKey = new Map();
  let offset = 0;
  const pageSize = 100;

  for (;;) {
    let page;
    try {
      page = await databases.listAttributes(
        CONFIG.databaseId,
        collectionId,
        // Query helpers no importados aquí: usar offset vía SDK si está disponible
      );
    } catch {
      page = await databases.listAttributes(CONFIG.databaseId, collectionId);
    }

    for (const attr of page.attributes || []) {
      byKey.set(attr.key, attr);
    }

    // Si el total es mayor que lo devuelto, pedir más con offset (SDK node-appwrite v1)
    if ((page.total || 0) <= byKey.size) break;
    offset += (page.attributes || []).length;
    if (offset <= 0 || offset >= page.total) break;

    try {
      const { Query } = require('node-appwrite');
      page = await databases.listAttributes(
        CONFIG.databaseId,
        collectionId,
        [Query.limit(pageSize), Query.offset(offset)]
      );
      const before = byKey.size;
      for (const attr of page.attributes || []) {
        byKey.set(attr.key, attr);
      }
      if (byKey.size === before) break;
    } catch {
      break;
    }
  }

  return [...byKey.values()];
}

/**
 * Espera a que un atributo esté disponible (no "processing").
 * @param {string} collectionId
 * @param {string} key
 * @param {number} maxWaitMs
 * @returns {Promise<boolean>}
 */
async function waitForAttribute(collectionId, key, maxWaitMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const attrs = await listAttributes(collectionId);
    const found = attrs.find((a) => a.key === key);
    if (found && found.status === 'available') return true;
    if (found && found.status === 'failed') {
      throw new Error(`Atributo ${key} en ${collectionId} quedó en estado failed`);
    }
    await sleep(2000);
  }
  return false;
}

/**
 * Crea fiscalYearId si no existe.
 * @param {string} collectionId
 * @param {number} size
 * @returns {Promise<'created'|'exists'>}
 */
async function ensureFiscalYearIdAttribute(collectionId, size) {
  const attrs = await listAttributes(collectionId);
  if (attrs.some((a) => a.key === ATTR_KEY)) {
    console.log(`  ✓ ${collectionId}.${ATTR_KEY} ya existe`);
    return 'exists';
  }

  console.log(`  + Creando ${collectionId}.${ATTR_KEY} (string, size=${size}, required=false)...`);
  try {
    await databases.createStringAttribute(
      CONFIG.databaseId,
      collectionId,
      ATTR_KEY,
      size,
      false // required
    );
  } catch (error) {
    if (error.code === 409) {
      console.log(`  ✓ ${collectionId}.${ATTR_KEY} ya existe (409)`);
      return 'exists';
    }
    throw error;
  }
  const ready = await waitForAttribute(collectionId, ATTR_KEY);
  if (!ready) {
    console.warn(`  ⚠️  ${collectionId}.${ATTR_KEY} creado pero aún no "available" (sigue en processing)`);
  } else {
    console.log(`  ✓ ${collectionId}.${ATTR_KEY} disponible`);
  }
  return 'created';
}

/**
 * Crea índice fiscalYearId_index si no existe.
 * @param {string} collectionId
 * @returns {Promise<'created'|'exists'|'skipped'>}
 */
async function ensureFiscalYearIdIndex(collectionId) {
  try {
    const indexes = await databases.listIndexes(CONFIG.databaseId, collectionId);
    const existing = (indexes.indexes || []).some((i) => i.key === INDEX_KEY);
    if (existing) {
      console.log(`  ✓ ${collectionId}.${INDEX_KEY} ya existe`);
      return 'exists';
    }

    console.log(`  + Creando índice ${collectionId}.${INDEX_KEY}...`);
    await databases.createIndex(
      CONFIG.databaseId,
      collectionId,
      INDEX_KEY,
      'key',
      [ATTR_KEY],
      ['ASC']
    );
    console.log(`  ✓ ${collectionId}.${INDEX_KEY} creado`);
    return 'created';
  } catch (error) {
    if (error.code === 409) {
      console.log(`  ✓ ${collectionId}.${INDEX_KEY} ya existe`);
      return 'exists';
    }
    // Atributo aún processing → índice puede fallar temporalmente
    console.warn(`  ⚠️  No se pudo crear ${INDEX_KEY} en ${collectionId}: ${error.message}`);
    return 'skipped';
  }
}

async function main() {
  console.log('🚀 Añadiendo fiscalYearId a colecciones CBGest');
  console.log(`📡 ${CONFIG.endpoint}`);
  console.log(`🎯 project=${CONFIG.projectId}`);
  console.log(`🗄️  database=${CONFIG.databaseId}`);
  console.log('');

  // Sanity check de permisos
  try {
    await databases.listCollections(CONFIG.databaseId);
  } catch (error) {
    console.error('❌ No se puede listar colecciones con esta API key.');
    console.error(`   ${error.code || ''} ${error.type || ''} ${error.message}`);
    console.error('');
    console.error('Crea una API Key en Appwrite Console con scopes:');
    console.error('  databases.read/write, collections.read/write,');
    console.error('  attributes.read/write, indexes.read/write');
    process.exit(1);
  }

  let createdAttrs = 0;
  let createdIndexes = 0;

  for (const col of TARGET_COLLECTIONS) {
    console.log(`\n=== ${col.id} ===`);
    try {
      const attrResult = await ensureFiscalYearIdAttribute(col.id, col.size);
      if (attrResult === 'created') createdAttrs += 1;
      await sleep(500);
      const indexResult = await ensureFiscalYearIdIndex(col.id);
      if (indexResult === 'created') createdIndexes += 1;
    } catch (error) {
      if (error.code === 404) {
        console.error(`  ❌ Colección '${col.id}' no existe en este proyecto`);
        continue;
      }
      console.error(`  ❌ ${col.id}: ${error.message}`);
      throw error;
    }
  }

  console.log('\n🎉 Listo');
  console.log(`   Atributos creados: ${createdAttrs}`);
  console.log(`   Índices creados:   ${createdIndexes}`);
  console.log('');
  console.log('Siguiente paso en la app:');
  console.log('  1. Recarga CBGest');
  console.log('  2. Ejercicios → Migrar datos sin ejercicio (con 2026 activo)');
  console.log('');
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  if (error.response) console.error(error.response);
  process.exit(1);
});
