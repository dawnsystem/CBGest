#!/usr/bin/env node

/**
 * Script to add missing attributes to existing Appwrite collections for CBGest
 * 
 * This script adds attributes that were added to types.ts but not to the Appwrite collections:
 * - transactionId (entries collection)
 * - number (entries collection)
 * - createdBy (entries, transactions collections)
 * - createdByName (entries, transactions collections)
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/add-missing-attributes.cjs
 */

const { Client, Databases } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');
const CONFIG = getAppwriteConfig();

// Get API key from environment variable
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
  console.error('');
  console.error('Please set it before running this script:');
  console.error('  export APPWRITE_API_KEY="your-api-key-here"');
  process.exit(1);
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * Main execution
 */
async function main() {
  console.log('🚀 Adding missing attributes to Appwrite collections...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);
  console.log('');

  try {
    // ==========================================
    // ENTRIES COLLECTION
    // ==========================================
    console.log('=== Adding attributes to ENTRIES collection ===\n');

    const entriesAttributes = [
      // Link to bank transaction (for entries created from bank movements)
      { type: 'string', key: 'transactionId', size: 100, required: false },
      // Sequential entry number
      { type: 'integer', key: 'number', required: false, min: 1, max: 999999999 },
      // Audit fields
      { type: 'string', key: 'createdBy', size: 100, required: false },
      { type: 'string', key: 'createdByName', size: 255, required: false },
    ];

    for (const attr of entriesAttributes) {
      await createAttribute('entries', attr);
      await sleep(500);
    }

    console.log('');

    // ==========================================
    // TRANSACTIONS COLLECTION
    // ==========================================
    console.log('=== Adding attributes to TRANSACTIONS collection ===\n');

    const transactionsAttributes = [
      // Audit fields
      { type: 'string', key: 'createdBy', size: 100, required: false },
      { type: 'string', key: 'createdByName', size: 255, required: false },
    ];

    for (const attr of transactionsAttributes) {
      await createAttribute('transactions', attr);
      await sleep(500);
    }

    console.log('');
    console.log('🎉 Missing attributes have been added successfully!');
    console.log('');
    console.log('Note: It may take a few seconds for the attributes to become available.');
    console.log('You can now retry creating accounting entries from bank movements.');
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
