import { Client, Databases, Query } from 'node-appwrite';

/**
 * Maintenance Function
 * - Cleans up old read notifications (30+ days)
 * - Verifies data integrity
 * Schedule: 0 4 * * 0 (Sundays at 4 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  const results = {
    notifications: { found: 0, deleted: 0 },
    integrity: { invoices: 0, orphanedEntries: 0 },
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Clean old read notifications (30+ days)
    log('Cleaning old notifications...');
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const oldNotifications = await databases.listDocuments(
      databaseId,
      'notifications',
      [
        Query.equal('read', true),
        Query.lessThan('timestamp', thirtyDaysAgo),
        Query.limit(100)
      ]
    );

    results.notifications.found = oldNotifications.documents.length;

    for (const doc of oldNotifications.documents) {
      try {
        await databases.deleteDocument(databaseId, 'notifications', doc.$id);
        results.notifications.deleted++;
      } catch (e) {
        error(`Failed to delete notification ${doc.$id}: ${e.message}`);
      }
    }

    log(`Deleted ${results.notifications.deleted}/${results.notifications.found} old notifications`);

    // 2. Data integrity check - find orphaned accounting entries
    log('Checking data integrity...');

    // Get all invoices
    const invoices = await databases.listDocuments(
      databaseId,
      'invoices',
      [Query.limit(1000)]
    );
    const invoiceIds = new Set(invoices.documents.map(i => i.$id));
    results.integrity.invoices = invoices.documents.length;

    // Get accounting entries and check for orphans
    const entries = await databases.listDocuments(
      databaseId,
      'accountingEntries',
      [Query.limit(1000)]
    );

    for (const entry of entries.documents) {
      if (entry.invoiceId && !invoiceIds.has(entry.invoiceId)) {
        results.integrity.orphanedEntries++;
        log(`Warning: Orphaned entry ${entry.$id} references missing invoice ${entry.invoiceId}`);
      }
    }

    log(`Integrity check complete. Found ${results.integrity.orphanedEntries} orphaned entries`);

    return res.json({
      success: true,
      ...results
    });
  } catch (e) {
    error(`Maintenance failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message,
      ...results
    }, 500);
  }
};
