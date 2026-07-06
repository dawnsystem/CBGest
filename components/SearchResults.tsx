import React, { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BookOpen, Building2, CalendarCheck, FileText, Home, Search } from 'lucide-react';
import type { AccountingEntry, Apartment, Invoice, Reservation, Supplier } from '../types';
import { getEntryLines } from '../types';

interface SearchResultsProps {
  invoices: Invoice[];
  accountingEntries: AccountingEntry[];
  suppliers: Supplier[];
  apartments: Apartment[];
  reservations: Reservation[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

const includesTerm = (term: string, values: Array<string | number | undefined>): boolean =>
  values.some((value) => String(value ?? '').toLowerCase().includes(term));

export const SearchResults: React.FC<SearchResultsProps> = ({
  invoices,
  accountingEntries,
  suppliers,
  apartments,
  reservations,
}) => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const term = normalize(query);

  const results = useMemo(() => {
    if (!term) {
      return {
        invoices: [],
        accountingEntries: [],
        suppliers: [],
        apartments: [],
        reservations: [],
      };
    }

    return {
      invoices: invoices.filter((invoice) =>
        includesTerm(term, [
          invoice.number,
          invoice.issuerName,
          invoice.issuerNif,
          invoice.category,
          invoice.totalAmount,
          invoice.date,
        ])
      ),
      accountingEntries: accountingEntries.filter((entry) =>
        includesTerm(term, [
          entry.concept,
          entry.date,
          ...getEntryLines(entry).flatMap((line) => [line.accountCode, line.accountName]),
        ])
      ),
      suppliers: suppliers.filter((supplier) =>
        includesTerm(term, [supplier.name, supplier.nif, supplier.email, supplier.phone, supplier.category])
      ),
      apartments: apartments.filter((apartment) =>
        includesTerm(term, [apartment.name, apartment.code, apartment.address, apartment.cadastralRef])
      ),
      reservations: reservations.filter((reservation) =>
        includesTerm(term, [
          reservation.guestName,
          reservation.reservationNumber,
          reservation.apartmentName,
          reservation.channel,
          reservation.status,
        ])
      ),
    };
  }, [accountingEntries, apartments, invoices, reservations, suppliers, term]);

  const totalResults = Object.values(results).reduce((sum, entries) => sum + entries.length, 0);

  const sections = [
    { key: 'invoices', title: 'Facturas', icon: FileText, route: '/invoices', entries: results.invoices },
    { key: 'accountingEntries', title: 'Asientos', icon: BookOpen, route: '/books', entries: results.accountingEntries },
    { key: 'suppliers', title: 'Proveedores', icon: Building2, route: '/suppliers', entries: results.suppliers },
    { key: 'apartments', title: 'Apartamentos', icon: Home, route: '/apartments', entries: results.apartments },
    { key: 'reservations', title: 'Reservas', icon: CalendarCheck, route: '/reservations', entries: results.reservations },
  ] as const;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
          <Search className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Resultados de búsqueda</h2>
          <p className="text-sm text-slate-500">
            {term
              ? `${totalResults} resultado(s) para “${query}”`
              : 'Escribe un término en el buscador para localizar facturas, asientos y más.'}
          </p>
        </div>
      </div>

      {term && totalResults === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          No se encontraron coincidencias para <span className="font-semibold text-slate-700">“{query}”</span>.
        </div>
      )}

      {sections.map(({ key, title, icon: Icon, route, entries }) => (
        <section key={key} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Icon className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500">{entries.length} coincidencia(s)</p>
              </div>
            </div>
            <Link to={route} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Abrir sección
            </Link>
          </div>

          {entries.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {entries.slice(0, 5).map((entry, index) => (
                <li key={`${key}-${index}`} className="px-5 py-4 text-sm text-slate-700">
                  {key === 'invoices' && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{(entry as Invoice).issuerName} · {(entry as Invoice).number}</span>
                      <span className="text-slate-500">{(entry as Invoice).date} · {(entry as Invoice).totalAmount.toFixed(2)} €</span>
                    </div>
                  )}
                  {key === 'accountingEntries' && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{(entry as AccountingEntry).concept}</span>
                      <span className="text-slate-500">{(entry as AccountingEntry).date}</span>
                    </div>
                  )}
                  {key === 'suppliers' && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{(entry as Supplier).name}</span>
                      <span className="text-slate-500">{(entry as Supplier).nif}</span>
                    </div>
                  )}
                  {key === 'apartments' && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{(entry as Apartment).name}</span>
                      <span className="text-slate-500">{(entry as Apartment).code || (entry as Apartment).address || 'Sin referencia'}</span>
                    </div>
                  )}
                  {key === 'reservations' && (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{(entry as Reservation).guestName || 'Huésped sin nombre'} · {(entry as Reservation).reservationNumber}</span>
                      <span className="text-slate-500">{(entry as Reservation).apartmentName} · {(entry as Reservation).status}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-500">Sin coincidencias en esta sección.</div>
          )}
        </section>
      ))}
    </div>
  );
};

export default SearchResults;
