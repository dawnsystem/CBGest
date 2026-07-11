/**
 * @fileoverview Servicio de realtime para Appwrite
 */

import { client, config } from '../../lib/appwrite/client';

export const realtimeService = {
  subscribeToInvoices(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.invoices}.documents`,
      callback
    );
  },

  subscribeToEntries(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.entries}.documents`,
      callback
    );
  },

  subscribeToTransactions(callback: (payload: any) => void) {
    return client.subscribe(
      `databases.${config.databaseId}.collections.${config.collections.transactions}.documents`,
      callback
    );
  }
};

export const subscribeToChanges = (callback: (payload: any) => void): (() => void) => {
  const unsubscribeInvoices = realtimeService.subscribeToInvoices(callback);
  const unsubscribeEntries = realtimeService.subscribeToEntries(callback);
  const unsubscribeTransactions = realtimeService.subscribeToTransactions(callback);

  return () => {
    unsubscribeInvoices();
    unsubscribeEntries();
    unsubscribeTransactions();
  };
};
