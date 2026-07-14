/**
 * @fileoverview Tests del componente Login
 * @description Verifica que el auto-registro está deshabilitado: solo debe
 *              existir el formulario de login, sin campo de nombre ni toggle
 *              de "Regístrate".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Login } from '../Login';

const loginMock = vi.fn();
const clearErrorMock = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    lastError: null,
    clearError: clearErrorMock,
  }),
}));

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render any self-registration option', () => {
    render(<Login />);

    expect(screen.queryByText(/Regístrate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Crear Cuenta/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nombre Completo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Contacta con el administrador/i)).toBeInTheDocument();
  });

  it('only renders email and password fields', () => {
    render(<Login />);

    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeInTheDocument();
  });

  it('calls login with the entered credentials on submit', async () => {
    loginMock.mockResolvedValueOnce(undefined);
    render(<Login />);

    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), { target: { value: 'admin@comunidad.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i), { target: { value: 'contraseñaSegura1' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('admin@comunidad.com', 'contraseñaSegura1');
    });
  });
});
