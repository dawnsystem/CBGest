#!/usr/bin/env node

/**
 * Añade schema de deduplicación de extractos bancarios en un proyecto Appwrite existente:
 * - colección bank_statement_imports
 * - contentFingerprint / importBatchId en transactions
 * - fileSha256 / isDuplicate / fiscalYearId en uploads
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/add-bank-statement-dedup-schema.cjs
 */

const { Client, Databases, Permission, Role, Query } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');

const CONFIG = getAppwriteConfig();
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
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

async function listAllAttributes(collectionId) {
  const byKey = new Map();
  let offset = 0;
  for (;;) {
    const page = await databases.listAttributes(CONFIG.databaseId, collectionId, [
      Query.limit(100),
      Query.offset(offset),
    ]);
    for (const attr of page.attributes || []) {
      byKey.set(attr.key, attr);
    }
    offset += (page.attributes || []).length;
    if (!page.attributes?.length || offset >= (page.total || 0) || byKey.size >= (page.total || 0)) {
      break;
    }
  }
  return Array.from(byKey.values());
}

async function createCollection(collectionId, name) {
  try {
    await databases.createCollection(
      CONFIG.databaseId,
      collectionId,
      name,
      [Permission.read(Role.users()), Permission.create(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())],
      true
    );
    console.log(`  ✓ Collection '${collectionId}' created`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`  ⚠️  Collection '${collectionId}' already exists`);
      return;
    }
    throw error;
  }
}

async function createAttribute(collectionId, attributeConfig) {
  const { type, key, ...config } = attributeConfig;
  try {
    console.log(`  - Creating ${type} attribute: ${key}...`);
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
      case 'integer':
        await databases.createIntegerAttribute(
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
        throw new Error(`Unsupported attribute type: ${type}`);
    }
    console.log(`    ✓ Attribute '${key}' created`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Attribute '${key}' already exists`);
      return;
    }
    throw error;
  }
}

async function waitForAttributeAvailable(collectionId, key, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const attrs = await listAllAttributes(collectionId);
    const attr = attrs.find((a) => a.key === key);
    if (attr?.status === 'available') return true;
    if (attr?.status === 'failed') {
      throw new Error(`Attribute ${key} failed: ${attr.error || 'unknown'}`);
    }
    await sleep(1500);
  }
  return false;
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
      console.log(`    ⚠️  Index '${indexKey}' already exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log('🚀 Adding bank statement dedup schema...');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log('');

  // 1) bank_statement_imports
  console.log('📦 bank_statement_imports');
  await createCollection('bank_statement_imports', 'Bank Statement Imports');
  await sleep(1000);

  const importAttrs = [
    { type: 'string', key: 'fileSha256', size: 64, required: false },
    { type: 'string', key: 'contentFingerprint', size: 64, required: true },
    { type: 'string', key: 'fileName', size: 255, required: false },
    { type: 'integer', key: 'transactionCount', required: true, min: 0, max: 999999 },
    { type: 'string', key: 'importedAt', size: 40, required: true },
    { type: 'string', key: 'fiscalYearId', size: 36, required: false },
  ];
  for (const attr of importAttrs) {
    await createAttribute('bank_statement_imports', attr);
    await sleep(400);
  }
  for (const key of ['fileSha256', 'contentFingerprint', 'importedAt', 'fiscalYearId', 'transactionCount']) {
    await waitForAttributeAvailable('bank_statement_imports', key);
  }
  await createKeyIndex('bank_statement_imports', 'fileSha256_index', ['fileSha256']);
  await createKeyIndex('bank_statement_imports', 'contentFingerprint_index', ['contentFingerprint']);
  await createKeyIndex('bank_statement_imports', 'importedAt_index', ['importedAt']);
  await createKeyIndex('bank_statement_imports', 'fiscalYearId_index', ['fiscalYearId']);

  // 2) transactions fingerprints
  console.log('\n📦 transactions');
  await createAttribute('transactions', {
    type: 'string',
    key: 'contentFingerprint',
    size: 64,
    required: false,
  });
  await createAttribute('transactions', {
    type: 'string',
    key: 'importBatchId',
    size: 36,
    required: false,
  });
  await waitForAttributeAvailable('transactions', 'contentFingerprint');
  await waitForAttributeAvailable('transactions', 'importBatchId');
  await createKeyIndex('transactions', 'contentFingerprint_index', ['contentFingerprint']);
  await createKeyIndex('transactions', 'importBatchId_index', ['importBatchId']);

  // 3) uploads file hash
  console.log('\n📦 uploads');
  await createAttribute('uploads', { type: 'string', key: 'fileSha256', size: 64, required: false });
  await createAttribute('uploads', { type: 'boolean', key: 'isDuplicate', required: false, default: false });
  await createAttribute('uploads', { type: 'string', key: 'fiscalYearId', size: 36, required: false });
  await waitForAttributeAvailable('uploads', 'fileSha256');
  await waitForAttributeAvailable('uploads', 'isDuplicate');
  await waitForAttributeAvailable('uploads', 'fiscalYearId');
  await createKeyIndex('uploads', 'fileSha256_index', ['fileSha256']);
  await createKeyIndex('uploads', 'fiscalYearId_index', ['fiscalYearId']);

  console.log('\n✅ Bank statement dedup schema ready.');
  console.log('   Collections: bank_statement_imports (+ attrs/indexes on transactions & uploads)');
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
