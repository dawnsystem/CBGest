/**
 * @fileoverview Tests de `BankReconciliation`.
 * @description Verifica que el modo solo lectura deshabilita las acciones
 *              mutadoras de conciliación y creación de asientos.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BankReconciliation } from '../BankReconciliation';
import type { AccountingEntry, BankTransaction } from '../../types';

describe('BankReconciliation', () => {
  it('deshabilita crear asiento y casar cuando isReadOnly es true', () => {
    const onReconcile = vi.fn();
    const onCreateEntryFromTransaction = vi.fn();
    const transaction: BankTransaction = {
      id: 'tx-1',
      date: '2026-01-15',
      concept: 'Pago proveedor',
      amount: -120,
      status: 'PENDING',
    };
    const entry: AccountingEntry = {
      id: 'entry-1',
      date: '2026-01-15',
      concept: 'Factura proveedor',
      lines: [
        { accountCode: '600', debit: 120, credit: 0 },
        { accountCode: '410', debit: 0, credit: 120 },
      ],
      reconciled: false,
      isDraft: false,
      debit: 120,
      credit: 120,
    };

    render(
      <BankReconciliation
        transactions={[transaction]}
        entries={[entry]}
        invoices={[]}
        suppliers={[]}
        recurringExpenses={[]}
        isReadOnly={true}
        onReconcile={onReconcile}
        onCreateEntryFromTransaction={onCreateEntryFromTransaction}
      />
    );

    fireEvent.click(screen.getByText('Pago proveedor'));

    const createEntryButton = screen.getByRole('button', { name: /crear asiento/i });
    const reconcileButton = screen.getByRole('button', { name: /casar/i });

    expect(createEntryButton).toBeDisabled();
    expect(reconcileButton).toBeDisabled();

    fireEvent.click(createEntryButton);
    fireEvent.click(reconcileButton);

    expect(onCreateEntryFromTransaction).not.toHaveBeenCalled();
    expect(onReconcile).not.toHaveBeenCalled();
  });
});
