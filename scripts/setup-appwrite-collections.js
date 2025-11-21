#!/usr/bin/env node

/**
 * Script to automatically create Appwrite collections for CBGest
 *
 * This script creates the 'notifications' and 'uploads' collections
 * with all required attributes, indexes, and permissions.
 *
 * Usage:
 *   node scripts/setup-appwrite-collections.js
 *
 * Requirements:
 *   - Appwrite API Key with Database write permissions
 *   - Set environment variable: APPWRITE_API_KEY
 */

const { Client, Databases, Permission, Role } = require('node-appwrite');

// Configuration from config/appwrite.ts
const CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
};

// Get API key from environment variable
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
  console.error('');
  console.error('Please set it before running this script:');
  console.error('  export APPWRITE_API_KEY="your-api-key-here"');
  console.error('');
  console.error('To get an API key:');
  console.error('  1. Go to https://cloud.appwrite.io/');
  console.error('  2. Select your project: cbgest');
  console.error('  3. Go to Settings > API Keys');
  console.error('  4. Create a new API Key with Database permissions');
  process.exit(1);
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

/**
 * Create a collection
 */
async function createCollection(collectionId, name) {
  try {
    console.log(`📦 Creating collection: ${name} (${collectionId})...`);

    const collection = await databases.createCollection(
      CONFIG.databaseId,
      collectionId,
      name,
      [
        Permission.create(Role.users()),
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      true // Document-level security enabled
    );

    console.log(`✅ Collection '${name}' created successfully`);
    return collection;
  } catch (error) {
    if (error.code === 409) {
      console.log(`⚠️  Collection '${name}' already exists, skipping creation`);
      return null;
    }
    throw error;
  }
}

/**
 * Create an attribute with retry logic
 */
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

/**
 * Create an index
 */
async function createIndex(collectionId, indexConfig) {
  const { key, type, attributes, orders } = indexConfig;

  try {
    console.log(`  - Creating index: ${key}...`);

    const result = await databases.createIndex(
      CONFIG.databaseId,
      collectionId,
      key,
      type,
      attributes,
      orders
    );

    console.log(`    ✓ Index '${key}' created`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Index '${key}' already exists, skipping`);
      return null;
    }
    throw error;
  }
}

/**
 * Setup notifications collection
 */
async function setupNotificationsCollection() {
  console.log('\n=== Setting up NOTIFICATIONS collection ===\n');

  const collectionId = 'notifications';

  // Create collection
  await createCollection(collectionId, 'Notifications');

  // Wait a bit for collection to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create attributes
  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'type', size: 50, required: true },
    { type: 'string', key: 'title', size: 255, required: true },
    { type: 'string', key: 'message', size: 1000, required: true },
    { type: 'string', key: 'userId', size: 255, required: true },
    { type: 'string', key: 'userName', size: 255, required: true },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'read', required: true, default: false },
    { type: 'string', key: 'relatedId', size: 255, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    // Small delay between attributes to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for attributes to be ready
  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Create indexes
  console.log('\n📇 Creating indexes...');

  const indexes = [
    {
      key: 'timestamp_index',
      type: 'key',
      attributes: ['timestamp'],
      orders: ['DESC']
    },
    {
      key: 'userId_index',
      type: 'key',
      attributes: ['userId'],
      orders: ['ASC']
    },
    {
      key: 'read_index',
      type: 'key',
      attributes: ['read'],
      orders: ['ASC']
    }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Notifications collection setup complete!\n');
}

/**
 * Setup uploads collection
 */
async function setupUploadsCollection() {
  console.log('\n=== Setting up UPLOADS collection ===\n');

  const collectionId = 'uploads';

  // Create collection
  await createCollection(collectionId, 'Upload Queue');

  // Wait a bit for collection to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create attributes
  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'uploadType', size: 50, required: true },
    { type: 'string', key: 'fileName', size: 255, required: true },
    { type: 'string', key: 'mimeType', size: 100, required: true },
    { type: 'string', key: 'base64Data', size: 10000000, required: false },
    { type: 'string', key: 'status', size: 50, required: true },
    { type: 'integer', key: 'progress', required: true, min: 0, max: 100, default: 0 },
    { type: 'string', key: 'error', size: 1000, required: false },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'notificationDismissed', required: false, default: false },
    { type: 'string', key: 'result', size: 10000, required: false },
    { type: 'string', key: 'bankResult', size: 50000, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    // Small delay between attributes to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for attributes to be ready
  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Create indexes
  console.log('\n📇 Creating indexes...');

  const indexes = [
    {
      key: 'timestamp_index',
      type: 'key',
      attributes: ['timestamp'],
      orders: ['DESC']
    },
    {
      key: 'status_index',
      type: 'key',
      attributes: ['status'],
      orders: ['ASC']
    },
    {
      key: 'uploadType_index',
      type: 'key',
      attributes: ['uploadType'],
      orders: ['ASC']
    }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Uploads collection setup complete!\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Appwrite collections setup...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);

  try {
    await setupNotificationsCollection();
    await setupUploadsCollection();

    console.log('');
    console.log('🎉 All collections have been set up successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify the collections in Appwrite Console');
    console.log('  2. Run your application - the 404 errors should be gone');
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

// Run the script
main();
