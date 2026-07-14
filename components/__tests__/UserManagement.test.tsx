/**
 * @fileoverview Tests del panel de administración de usuarios
 * @description Vive dentro de Configuración → Usuarios. Verifica que:
 *              - Un usuario sin label "admin" no puede gestionar usuarios.
 *              - Un admin puede listar, crear, restablecer contraseña y
 *                eliminar usuarios (delegando en userAdminService).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { UserManagement } from '../UserManagement';
import type { ManagedUser } from '../../types';

const showToastMock = vi.fn();
const showConfirmMock = vi.fn().mockResolvedValue(true);

vi.mock('../Toast', () => ({
  useToast: () => ({
    showToast: showToastMock,
    showConfirm: showConfirmMock,
  }),
}));

let mockCurrentUser: { $id: string; labels?: string[] } | null = { $id: 'admin-1', labels: ['admin'] };

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockCurrentUser }),
}));

const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const resetPasswordMock = vi.fn();
const deleteUserMock = vi.fn();

vi.mock('../../services/userAdminService', () => ({
  userAdminService: {
    listUsers: (...args: unknown[]) => listUsersMock(...args),
    createUser: (...args: unknown[]) => createUserMock(...args),
    resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
    deleteUser: (...args: unknown[]) => deleteUserMock(...args),
    updateLabels: vi.fn(),
  },
}));

const sampleUsers: ManagedUser[] = [
  {
    id: 'admin-1',
    name: 'Admin Principal',
    email: 'admin@cbgest.com',
    labels: ['admin'],
    status: true,
    registration: '2026-01-01T00:00:00.000Z',
    passwordUpdate: '2026-01-01T00:00:00.000Z',
    mustChangePassword: false,
  },
  {
    id: 'comunero-1',
    name: 'Juan Pérez',
    email: 'juan@cbgest.com',
    labels: ['comunero'],
    status: true,
    registration: '2026-02-01T00:00:00.000Z',
    passwordUpdate: '2026-02-01T00:00:00.000Z',
    mustChangePassword: true,
  },
];

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirmMock.mockResolvedValue(true);
    mockCurrentUser = { $id: 'admin-1', labels: ['admin'] };
    listUsersMock.mockResolvedValue(sampleUsers);
  });

  it('shows a restricted-access message for non-admin users', async () => {
    mockCurrentUser = { $id: 'user-2', labels: ['comunero'] };

    render(<UserManagement />);

    expect(await screen.findByText(/Acceso restringido/i)).toBeInTheDocument();
    expect(screen.getByText(/Solo un administrador puede crear o gestionar usuarios/i)).toBeInTheDocument();
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('loads and displays the user list for an admin', async () => {
    render(<UserManagement />);

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
    expect(screen.getByText(/Pendiente cambio de contraseña/i)).toBeInTheDocument();
  });

  it('creates a new user with the form data and shows the temporary credentials', async () => {
    createUserMock.mockResolvedValueOnce({
      id: 'new-1',
      name: 'Nueva Persona',
      email: 'nueva@cbgest.com',
      labels: ['comunero'],
      status: true,
      registration: '',
      passwordUpdate: '',
      mustChangePassword: true,
    });

    render(<UserManagement />);
    await screen.findByText('Juan Pérez');

    fireEvent.change(screen.getByLabelText(/Nombre completo/i), { target: { value: 'Nueva Persona' } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: 'nueva@cbgest.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Usuario/i }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        'nueva@cbgest.com',
        'Nueva Persona',
        expect.stringMatching(/^cambiar\d+$/),
        ['comunero']
      );
    });

    expect(await screen.findByText(/Comunica estas credenciales al usuario/i)).toBeInTheDocument();
    expect(screen.getByText('nueva@cbgest.com')).toBeInTheDocument();
  });

  it('resets a user password when confirmed', async () => {
    resetPasswordMock.mockResolvedValueOnce(undefined);

    render(<UserManagement />);
    await screen.findByText('Juan Pérez');

    fireEvent.click(screen.getAllByRole('button', { name: /Restablecer contraseña/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalled();
    });
  });

  it('deletes a user after confirmation, but disables deleting your own account', async () => {
    deleteUserMock.mockResolvedValueOnce(undefined);

    render(<UserManagement />);
    await screen.findByText('Juan Pérez');

    const deleteButtons = screen.getAllByTitle(/Eliminar usuario|No puedes eliminar tu propia cuenta/i);
    // The first user in the list is the current admin — deletion must be disabled.
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();

    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      expect(showConfirmMock).toHaveBeenCalled();
      expect(deleteUserMock).toHaveBeenCalledWith('comunero-1');
    });
  });
});
