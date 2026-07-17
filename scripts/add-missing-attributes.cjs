#!/usr/bin/env node

/**
 * Script to add missing attributes to existing Appwrite collections for CBGest
 *
 * Incluye:
 * - transactionId / number / createdBy* en entries
 * - createdBy* en transactions
 * - fiscalYearId (+ índice) en invoices, entries, transactions, suppliers,
 *   apartments, reservations, recurring_expenses
 * - fileHash/contentFingerprint (+ índices) en invoices; fileHash/duplicateMatch/forceProcess en uploads
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/add-missing-attributes.cjs
 *
 * Preferible para solo fiscalYearId:
 *   node scripts/add-fiscal-year-id-attributes.cjs
 */

const { Client, Databases } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');
const CONFIG = getAppwriteConfig();

const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
  console.error('');
  console.error('Please set it before running this script:');
  console.error('  export APPWRITE_API_KEY="your-api-key-here"');
  console.error('');
  console.error('O ejecuta el script dedicado:');
  console.error('  node scripts/add-fiscal-year-id-attributes.cjs');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createAttribute(collectionId, attributeConfig) {
  const { type, key, ...config } = attributeConfig;

  try {
    console.log(`  - Creating ${type} attribute: ${key}...`);

    let result;
    switch (type) {
      case 'string':
        result = await databases.createStringAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.size,
          config.required,
          config.default,
          config.array || false
        );
        break;

      case 'integer':
        result = await databases.createIntegerAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.min,
          config.max,
          config.default,
          config.array || false
        );
        break;

      case 'boolean':
        result = await databases.createBooleanAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.default,
          config.array || false
        );
        break;

      default:
        throw new Error(`Unsupported attribute type: ${type}`);
    }

    console.log(`    ✓ Attribute '${key}' created`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Attribute '${key}' already exists, skipping`);
      return null;
    }
    throw error;
  }
}

async function createKeyIndex(collectionId, indexKey, attributes) {
  try {
    console.log(`  - Creating index: ${indexKey}...`);
    await databases.createIndex(
      CONFIG.databaseId,
      collectionId,
      indexKey,
      'key',
      attributes,
      attributes.map(() => 'ASC')
    );
    console.log(`    ✓ Index '${indexKey}' created`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Index '${indexKey}' already exists, skipping`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 Adding missing attributes to Appwrite collections...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);
  console.log('');

  try {
    console.log('=== Adding attributes to ENTRIES collection ===\n');

    const entriesAttributes = [
      { type: 'string', key: 'transactionId', size: 100, required: false },
      { type: 'integer', key: 'number', required: false, min: 1, max: 999999999 },
      { type: 'string', key: 'createdBy', size: 100, required: false },
      { type: 'string', key: 'createdByName', size: 255, required: false },
      { type: 'string', key: 'fiscalYearId', size: 36, required: false },
    ];

    for (const attr of entriesAttributes) {
      await createAttribute('entries', attr);
      await sleep(500);
    }
    await sleep(3000);
    await createKeyIndex('entries', 'fiscalYearId_index', ['fiscalYearId']);

    console.log('');
    console.log('=== Adding attributes to TRANSACTIONS collection ===\n');

    const transactionsAttributes = [
      { type: 'string', key: 'createdBy', size: 100, required: false },
      { type: 'string', key: 'createdByName', size: 255, required: false },
      { type: 'string', key: 'fiscalYearId', size: 36, required: false },
    ];

    for (const attr of transactionsAttributes) {
      await createAttribute('transactions', attr);
      await sleep(500);
    }
    await sleep(3000);
    await createKeyIndex('transactions', 'fiscalYearId_index', ['fiscalYearId']);

    console.log('');
    console.log('=== Adding fiscalYearId to remaining collections ===\n');

    const fiscalYearCollections = [
      { id: 'invoices', size: 36 },
      { id: 'suppliers', size: 36 },
      { id: 'apartments', size: 36 },
      { id: 'reservations', size: 36 },
      { id: 'recurring_expenses', size: 36 },
    ];

    for (const col of fiscalYearCollections) {
      await createAttribute(col.id, {
        type: 'string',
        key: 'fiscalYearId',
        size: col.size,
        required: false,
      });
      await sleep(500);
    }

    console.log('\n⏳ Waiting for attributes to become available...');
    await sleep(5000);

    for (const col of fiscalYearCollections) {
      await createKeyIndex(col.id, 'fiscalYearId_index', ['fiscalYearId']);
      await sleep(500);
    }

    console.log('');
    console.log('=== Adding invoice dedup attributes (FEAT-DEDUP-001) ===\n');

    for (const { id: collectionId, ...attrConfig } of [
      { id: 'invoices', type: 'string', key: 'fileHash', size: 64, required: false },
      { id: 'invoices', type: 'string', key: 'contentFingerprint', size: 128, required: false },
      { id: 'uploads', type: 'string', key: 'fileHash', size: 64, required: false },
      { id: 'uploads', type: 'string', key: 'duplicateMatch', size: 2000, required: false },
      { id: 'uploads', type: 'boolean', key: 'forceProcess', required: false, default: false },
    ]) {
      await createAttribute(collectionId, attrConfig);
      await sleep(500);
    }

    await sleep(3000);
    await createKeyIndex('invoices', 'fileHash_index', ['fileHash']);
    await sleep(500);
    await createKeyIndex('invoices', 'contentFingerprint_index', ['contentFingerprint']);

    console.log('');
    console.log('🎉 Missing attributes have been added successfully!');
    console.log('');
    console.log('Next: reload the app and run «Migrar datos sin ejercicio» with 2026 active.');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error during setup:', error.message);
    console.error('');
    if (error.response) {
      console.error('Response:', error.response);
    }
    process.exit(1);
  }
}

main();
