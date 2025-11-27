import { Client, Databases, Query } from 'node-appwrite';

/**
 * Auto-Reconcile Function
 * Automatically matches bank transactions with invoices
 * Trigger: Event on bankTransactions.documents.*.create
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    // Get the new transaction from the event
    const transaction = req.body;

    if (!transaction || !transaction.$id) {
      log('No transaction data in event, skipping');
      return res.json({ success: true, skipped: true });
    }

    log(`Processing transaction: ${transaction.$id}`);
    log(`  Amount: ${transaction.amount}`);
    log(`  Concept: ${transaction.concept}`);

    // Skip if already matched
    if (transaction.matchedInvoiceId || transaction.status === 'reconciled') {
      log('Transaction already reconciled, skipping');
      return res.json({ success: true, alreadyReconciled: true });
    }

    // Only process negative amounts (payments/expenses)
    const amount = Math.abs(parseFloat(transaction.amount));

    // Strategy 1: Exact amount match with pending invoices
    log('Searching for matching invoices...');
    const invoices = await databases.listDocuments(
      databaseId,
      'invoices',
      [
        Query.equal('status', 'pending'),
        Query.greaterThanEqual('totalAmount', amount - 0.01),
        Query.lessThanEqual('totalAmount', amount + 0.01),
        Query.limit(10)
      ]
    );

    if (invoices.documents.length === 1) {
      // Single exact match - auto-reconcile
      const matchedInvoice = invoices.documents[0];
      log(`Found exact match: Invoice ${matchedInvoice.$id}`);

      // Update transaction
      await databases.updateDocument(
        databaseId,
        'bankTransactions',
        transaction.$id,
        {
          matchedInvoiceId: matchedInvoice.$id,
          status: 'reconciled',
          matchConfidence: 'high',
          matchMethod: 'auto-exact-amount'
        }
      );

      // Update invoice
      await databases.updateDocument(
        databaseId,
        'invoices',
        matchedInvoice.$id,
        {
          status: 'paid',
          paidDate: transaction.date
        }
      );

      log(`Auto-reconciled transaction ${transaction.$id} with invoice ${matchedInvoice.$id}`);

      return res.json({
        success: true,
        matched: true,
        transactionId: transaction.$id,
        invoiceId: matchedInvoice.$id,
        method: 'exact-amount'
      });
    }

    // Strategy 2: Check AI match history for concept patterns
    const normalizedConcept = transaction.concept
      ?.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    if (normalizedConcept) {
      const matchHistory = await databases.listDocuments(
        databaseId,
        'ai_match_history',
        [
          Query.equal('userConfirmed', true),
          Query.orderDesc('usageCount'),
          Query.limit(50)
        ]
      );

      // Find similar concept in history
      for (const history of matchHistory.documents) {
        const historyConcept = history.normalizedConcept || history.bankConcept?.toLowerCase();
        if (historyConcept && normalizedConcept.includes(historyConcept.substring(0, 10))) {
          log(`Found pattern match from history: ${history.matchedSupplierName || history.matchedCategory}`);

          await databases.updateDocument(
            databaseId,
            'bankTransactions',
            transaction.$id,
            {
              suggestedSupplierId: history.matchedSupplierId,
              suggestedCategory: history.matchedCategory,
              matchConfidence: 'medium',
              matchMethod: 'auto-pattern'
            }
          );

          return res.json({
            success: true,
            matched: false,
            suggested: true,
            transactionId: transaction.$id,
            suggestion: {
              supplierId: history.matchedSupplierId,
              supplierName: history.matchedSupplierName,
              category: history.matchedCategory
            }
          });
        }
      }
    }

    log('No automatic match found');
    return res.json({
      success: true,
      matched: false,
      transactionId: transaction.$id
    });

  } catch (e) {
    error(`Auto-reconcile failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
