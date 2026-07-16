/**
 * @fileoverview Tests del servicio realtime de Appwrite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/appwrite/client', () => ({
  client: {
    subscribe: vi.fn(),
  },
  config: {
    databaseId: 'test-db',
    collections: {
      invoices: 'invoices',
      entries: 'entries',
      transactions: 'transactions',
    },
  },
}));

import { client } from '../../lib/appwrite/client';
import { subscribeToChanges } from '../appwrite/realtimeService';

describe('realtimeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToChanges', () => {
    it('devuelve cleanup que cancela las tres suscripciones', () => {
      const unsubscribeInvoices = vi.fn();
      const unsubscribeEntries = vi.fn();
      const unsubscribeTransactions = vi.fn();

      vi.mocked(client.subscribe)
        .mockReturnValueOnce(unsubscribeInvoices)
        .mockReturnValueOnce(unsubscribeEntries)
        .mockReturnValueOnce(unsubscribeTransactions);

      const callback = vi.fn();
      const cleanup = subscribeToChanges(callback);

      expect(client.subscribe).toHaveBeenCalledTimes(3);

      cleanup();

      expect(unsubscribeInvoices).toHaveBeenCalledTimes(1);
      expect(unsubscribeEntries).toHaveBeenCalledTimes(1);
      expect(unsubscribeTransactions).toHaveBeenCalledTimes(1);
    });
  });
});
