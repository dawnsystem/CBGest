/**
 * Appwrite Configuration
 * These values are fixed and should not be changed by users.
 */

export const APPWRITE_CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
  bucketId: '691f31c9000fc8c83ab1',

  // Collection IDs
  collections: {
    invoices: 'invoices',
    entries: 'entries',
    transactions: 'transactions',
    settings: 'settings',
    notifications: 'notifications',
    uploads: 'uploads',
    suppliers: 'suppliers'
  }
} as const;
