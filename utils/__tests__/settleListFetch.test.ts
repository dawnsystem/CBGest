/**
 * @fileoverview Tests para settleListFetch / collectFetchErrors (BUG-FY-004).
 */

import { describe, it, expect, vi } from 'vitest';
import { settleListFetch, collectFetchErrors } from '../../utils/settleListFetch';

describe('settleListFetch', () => {
  it('devuelve datos cuando la promesa resuelve', async () => {
    const result = await settleListFetch(Promise.resolve([{ id: '1' }]), 'facturas');
    expect(result.data).toEqual([{ id: '1' }]);
    expect(result.error).toBeUndefined();
  });

  it('devuelve [] + error cuando la promesa rechaza (no oculta el fallo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await settleListFetch(
      Promise.reject(new Error('Missing index fiscalYearId')),
      'facturas'
    );
    expect(result.data).toEqual([]);
    expect(result.error).toContain('facturas');
    expect(result.error).toContain('Missing index fiscalYearId');
    warn.mockRestore();
  });
});

describe('collectFetchErrors', () => {
  it('devuelve null si no hay errores', () => {
    expect(collectFetchErrors([{ error: undefined }, {}])).toBeNull();
  });

  it('agrega mensajes cuando hay errores', () => {
    const msg = collectFetchErrors([
      { error: 'facturas: boom' },
      {},
      { error: 'asientos: fail' },
    ]);
    expect(msg).toContain('2');
    expect(msg).toContain('facturas: boom');
    expect(msg).toContain('asientos: fail');
  });
});
