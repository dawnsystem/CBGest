/**
 * @fileoverview Tests del componente ForcePasswordChange
 * @description Verifica el flujo de cambio de contraseña obligatorio en el
 *              primer login (cuenta creada por un administrador).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ForcePasswordChange } from '../ForcePasswordChange';

const changePasswordMock = vi.fn();
const logoutMock = vi.fn();
const clearErrorMock = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    changePassword: changePasswordMock,
    logout: logoutMock,
    lastError: null,
    clearError: clearErrorMock,
  }),
}));

describe('ForcePasswordChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillForm = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText(/Contraseña temporal actual/i), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i), { target: { value: next } });
    fireEvent.change(screen.getByLabelText(/Confirmar nueva contraseña/i), { target: { value: confirm } });
  };

  it('rejects new passwords shorter than 8 characters', async () => {
    render(<ForcePasswordChange />);

    fillForm('cambiar123', 'short1', 'short1');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/i }));

    expect(await screen.findByText(/al menos 8 caracteres/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation', async () => {
    render(<ForcePasswordChange />);

    fillForm('cambiar123', 'NuevaPass1234', 'OtraCosaDistinta');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/i }));

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('rejects reusing the temporary password as the new one', async () => {
    render(<ForcePasswordChange />);

    fillForm('cambiar123', 'cambiar123', 'cambiar123');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/i }));

    expect(await screen.findByText(/diferente de la temporal/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it('calls changePassword with the current and new password when valid', async () => {
    changePasswordMock.mockResolvedValueOnce(undefined);
    render(<ForcePasswordChange />);

    fillForm('cambiar123', 'MiNuevaContrasenaFinal1', 'MiNuevaContrasenaFinal1');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/i }));

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith('cambiar123', 'MiNuevaContrasenaFinal1');
    });
  });

  it('allows logging out instead of changing the password', () => {
    render(<ForcePasswordChange />);

    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
