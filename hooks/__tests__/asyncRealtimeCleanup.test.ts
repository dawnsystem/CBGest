/**
 * @fileoverview Regresión BUG-RT-001 — cleanup de suscripción async en useEffect
 * @description Verifica que el patrón usado en App.tsx (ref + cleanup sincrónico)
 * llama a unsubscribe aunque la suscripción se registre dentro de initDataLayer async.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';

/**
 * Réplica mínima del patrón de App.tsx para suscripciones realtime async.
 * @param subscribe - Función async que devuelve el unsubscribe de realtime.
 */
function useAsyncRealtimeCleanupPattern(subscribe: () => Promise<() => void>) {
  const realtimeUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    subscribe().then((unsubscribe) => {
      if (cancelled) {
        unsubscribe();
        return;
      }
      realtimeUnsubscribeRef.current = unsubscribe;
    });

    return () => {
      cancelled = true;
      realtimeUnsubscribeRef.current?.();
      realtimeUnsubscribeRef.current = null;
    };
  }, [subscribe]);
}

describe('BUG-RT-001 async realtime cleanup pattern', () => {
  it('invoca unsubscribe al desmontar tras resolver la suscripción async', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(async () => unsubscribe);

    const { unmount } = renderHook(() => useAsyncRealtimeCleanupPattern(subscribe));

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('invoca unsubscribe si el effect se cancela antes de que resuelva subscribe', async () => {
    const unsubscribe = vi.fn();
    let resolveSubscribe!: (fn: () => void) => void;
    const subscribe = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveSubscribe = resolve;
        })
    );

    const { unmount } = renderHook(() => useAsyncRealtimeCleanupPattern(subscribe));

    unmount();
    resolveSubscribe(unsubscribe);

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('limpia la suscripción anterior al iniciar un nuevo ciclo (re-login)', async () => {
    const firstUnsubscribe = vi.fn();
    const secondUnsubscribe = vi.fn();

    const firstSubscribe = vi.fn(async () => firstUnsubscribe);
    const { unmount: unmountFirst } = renderHook(() =>
      useAsyncRealtimeCleanupPattern(firstSubscribe)
    );

    await waitFor(() => expect(firstSubscribe).toHaveBeenCalledTimes(1));
    unmountFirst();
    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);

    const secondSubscribe = vi.fn(async () => secondUnsubscribe);
    const { unmount: unmountSecond } = renderHook(() =>
      useAsyncRealtimeCleanupPattern(secondSubscribe)
    );

    await waitFor(() => expect(secondSubscribe).toHaveBeenCalledTimes(1));
    unmountSecond();
    expect(secondUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
