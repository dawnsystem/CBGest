/**
 * @fileoverview Tests del sistema de notificaciones Toast
 * @description Verifica showToast, showConfirm y renderizado correcto.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../Toast';

// Helper component that exposes toast functions for testing
const TestConsumer: React.FC<{
  onMount?: (api: ReturnType<typeof useToast>) => void;
}> = ({ onMount }) => {
  const api = useToast();
  React.useEffect(() => {
    if (onMount) onMount(api);
    // Only run once on mount to expose the api to tests
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  return <div data-testid="consumer">ready</div>;
};

describe('Toast System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('should render ToastProvider without errors', () => {
    render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('should throw when useToast is used outside provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useToast must be used within ToastProvider');

    spy.mockRestore();
  });

  it('should show a toast message', () => {
    let toastApi: ReturnType<typeof useToast>;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi!.showToast('Test message', 'success');
    });

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should auto-dismiss toast after duration', () => {
    let toastApi: ReturnType<typeof useToast>;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi!.showToast('Temp message', 'info', 2000);
    });

    expect(screen.getByText('Temp message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText('Temp message')).not.toBeInTheDocument();
  });

  it('should dismiss toast on close button click', () => {
    let toastApi: ReturnType<typeof useToast>;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi!.showToast('Closeable toast', 'error');
    });

    expect(screen.getByText('Closeable toast')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Cerrar');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Closeable toast')).not.toBeInTheDocument();
  });

  it('should show confirm dialog and resolve true on confirm', async () => {
    let toastApi: ReturnType<typeof useToast>;
    let confirmResult: boolean | undefined;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi!.showConfirm('¿Estás seguro?').then(r => { confirmResult = r; });
    });

    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Confirmar'));
    });

    expect(confirmResult).toBe(true);
    expect(screen.queryByText('¿Estás seguro?')).not.toBeInTheDocument();
  });

  it('should show confirm dialog and resolve false on cancel', async () => {
    let toastApi: ReturnType<typeof useToast>;
    let confirmResult: boolean | undefined;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi!.showConfirm('¿Eliminar?').then(r => { confirmResult = r; });
    });

    expect(screen.getByText('¿Eliminar?')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Cancelar'));
    });

    expect(confirmResult).toBe(false);
    expect(screen.queryByText('¿Eliminar?')).not.toBeInTheDocument();
  });

  it('should render multiple toasts simultaneously', () => {
    let toastApi: ReturnType<typeof useToast>;

    render(
      <ToastProvider>
        <TestConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      for (let i = 0; i < 8; i++) {
        toastApi!.showToast(`Toast ${i}`, 'info');
      }
    });

    // The provider keeps the last 5 toasts (slices to -4 + adds new)
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBe(5);
  });
});
