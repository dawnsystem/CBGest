/**
 * @fileoverview Tests de persistencia del ejercicio fiscal activo
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getFiscalYearStorageKey,
  isFiscalYearStorageKey,
  loadStoredFiscalYearPreference,
  saveStoredFiscalYearPreference,
  resolveFiscalYearFromPreference,
} from '../fiscalYearPersistence';
import type { FiscalYear } from '../../types';

const USER_ID = 'user-abc-123';

const makeYear = (year: number, id: string): FiscalYear => ({
  id,
  year,
  status: 'OPEN',
  appwriteId: `aw-${id}`,
});

describe('fiscalYearPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('genera clave por usuario', () => {
    expect(getFiscalYearStorageKey(USER_ID)).toBe(`gestcb_active_fy_${USER_ID}`);
  });

  it('identifica claves de ejercicio fiscal', () => {
    expect(isFiscalYearStorageKey('gestcb_active_fy_user1')).toBe(true);
    expect(isFiscalYearStorageKey('gestcb_active_fiscal_year_id')).toBe(true);
    expect(isFiscalYearStorageKey('gestcb_settings')).toBe(false);
  });

  it('guarda y carga preferencia con año', () => {
    const fy = makeYear(2027, 'fy-2027');
    saveStoredFiscalYearPreference(USER_ID, fy);

    const stored = loadStoredFiscalYearPreference(USER_ID);
    expect(stored?.id).toBe('fy-2027');
    expect(stored?.year).toBe(2027);
    expect(stored?.lastUsedAt).toBeTruthy();
    expect(localStorage.getItem('gestcb_active_fiscal_year_id')).toBeNull();
  });

  it('migra clave legacy de solo ID', () => {
    localStorage.setItem('gestcb_active_fiscal_year_id', 'legacy-id');
    const stored = loadStoredFiscalYearPreference(USER_ID);
    expect(stored?.id).toBe('legacy-id');
    expect(stored?.year).toBe(0);
  });

  it('resuelve por ID exacto', () => {
    const years = [makeYear(2028, 'fy-2028'), makeYear(2027, 'fy-2027')];
    saveStoredFiscalYearPreference(USER_ID, years[1]);

    const resolved = resolveFiscalYearFromPreference(years, USER_ID);
    expect(resolved?.year).toBe(2027);
  });

  it('resuelve por año calendario si el ID cambió', () => {
    const years = [makeYear(2028, 'fy-2028-new'), makeYear(2027, 'fy-2027-new')];
    saveStoredFiscalYearPreference(USER_ID, makeYear(2027, 'fy-2027-old'));

    const resolved = resolveFiscalYearFromPreference(years, USER_ID);
    expect(resolved?.year).toBe(2027);
  });

  it('devuelve null sin preferencia guardada', () => {
    const years = [makeYear(2028, 'fy-2028')];
    expect(resolveFiscalYearFromPreference(years, USER_ID)).toBeNull();
  });
});
