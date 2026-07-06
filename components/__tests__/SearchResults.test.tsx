import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { SearchResults } from '../SearchResults';
import type { AccountingEntry, Apartment, Invoice, Reservation, Supplier } from '../../types';

const invoices: Invoice[] = [{
  id: 'inv-1',
  number: 'F-100',
  date: '2026-07-01',
  issuerName: 'Proveedor Norte',
  issuerNif: 'B12345678',
  baseAmount: 100,
  vatRate: 21,
  vatAmount: 21,
  totalAmount: 121,
  type: 'EXPENSE',
  status: 'PROCESSED',
  history: [],
}];

const accountingEntries: AccountingEntry[] = [{
  id: 'entry-1',
  date: '2026-07-01',
  concept: 'Pago proveedor',
  lines: [{ accountCode: '410', accountName: 'Acreedores', debit: 0, credit: 121 }],
  reconciled: false,
}];

const suppliers: Supplier[] = [{
  id: 'sup-1',
  name: 'Proveedor Norte',
  nif: 'B12345678',
  nifType: 'CIF',
}];

const apartments: Apartment[] = [{
  id: 'apt-1',
  name: 'Ático Centro',
  code: 'ATC',
  apartmentType: 'TOURIST',
  isActive: true,
}];

const reservations: Reservation[] = [{
  id: 'res-1',
  apartmentId: 'apt-1',
  apartmentName: 'Ático Centro',
  checkIn: '2026-07-10',
  checkOut: '2026-07-15',
  nights: 5,
  pricePerNight: 100,
  guestName: '',
  reservationNumber: 'RSV-001',
  channel: 'Booking',
  status: 'Confirmed',
  totalAmount: 500,
  paidAmount: 500,
  numberOfGuests: 2,
  numberOfChildren: 0,
  touristTaxCollected: false,
  touristTaxAmount: 0,
  touristTaxNightsCounted: 0,
  depositAmount: 0,
  depositCollected: false,
  depositReturned: false,
  depositRetainedAmount: 0,
}];

describe('SearchResults', () => {
  it('should show guidance when there is no query', () => {
    render(
      <MemoryRouter initialEntries={['/search']}>
        <SearchResults
          invoices={invoices}
          accountingEntries={accountingEntries}
          suppliers={suppliers}
          apartments={apartments}
          reservations={reservations}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Escribe un término en el buscador/i)).toBeInTheDocument();
  });

  it('should show matching records across sections', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=proveedor']}>
        <SearchResults
          invoices={invoices}
          accountingEntries={accountingEntries}
          suppliers={suppliers}
          apartments={apartments}
          reservations={reservations}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/3 resultado\(s\) para/u)).toBeInTheDocument();
    expect(screen.getAllByText(/Proveedor Norte/u)).toHaveLength(2);
  });

  it('should show empty state when there are no matches', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=inexistente']}>
        <SearchResults
          invoices={invoices}
          accountingEntries={accountingEntries}
          suppliers={suppliers}
          apartments={apartments}
          reservations={reservations}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/No se encontraron coincidencias/u)).toBeInTheDocument();
  });
});
